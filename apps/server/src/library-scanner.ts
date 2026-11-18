import path from "node:path";
import { or } from "@prisma/orm-sqlite/orm-client";
import type { TrackMediaTypeOrigin } from "@peridot/contracts";
import { pruneReferencedArtwork, type ArtworkCache } from "./artwork-cache.js";
import {
  PluginError,
  type PluginSourceAdapter,
  type PluginSourceHandle,
  type PluginTrackRecord,
} from "@peridot/plugin-sdk";
import {
  normalizeArtistCredits,
  normalizeOptionalArtistCredits,
  serializeArtistCredits,
} from "./artist-credits.js";
import {
  externalCoverKey,
  hasPendingArtworkJobs,
  syncArtworkJob,
} from "./artwork-fetch.js";
import type { CatalogService } from "./catalog.js";
import type { Database } from "./database.js";
import { serializeGenres } from "./genres.js";
import type { MetadataEnrichment } from "./metadata-enrichment.js";
import { detectMediaType } from "./media-classification.js";
import {
  collectionFallbackTitle,
  mediaType,
  parsePublishedAt,
} from "./media.js";
import { message } from "./messages.js";
import type { PluginService } from "./plugins.js";
import type { SourceRow, TaskRow, TrackRow } from "./prisma/models.js";
import {
  type ScanWorkerCover,
  type ScanWorkerMetadata,
} from "./scan-worker-protocol.js";
import { ScanWorkerPool } from "./scan-worker-pool.js";
import { readScanWorkerSettings } from "./server-settings.js";
import {
  queueArtworkFetch,
  queueMetadataFetch,
  scanDetails,
  TaskExecutionError,
  type TaskExecutionResult,
  type TaskService,
} from "./tasks.js";

const CURRENT_METADATA_VERSION = 8;
const PROGRESS_WRITE_INTERVAL_MS = 250;
const EVENT_LOOP_YIELD_INTERVAL_MS = 25;
const PLUGIN_PREPARE_CONCURRENCY = 6;

interface DiscoveredFile {
  absolutePath: string;
  relativePath: string;
  mimeType: string;
  size: bigint;
  modifiedAt: Date;
}

interface SourceFile extends DiscoveredFile {
  sourceId: string;
}

interface PluginSourceWork {
  source: SourceRow;
  adapter: PluginSourceAdapter;
  handle: PluginSourceHandle;
}

interface RemoteSourceItem {
  source: PluginSourceWork;
  item: PluginTrackRecord;
}

interface ScanCounts {
  createdCount: number;
  updatedCount: number;
  unchangedCount: number;
  errorCount: number;
}

interface CoverImage {
  data: Buffer;
  mimeType: string;
}

type PreparedFile =
  | {
      kind: "unchanged";
      file: SourceFile;
      existing: TrackRow;
      wasUnavailable: boolean;
    }
  | {
      kind: "parsed";
      file: SourceFile;
      existing: TrackRow | null;
      metadata: ScanWorkerMetadata;
    }
  | {
      kind: "failed";
      file: SourceFile;
      existing: TrackRow | null;
    };

type PreparedRemoteItem =
  | {
      kind: "unchanged";
      remote: RemoteSourceItem;
      existing: TrackRow;
    }
  | {
      kind: "changed";
      remote: RemoteSourceItem;
      existing: TrackRow | null;
      coverKey: string | null;
      queueArtwork: boolean;
    }
  | {
      kind: "failed";
      remote: RemoteSourceItem;
      existing: TrackRow | null;
    };

function trackMediaTypeOrigin(value: string): TrackMediaTypeOrigin {
  return value === "source" || value === "embedded" ? value : "fallback";
}

function positiveInteger(value: number | null | undefined): number | null {
  return value !== null &&
    value !== undefined &&
    Number.isInteger(value) &&
    value > 0
    ? value
    : null;
}

function scanFailureSummary(error: unknown): string {
  return error instanceof Error && /database is locked/i.test(error.message)
    ? "The local library database was busy during the scan. Try again."
    : "The library scan failed while reading the configured root.";
}

function throwIfAborted(signal: AbortSignal): void {
  if (signal.aborted) {
    throw new DOMException("The library scan was stopped.", "AbortError");
  }
}

async function discoverAudioFiles(
  root: string,
  workerPool: ScanWorkerPool,
  workerCount: number,
  signal: AbortSignal,
): Promise<DiscoveredFile[]> {
  const files: DiscoveredFile[] = [];
  const directories = [root];
  let cursor = 0;
  while (cursor < directories.length) {
    throwIfAborted(signal);
    const batch = directories.slice(cursor, cursor + workerCount);
    cursor += batch.length;
    const results = await Promise.all(
      batch.map((directory) => workerPool.listDirectory(directory)),
    );
    for (const result of results) {
      directories.push(...result.directories);
      for (const file of result.audioFiles) {
        files.push({
          absolutePath: file.absolutePath,
          relativePath: path.relative(root, file.absolutePath),
          mimeType: file.mimeType,
          size: BigInt(file.size),
          modifiedAt: new Date(file.modifiedAtMs),
        });
      }
    }
    await new Promise<void>((resolve) => setImmediate(resolve));
  }
  return files;
}

function coverImage(cover: ScanWorkerCover | null): CoverImage | null {
  return cover
    ? {
        data: Buffer.from(cover.data),
        mimeType: cover.mimeType,
      }
    : null;
}

function remoteCoverKey(item: PluginTrackRecord): string | null {
  return item.cover
    ? externalCoverKey(item.cover.itemId, item.cover.tag)
    : null;
}

async function* prepareFiles(
  scanner: LibraryScanner,
  files: readonly SourceFile[],
  workerPool: ScanWorkerPool,
  concurrency: number,
  signal: AbortSignal,
): AsyncGenerator<PreparedFile> {
  let nextFile = 0;
  const pending = new Map<number, Promise<PreparedFile>>();
  while (nextFile < files.length || pending.size) {
    throwIfAborted(signal);
    while (nextFile < files.length && pending.size < Math.max(1, concurrency)) {
      const index = nextFile;
      const file = files[nextFile++];
      if (!file) break;
      pending.set(
        index,
        scanner.prepareFile(file, workerPool, signal).catch((error) => {
          if (signal.aborted) throw error;
          return {
            kind: "failed",
            file,
            existing: null,
          } satisfies PreparedFile;
        }),
      );
      await new Promise<void>((resolve) => setImmediate(resolve));
    }
    if (!pending.size) break;
    const completed = await Promise.race(
      [...pending].map(async ([index, promise]) => ({
        index,
        prepared: await promise,
      })),
    );
    pending.delete(completed.index);
    yield completed.prepared;
    if (signal.aborted) return;
  }
}

function shouldYield(lastYieldAt: number): boolean {
  return Date.now() - lastYieldAt >= EVENT_LOOP_YIELD_INTERVAL_MS;
}

async function yieldToEventLoop(): Promise<void> {
  await new Promise<void>((resolve) => setImmediate(resolve));
}

export class LibraryScanner {
  constructor(
    private readonly database: Database,
    private readonly metadataEnrichment?: MetadataEnrichment,
    private readonly catalog?: CatalogService,
    private readonly plugins?: PluginService,
    private readonly artworkCache?: ArtworkCache,
  ) {}

  async prepareFile(
    file: SourceFile,
    workerPool: ScanWorkerPool,
    signal: AbortSignal,
  ): Promise<PreparedFile> {
    throwIfAborted(signal);
    const existing = await this.database.orm.Track.where({
      sourceId: file.sourceId,
      relativePath: file.relativePath,
    }).first();
    const fileUnchanged =
      existing?.fileSizeBytes === file.size &&
      existing.fileModifiedAt.getTime() === file.modifiedAt.getTime() &&
      existing.metadataVersion >= CURRENT_METADATA_VERSION;
    if (existing && fileUnchanged) {
      return {
        kind: "unchanged",
        file,
        existing,
        wasUnavailable: !existing.available,
      };
    }
    try {
      return {
        kind: "parsed",
        file,
        existing,
        metadata: await workerPool.parseFile(file.absolutePath),
      };
    } catch (error) {
      if (signal.aborted) throw error;
      return { kind: "failed", file, existing };
    }
  }

  async runTask(
    task: TaskRow,
    tasks: TaskService,
    signal: AbortSignal,
  ): Promise<TaskExecutionResult> {
    const counts: ScanCounts = {
      createdCount: 0,
      updatedCount: 0,
      unchangedCount: 0,
      errorCount: 0,
    };
    let workerPool: ScanWorkerPool | undefined;
    let closeWorkersOnAbort: (() => void) | undefined;

    try {
      throwIfAborted(signal);
      const { workerCount } = await readScanWorkerSettings(this.database);
      const activeWorkerPool = new ScanWorkerPool(workerCount);
      workerPool = activeWorkerPool;
      closeWorkersOnAbort = () => {
        void activeWorkerPool.close();
      };
      signal.addEventListener("abort", closeWorkersOnAbort, { once: true });
      let requestedSource: SourceRow | undefined;
      if (task.sourceId) {
        const source = await this.database.orm.Source.first({
          id: task.sourceId,
        });
        if (!source || (source.kind !== "path" && source.kind !== "plugin")) {
          throw new TaskExecutionError(
            "The selected music source is no longer available.",
            "failed",
            message("api.message.sourceUnavailable"),
          );
        }
        requestedSource = source;
      }
      const sourceQuery = this.database.orm.Source.orderBy([
        (source) => source.position.asc(),
        (source) => source.createdAt.asc(),
      ]);
      const installedPlugins = new Set(
        (await this.plugins?.installedDefinitions())?.map(
          (definition) => definition.manifest.id,
        ) ?? [],
      );
      const sources = requestedSource
        ? [requestedSource]
        : (await sourceQuery.all()).filter(
            (source) =>
              source.kind === "path" ||
              (source.kind === "plugin" &&
                Boolean(
                  source.pluginId && installedPlugins.has(source.pluginId),
                )),
          );
      if (sources.length === 0) {
        throw new TaskExecutionError(
          "No music library sources are configured.",
          "failed",
          message("api.message.noSources"),
        );
      }
      const sourceName =
        requestedSource?.name ||
        (requestedSource ? task.sourceName : null) ||
        "All sources";
      const files: SourceFile[] = [];
      const pluginSources: PluginSourceWork[] = [];
      for (const source of sources) {
        throwIfAborted(signal);
        if (source.kind === "path") {
          if (!source.path) {
            throw new TaskExecutionError(
              "The selected music source is no longer available.",
              "failed",
              message("api.message.sourceUnavailable"),
            );
          }
          for (const file of await discoverAudioFiles(
            source.path,
            activeWorkerPool,
            workerCount,
            signal,
          )) {
            files.push({
              ...file,
              sourceId: source.id,
            });
          }
          continue;
        }
        if (!this.plugins || source.kind !== "plugin" || !source.pluginId) {
          throw new TaskExecutionError(
            "The selected plugin source is not fully configured.",
            "failed",
            message("api.message.sourceUnavailable"),
          );
        }
        const adapter = await this.plugins.sourceAdapter(source);
        if (!adapter) {
          throw new TaskExecutionError(
            "The selected plugin source is not available.",
            "failed",
            message("api.message.sourceUnavailable"),
          );
        }
        pluginSources.push({
          source,
          adapter,
          handle: this.plugins.sourceHandle(source),
        });
      }
      let discoveredCount = files.length;
      let progressTotal: number | null = pluginSources.length
        ? null
        : discoveredCount;
      let processedItems = 0;
      let unsupportedCount = 0;
      let completedRemoteTotal = 0;
      let lastProgressAt = 0;
      let lastYieldAt = Date.now();
      const updateProgress = async (force = false) => {
        if (
          !force &&
          Date.now() - lastProgressAt < PROGRESS_WRITE_INTERVAL_MS
        ) {
          return;
        }
        lastProgressAt = Date.now();
        await tasks.updateProgress(
          task.id,
          processedItems,
          progressTotal,
          scanDetails({
            source: sourceName,
            discovered: discoveredCount,
            created: counts.createdCount,
            updated: counts.updatedCount,
            unchanged: counts.unchangedCount,
            unavailable: 0,
            errors: counts.errorCount + unsupportedCount,
          }),
        );
      };
      await updateProgress(true);

      const pendingFiles = prepareFiles(
        this,
        files,
        activeWorkerPool,
        workerCount,
        signal,
      );
      for await (const prepared of pendingFiles) {
        throwIfAborted(signal);
        await this.applyPreparedFile(prepared, task.id, counts, signal);
        processedItems += 1;
        if (shouldYield(lastYieldAt)) {
          await yieldToEventLoop();
          lastYieldAt = Date.now();
        }
        await updateProgress();
      }
      await updateProgress(true);
      for (const source of pluginSources) {
        throwIfAborted(signal);
        let sourceTotal: number | null = null;
        let sourceProcessed = 0;
        await source.adapter.scan({
          source: source.handle,
          signal,
          onPage: async (page) => {
            throwIfAborted(signal);
            sourceTotal = page.totalCount ?? sourceTotal;
            sourceProcessed = page.processedCount;
            unsupportedCount += page.unsupportedCount;
            processedItems += page.unsupportedCount;
            discoveredCount =
              files.length +
              completedRemoteTotal +
              (sourceTotal ?? page.processedCount);
            progressTotal = discoveredCount;
            await updateProgress(true);

            for await (const prepared of this.prepareRemoteItems(
              page.items.map((item) => ({ source, item })),
              signal,
            )) {
              throwIfAborted(signal);
              await this.applyPreparedRemoteItem(prepared, task.id, counts);
              processedItems += 1;
              if (shouldYield(lastYieldAt)) {
                await yieldToEventLoop();
                lastYieldAt = Date.now();
              }
              await updateProgress();
            }
            await updateProgress(true);
          },
        });
        completedRemoteTotal += sourceTotal ?? sourceProcessed;
        discoveredCount = files.length + completedRemoteTotal;
      }
      throwIfAborted(signal);
      await this.removeUnusedCovers();
      if (this.artworkCache) {
        await pruneReferencedArtwork(this.database, this.artworkCache);
      }

      const trackQuery = this.database.orm.Track.where({ available: 1 }).where(
        (track) => track.sourceId.in(sources.map((source) => source.id)),
      );
      const unavailableTracks = await trackQuery
        .where((track) =>
          or(track.lastSeenScanId.isNull(), track.lastSeenScanId.neq(task.id)),
        )
        .all();
      for (const track of unavailableTracks) {
        await this.database.orm.Track.where({ id: track.id }).update({
          available: 0,
        });
        await this.database.orm.ArtworkJob.where({
          trackId: track.id,
        }).deleteAndCount();
        await this.catalog?.reindexTrack(track.id, "scan");
        if (shouldYield(lastYieldAt)) {
          await yieldToEventLoop();
          lastYieldAt = Date.now();
        }
      }
      const syncedAt = new Date();
      for (const source of sources) {
        await this.database.orm.Source.where({ id: source.id }).update({
          lastSyncedAt: syncedAt,
        });
      }

      const musicTrack = await this.database.orm.Track.where({
        available: 1,
        mediaType: "music",
      })
        .where((track) => track.sourceId.in(sources.map((source) => source.id)))
        .first();
      if (this.metadataEnrichment && musicTrack) {
        await queueMetadataFetch(tasks, {
          source: requestedSource
            ? {
                id: requestedSource.id,
                name: requestedSource.name || "Library source",
              }
            : null,
          parentTaskId: task.id,
        });
      }
      if (
        await hasPendingArtworkJobs(this.database, requestedSource?.id ?? null)
      ) {
        await queueArtworkFetch(tasks, {
          source: requestedSource
            ? {
                id: requestedSource.id,
                name: requestedSource.name || "Library source",
              }
            : null,
          parentTaskId: task.id,
        });
      }
      await this.catalog?.flushChanges();
      return {
        details: scanDetails({
          source: sourceName,
          discovered: discoveredCount,
          created: counts.createdCount,
          updated: counts.updatedCount,
          unchanged: counts.unchangedCount,
          unavailable: unavailableTracks.length,
          errors: counts.errorCount + unsupportedCount,
        }),
      };
    } catch (error) {
      if (signal.aborted) {
        throw new TaskExecutionError(
          "Stopped by an administrator.",
          "stopped",
          message("api.message.taskStopped"),
        );
      }
      if (error instanceof TaskExecutionError) throw error;
      if (error instanceof PluginError) {
        throw new TaskExecutionError(
          error.message,
          "failed",
          error.messageDescriptor,
        );
      }
      const databaseBusy =
        error instanceof Error && /database is locked/i.test(error.message);
      throw new TaskExecutionError(
        scanFailureSummary(error),
        "failed",
        message(
          databaseBusy ? "api.message.databaseBusy" : "api.message.scanFailed",
        ),
      );
    } finally {
      if (closeWorkersOnAbort) {
        signal.removeEventListener("abort", closeWorkersOnAbort);
      }
      await workerPool?.close();
    }
  }

  private async applyPreparedFile(
    prepared: PreparedFile,
    scanId: string,
    counts: ScanCounts,
    signal: AbortSignal,
  ): Promise<void> {
    throwIfAborted(signal);
    if (prepared.kind === "unchanged") {
      await this.database.orm.Track.where({ id: prepared.existing.id }).update({
        available: 1,
        lastSeenScanId: scanId,
      });
      if (prepared.wasUnavailable) {
        await this.catalog?.reindexTrack(prepared.existing.id, "scan");
      }
      counts.unchangedCount += 1;
      return;
    }

    if (prepared.kind === "failed") {
      counts.errorCount += 1;
      if (prepared.existing) {
        await this.markFileError(prepared.file, prepared.existing, scanId);
      }
      return;
    }

    const { file, existing, metadata } = prepared;
    try {
      if (!metadata.container) {
        throw new Error("Audio format was not recognized");
      }
      const title =
        metadata.title?.trim() || path.parse(file.relativePath).name;
      const artistCredits = normalizeArtistCredits(
        metadata.artists.length ? metadata.artists : [metadata.artist],
      );
      const artist = artistCredits.join(", ");
      const albumArtistCredits = normalizeOptionalArtistCredits(
        metadata.albumArtists.length
          ? metadata.albumArtists
          : [metadata.albumArtist],
      );
      const detected = detectMediaType({
        extension: path.extname(file.relativePath),
        podcast: metadata.podcast,
        podcastId: metadata.podcastId,
        podcastUrl: metadata.podcastUrl,
        releaseTypes: metadata.releaseTypes,
        iTunesMediaType: metadata.iTunesMediaType,
      });
      const creatorCredits =
        detected.mediaType !== "music" && albumArtistCredits.length === 0
          ? artistCredits
          : albumArtistCredits;
      const albumArtist = creatorCredits.length
        ? creatorCredits.join(", ")
        : null;
      const album =
        metadata.album?.trim() ||
        (detected.mediaType === "music"
          ? null
          : collectionFallbackTitle(file.relativePath));
      const genres = serializeGenres(metadata.genres);
      const discNumber = positiveInteger(metadata.discNumber);
      const trackNumber = positiveInteger(metadata.trackNumber);
      const durationMs =
        metadata.durationSeconds !== null &&
        Number.isFinite(metadata.durationSeconds)
          ? Math.round(metadata.durationSeconds * 1000)
          : null;
      const taggedPublishedAt = parsePublishedAt(
        metadata.releasedate,
        metadata.originaldate,
        metadata.date,
        metadata.year,
      );
      const publishedAt =
        taggedPublishedAt ??
        (detected.mediaType === "podcast" ? file.modifiedAt : null);
      const coverId = await this.storeCover(coverImage(metadata.cover));

      const trackData = {
        mediaType: detected.mediaType,
        mediaTypeOrigin: detected.origin,
        title,
        artist,
        artistCredits: serializeArtistCredits(artistCredits),
        albumArtist,
        albumArtistCredits: creatorCredits.length
          ? JSON.stringify(creatorCredits)
          : null,
        album,
        genres,
        discNumber,
        trackNumber,
        durationMs,
        publishedAt,
        coverId,
        mimeType: file.mimeType,
        fileSizeBytes: file.size,
        fileModifiedAt: file.modifiedAt,
        available: 1,
        lastSeenScanId: scanId,
        metadataVersion: CURRENT_METADATA_VERSION,
      };
      if (existing) {
        await this.database.orm.Track.where({ id: existing.id }).update(
          trackData,
        );
        await this.catalog?.reindexTrack(existing.id, "scan");
        counts.updatedCount += 1;
      } else {
        const created = await this.database.orm.Track.create({
          ...trackData,
          relativePath: file.relativePath,
          sourceId: file.sourceId,
        });
        await this.catalog?.reindexTrack(created.id, "scan");
        counts.createdCount += 1;
      }
    } catch (error) {
      if (signal.aborted) throw error;
      counts.errorCount += 1;
      if (existing) {
        await this.markFileError(file, existing, scanId);
      }
    }
  }

  private async markFileError(
    file: SourceFile,
    existing: TrackRow,
    scanId: string,
  ): Promise<void> {
    try {
      await this.database.orm.Track.where({ id: existing.id }).update({
        fileSizeBytes: file.size,
        fileModifiedAt: file.modifiedAt,
        available: 1,
        lastSeenScanId: scanId,
      });
      await this.catalog?.reindexTrack(existing.id, "scan");
    } catch {
      // The file remains counted as an error if even the fallback write
      // cannot acquire SQLite's write lock.
    }
  }

  private async *prepareRemoteItems(
    remoteItems: readonly RemoteSourceItem[],
    signal: AbortSignal,
  ): AsyncGenerator<PreparedRemoteItem> {
    let nextIndex = 0;
    const pending = new Map<number, Promise<PreparedRemoteItem>>();
    while (nextIndex < remoteItems.length || pending.size) {
      throwIfAborted(signal);
      let startedAny = false;
      while (
        nextIndex < remoteItems.length &&
        pending.size < PLUGIN_PREPARE_CONCURRENCY
      ) {
        const index = nextIndex;
        const remote = remoteItems[nextIndex++];
        if (!remote) break;
        pending.set(index, this.prepareRemoteItem(remote, signal));
        startedAny = true;
      }
      if (startedAny) await yieldToEventLoop();
      if (!pending.size) break;
      const completed = await Promise.race(
        [...pending].map(async ([index, promise]) => ({
          index,
          prepared: await promise,
        })),
      );
      pending.delete(completed.index);
      yield completed.prepared;
      if (signal.aborted) return;
    }
  }

  private async prepareRemoteItem(
    remote: RemoteSourceItem,
    signal: AbortSignal,
  ): Promise<PreparedRemoteItem> {
    const { source, item } = remote;
    let existing: TrackRow | null = null;
    try {
      throwIfAborted(signal);
      existing = await this.database.orm.Track.where({
        sourceId: source.source.id,
        externalId: item.externalId,
      }).first();
      const coverKey = remoteCoverKey(item);
      const unchanged =
        existing?.externalVersion === item.externalVersion &&
        existing.metadataVersion >= CURRENT_METADATA_VERSION &&
        mediaType(existing.mediaType) === item.mediaType &&
        trackMediaTypeOrigin(existing.mediaTypeOrigin) === item.mediaTypeOrigin;
      if (existing && unchanged) {
        return { kind: "unchanged", remote, existing };
      }

      const existingCoverUsable = Boolean(
        existing?.coverId &&
        (existing.externalCoverKey === null ||
          existing.externalCoverKey === coverKey),
      );
      return {
        kind: "changed",
        remote,
        existing,
        coverKey,
        queueArtwork: Boolean(coverKey && !existingCoverUsable),
      };
    } catch (error) {
      if (signal.aborted) throw error;
      return { kind: "failed", remote, existing };
    }
  }

  private async applyPreparedRemoteItem(
    prepared: PreparedRemoteItem,
    scanId: string,
    counts: ScanCounts,
  ): Promise<void> {
    const { remote } = prepared;
    const { source, item } = remote;
    if (prepared.kind === "unchanged") {
      const wasUnavailable = !prepared.existing.available;
      const coverKey = remoteCoverKey(item);
      await this.database.orm.Track.where({ id: prepared.existing.id }).update({
        available: 1,
        lastSeenScanId: scanId,
        ...(prepared.existing.coverId &&
        prepared.existing.externalCoverKey === null &&
        coverKey
          ? { externalCoverKey: coverKey }
          : {}),
      });
      if (wasUnavailable) {
        await this.catalog?.reindexTrack(prepared.existing.id, "scan");
      }
      counts.unchangedCount += 1;
      return;
    }

    if (prepared.kind === "failed") {
      counts.errorCount += 1;
      if (prepared.existing) {
        try {
          await this.database.orm.Track.where({
            id: prepared.existing.id,
          }).update({
            fileSizeBytes: item.fileSizeBytes,
            fileModifiedAt: item.fileModifiedAt,
            externalVersion: item.externalVersion,
            available: 1,
            lastSeenScanId: scanId,
          });
          await this.catalog?.reindexTrack(prepared.existing.id, "scan");
        } catch {
          // Preserve the error count when the fallback write also fails.
        }
      }
      return;
    }

    const { coverKey, queueArtwork } = prepared;
    const coverId = coverKey ? (prepared.existing?.coverId ?? null) : null;

    const artistCredits = normalizeArtistCredits(
      item.artists.length ? item.artists : ["Unknown artist"],
    );
    const itemAlbumArtists = normalizeOptionalArtistCredits(item.albumArtists);
    const albumArtists =
      item.mediaType !== "music" && itemAlbumArtists.length === 0
        ? artistCredits
        : itemAlbumArtists;
    const trackData = {
      mediaType: item.mediaType,
      mediaTypeOrigin: item.mediaTypeOrigin,
      relativePath: item.relativePath,
      title: item.title,
      artist: artistCredits.join(", "),
      artistCredits: serializeArtistCredits(artistCredits),
      albumArtist: albumArtists.length ? albumArtists.join(", ") : null,
      albumArtistCredits: albumArtists.length
        ? JSON.stringify(albumArtists)
        : null,
      album: item.album,
      genres: serializeGenres(item.genres),
      discNumber: item.discNumber,
      trackNumber: item.trackNumber,
      durationMs: item.durationMs,
      publishedAt: item.publishedAt ?? parsePublishedAt(item.fileModifiedAt),
      coverId,
      mimeType: item.mimeType,
      fileSizeBytes: item.fileSizeBytes,
      fileModifiedAt: item.fileModifiedAt,
      externalId: item.externalId,
      externalVersion: item.externalVersion,
      externalContainer: item.container,
      externalCoverKey: coverKey,
      available: 1,
      lastSeenScanId: scanId,
      metadataVersion: CURRENT_METADATA_VERSION,
    };
    if (prepared.existing) {
      await this.database.orm.Track.where({ id: prepared.existing.id }).update(
        trackData,
      );
      await this.catalog?.reindexTrack(prepared.existing.id, "scan");
      counts.updatedCount += 1;
      if (queueArtwork) {
        await syncArtworkJob(this.database, {
          trackId: prepared.existing.id,
          sourceId: source.source.id,
          externalCoverItemId: item.cover?.itemId ?? null,
          externalCoverTag: item.cover?.tag ?? null,
        });
      } else if (!coverKey) {
        await syncArtworkJob(this.database, {
          trackId: prepared.existing.id,
          sourceId: source.source.id,
          externalCoverItemId: null,
          externalCoverTag: null,
        });
      }
    } else {
      const created = await this.database.orm.Track.create({
        ...trackData,
        sourceId: source.source.id,
      });
      await this.catalog?.reindexTrack(created.id, "scan");
      counts.createdCount += 1;
      if (queueArtwork) {
        await syncArtworkJob(this.database, {
          trackId: created.id,
          sourceId: source.source.id,
          externalCoverItemId: item.cover?.itemId ?? null,
          externalCoverTag: item.cover?.tag ?? null,
        });
      }
    }
  }

  private async storeCover(cover: CoverImage | null): Promise<string | null> {
    if (!cover || !this.artworkCache) return null;
    try {
      const hash = await this.artworkCache.store(cover.data);
      const existing = await this.database.orm.TrackCover.where({
        hash,
      }).first();
      const stored =
        existing ?? (await this.database.orm.TrackCover.create({ hash }));
      return stored.id;
    } catch {
      return null;
    }
  }

  private async removeUnusedCovers(): Promise<void> {
    const tracks = await this.database.orm.Track.where((track) =>
      track.coverId.isNotNull(),
    )
      .select("coverId")
      .all();
    const coverIds = [
      ...new Set(tracks.flatMap(({ coverId }) => (coverId ? [coverId] : []))),
    ];
    await (
      coverIds.length
        ? this.database.orm.TrackCover.where((cover) =>
            cover.id.notIn(coverIds),
          )
        : this.database.orm.TrackCover.where((cover) => cover.id.isNotNull())
    ).deleteAndCount();
  }
}
