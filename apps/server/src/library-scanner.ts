import path from "node:path";
import { lstat, realpath } from "node:fs/promises";
import { or } from "@prisma/orm-sqlite/orm-client";
import type { MediaTypeOrigin } from "@peridot/contracts";
import { pruneReferencedArtwork, type ArtworkCache } from "./artwork-cache.js";
import {
  normalizeArtistCredits,
  normalizeOptionalArtistCredits,
  serializeArtistCredits,
} from "./artist-credits.js";
import {
  externalCoverKey,
  hasPendingArtworkJobs,
  syncArtworkJobsInBatch,
  type ArtworkJobSyncInput,
} from "./artwork-fetch.js";
import type { CatalogService } from "./catalog.js";
import type { Database } from "./database.js";
import { serializeGenres } from "./genres.js";
import type { MetadataEnrichment } from "./metadata-enrichment.js";
import { detectMediaType } from "./media-classification.js";
import {
  refreshCanonicalMediaFromCopies,
  refreshCanonicalMediaFromCopiesBatch,
} from "./media-copies.js";
import { protectedAutomaticWrite } from "./media-overrides.js";
import {
  collectionFallbackTitle,
  mediaType,
  parsePublishedAt,
} from "./media.js";
import { message } from "./messages.js";
import type {
  LibrarySourceRow,
  MediaCopyRow,
  MediaRow,
  TaskRow,
} from "./prisma/models.js";
import { normalizeReleaseImportPath } from "./release-import-files.js";
import {
  AUDIO_MIME_TYPES,
  type ScanWorkerCover,
  type ScanWorkerMetadata,
} from "./scan-worker-protocol.js";
import { ScanWorkerPool } from "./scan-worker-pool.js";
import { readScanWorkerSettings } from "./server-settings.js";
import {
  localRecordingIdentityKeys,
  serializeRecordingIdentityKeys,
} from "./track-identities.js";
import {
  LibrarySourceConnectorError,
  type LibrarySourceConnectorDefinition,
  type LibrarySourceConnectorHandle,
  type LibrarySourceConnectorService,
  type LibrarySourceTrackRecord,
} from "./source-integrations.js";
import {
  queueArtworkFetch,
  queueCatalogProjection,
  queueMediaMatch,
  queueMetadataEnrichment,
  readReleaseImportTaskPayload,
  readTaskPayload,
  scanDetails,
  type ScanTimingMs,
  TaskExecutionError,
  type TaskExecutionResult,
  type TaskService,
} from "./tasks.js";

const CURRENT_METADATA_VERSION = 9;
const PROGRESS_WRITE_INTERVAL_MS = 250;
const EVENT_LOOP_YIELD_INTERVAL_MS = 25;
const IMPORT_BATCH_SIZE = 100;
const REMOTE_ARTWORK_CONCURRENCY = 6;

interface DiscoveredFile {
  absolutePath: string;
  relativePath: string;
  mimeType: string;
  size: bigint;
  modifiedAt: Date;
}

interface SourceFile extends DiscoveredFile {
  sourceId: string;
  sourceKind: "path" | "jellyfin";
}

interface IntegrationSourceWork {
  source: LibrarySourceRow;
  integration: LibrarySourceConnectorDefinition;
  handle: LibrarySourceConnectorHandle;
}

interface ScanCounts {
  createdCount: number;
  updatedCount: number;
  unchangedCount: number;
  errorCount: number;
}

interface TimingBucket {
  ms: number;
}

interface ScanTimings {
  discovery: TimingBucket;
  artwork: TimingBucket;
  database: TimingBucket;
  catalog: TimingBucket;
}

function createScanTimings(): ScanTimings {
  return {
    discovery: { ms: 0 },
    artwork: { ms: 0 },
    database: { ms: 0 },
    catalog: { ms: 0 },
  };
}

async function withTiming<T>(
  bucket: TimingBucket,
  operation: () => Promise<T>,
): Promise<T> {
  const startedAt = Date.now();
  try {
    return await operation();
  } finally {
    bucket.ms += Date.now() - startedAt;
  }
}

function scanTimingValues(timings: ScanTimings): ScanTimingMs {
  return {
    discoveryMs: timings.discovery.ms,
    artworkMs: timings.artwork.ms,
    databaseMs: timings.database.ms,
    catalogMs: timings.catalog.ms,
  };
}

interface CoverImage {
  data: Uint8Array;
  mimeType: string;
}

type PreparedFile =
  | {
      kind: "unchanged";
      file: SourceFile;
      existing: MediaCopyRow;
      media: MediaRow;
      wasUnavailable: boolean;
    }
  | {
      kind: "parsed";
      file: SourceFile;
      existing: MediaCopyRow | null;
      media: MediaRow | null;
      metadata: ScanWorkerMetadata;
    }
  | {
      kind: "failed";
      file: SourceFile;
      existing: MediaCopyRow | null;
      media: MediaRow | null;
    };

function trackMediaTypeOrigin(value: string): MediaTypeOrigin {
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

async function discoverReleaseImportFiles(
  root: string,
  relativePaths: readonly string[],
  signal: AbortSignal,
): Promise<{ files: DiscoveredFile[]; errorCount: number }> {
  const files: DiscoveredFile[] = [];
  const resolvedRoot = await realpath(root);
  let errorCount = 0;
  for (const value of relativePaths) {
    throwIfAborted(signal);
    const relativePath = normalizeReleaseImportPath(value);
    const mimeType = relativePath
      ? AUDIO_MIME_TYPES.get(path.extname(relativePath).toLowerCase())
      : undefined;
    if (!relativePath || !mimeType) {
      errorCount += 1;
      continue;
    }
    const absolutePath = path.resolve(resolvedRoot, relativePath);
    const pathWithinRoot = path.relative(resolvedRoot, absolutePath);
    if (
      pathWithinRoot === ".." ||
      pathWithinRoot.startsWith(`..${path.sep}`) ||
      path.isAbsolute(pathWithinRoot)
    ) {
      errorCount += 1;
      continue;
    }
    try {
      const fileStat = await lstat(absolutePath, { bigint: true });
      if (!fileStat.isFile() || fileStat.isSymbolicLink()) {
        errorCount += 1;
        continue;
      }
      const resolvedFile = await realpath(absolutePath);
      const resolvedRelativePath = path.relative(resolvedRoot, resolvedFile);
      if (
        resolvedRelativePath === ".." ||
        resolvedRelativePath.startsWith(`..${path.sep}`) ||
        path.isAbsolute(resolvedRelativePath)
      ) {
        errorCount += 1;
        continue;
      }
      files.push({
        absolutePath: resolvedFile,
        relativePath,
        mimeType,
        size: fileStat.size,
        modifiedAt: new Date(Number(fileStat.mtimeMs)),
      });
    } catch {
      errorCount += 1;
    }
  }
  return { files, errorCount };
}

function coverImage(cover: ScanWorkerCover | null): CoverImage | null {
  return cover
    ? {
        data: Buffer.from(cover.data),
        mimeType: cover.mimeType,
      }
    : null;
}

function remoteCoverKey(item: LibrarySourceTrackRecord): string | null {
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
            media: null,
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
    private readonly sourceIntegrations: LibrarySourceConnectorService,
    private readonly metadataEnrichment?: MetadataEnrichment,
    private readonly catalog?: CatalogService,
    private readonly artworkCache?: ArtworkCache,
  ) {}

  async prepareFile(
    file: SourceFile,
    workerPool: ScanWorkerPool,
    signal: AbortSignal,
  ): Promise<PreparedFile> {
    throwIfAborted(signal);
    const existing = await this.database.orm.MediaCopy.where({
      librarySourceId: file.sourceId,
      relativePath: file.relativePath,
    }).first();
    const media = existing
      ? await this.database.orm.Media.first({ id: existing.mediaId })
      : null;
    const fileUnchanged =
      existing?.fileSizeBytes === file.size &&
      existing.fileModifiedAt.getTime() === file.modifiedAt.getTime() &&
      existing.metadataVersion >= CURRENT_METADATA_VERSION;
    if (existing && media && fileUnchanged) {
      return {
        kind: "unchanged",
        file,
        existing,
        media,
        wasUnavailable: !existing.available,
      };
    }
    try {
      return {
        kind: "parsed",
        file,
        existing,
        media,
        metadata: await workerPool.parseFile(file.absolutePath),
      };
    } catch (error) {
      if (signal.aborted) throw error;
      return { kind: "failed", file, existing, media };
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
    const releaseImport =
      task.kind === "release_import"
        ? readReleaseImportTaskPayload(task)
        : null;
    const importPaths =
      task.kind === "release_import"
        ? (releaseImport?.paths ?? readTaskPayload(task))
        : null;
    const targetedImport = importPaths !== null;
    let discoveryErrorCount = 0;
    const timings = createScanTimings();
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
      let requestedSource: LibrarySourceRow | undefined;
      const requestedSourceId = releaseImport?.sourceId ?? task.connectorId;
      if (requestedSourceId) {
        const source = await this.database.orm.LibrarySource.first({
          id: requestedSourceId,
        });
        if (
          !source ||
          source.removedAt ||
          (source.kind !== "path" &&
            !this.sourceIntegrations.registry.has(source.kind))
        ) {
          throw new TaskExecutionError(
            "The selected music source is no longer available.",
            "failed",
            message("api.message.sourceUnavailable"),
          );
        }
        requestedSource = source;
      }
      const sourceQuery = this.database.orm.LibrarySource.where((source) =>
        source.removedAt.isNull(),
      ).orderBy([
        (source) => source.position.asc(),
        (source) => source.createdAt.asc(),
      ]);
      const sources = requestedSource
        ? [requestedSource]
        : (await sourceQuery.all()).filter(
            (source) =>
              source.kind === "path" ||
              this.sourceIntegrations.registry.has(source.kind),
          );
      if (sources.length === 0) {
        throw new TaskExecutionError(
          "No music library sources are configured.",
          "failed",
          message("api.message.noSources"),
        );
      }
      if (targetedImport && !requestedSource) {
        throw new TaskExecutionError(
          "The import folder is no longer available.",
          "failed",
          message("api.message.sourceUnavailable"),
        );
      }
      const sourceName =
        requestedSource?.name ||
        (requestedSource ? task.connectorName : null) ||
        "All sources";
      const files: SourceFile[] = [];
      const integrationSources: IntegrationSourceWork[] = [];
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
          const sourcePath = source.path;
          if (targetedImport) {
            const discovered = await withTiming(timings.discovery, () =>
              discoverReleaseImportFiles(sourcePath, importPaths, signal),
            );
            discoveryErrorCount += discovered.errorCount;
            for (const file of discovered.files) {
              files.push({
                ...file,
                sourceId: source.id,
                sourceKind: "path",
              });
            }
            continue;
          }
          for (const file of await withTiming(timings.discovery, () =>
            discoverAudioFiles(
              sourcePath,
              activeWorkerPool,
              workerCount,
              signal,
            ),
          )) {
            files.push({
              ...file,
              sourceId: source.id,
              sourceKind: "path",
            });
          }
          continue;
        }
        if (!this.sourceIntegrations.registry.has(source.kind)) {
          throw new TaskExecutionError(
            "The selected source integration is not available.",
            "failed",
            message("api.message.sourceUnavailable"),
          );
        }
        integrationSources.push({
          source,
          integration: this.sourceIntegrations.definition(source.kind),
          handle: this.sourceIntegrations.sourceHandle(source),
        });
      }
      let discoveredCount = files.length;
      let progressTotal: number | null = integrationSources.length
        ? null
        : discoveredCount;
      let processedItems = 0;
      let unsupportedCount = 0;
      const processedMediaIds = new Set<string>();
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
            errors: counts.errorCount + unsupportedCount + discoveryErrorCount,
            timingMs: scanTimingValues(timings),
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
        const processedMediaId = await this.applyPreparedFile(
          prepared,
          task.id,
          counts,
          signal,
          timings,
        );
        if (processedMediaId) processedMediaIds.add(processedMediaId);
        processedItems += 1;
        if (shouldYield(lastYieldAt)) {
          await yieldToEventLoop();
          lastYieldAt = Date.now();
        }
        await updateProgress();
      }
      await updateProgress(true);
      for (const source of integrationSources) {
        throwIfAborted(signal);
        let sourceTotal: number | null = null;
        let sourceProcessed = 0;
        let lastPageEndAt = Date.now();
        await source.integration.scan({
          source: source.handle,
          signal,
          onPage: async (page) => {
            throwIfAborted(signal);
            timings.discovery.ms += Date.now() - lastPageEndAt;
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

            for (
              let offset = 0;
              offset < page.items.length;
              offset += IMPORT_BATCH_SIZE
            ) {
              const batch = page.items.slice(
                offset,
                offset + IMPORT_BATCH_SIZE,
              );
              await this.applyRemoteBatchWithRetry(
                batch,
                source,
                task.id,
                counts,
                signal,
                timings,
              );
              processedItems += batch.length;
              lastYieldAt = Date.now();
              await yieldToEventLoop();
              await updateProgress(true);
            }
            await updateProgress(true);
            lastPageEndAt = Date.now();
          },
        });
        completedRemoteTotal += sourceTotal ?? sourceProcessed;
        discoveredCount = files.length + completedRemoteTotal;
      }
      throwIfAborted(signal);
      let unavailableCount = 0;
      if (!targetedImport) {
        await withTiming(timings.database, () => this.removeUnusedCovers());
        if (this.artworkCache) {
          await withTiming(timings.artwork, () =>
            pruneReferencedArtwork(this.database, this.artworkCache!),
          );
        }
        const copyQuery = this.database.orm.MediaCopy.where({
          available: 1,
        }).where((copy) =>
          copy.librarySourceId.in(sources.map((source) => source.id)),
        );
        const unavailableCopies = await copyQuery
          .where((copy) =>
            or(copy.lastSeenScanId.isNull(), copy.lastSeenScanId.neq(task.id)),
          )
          .all();
        for (
          let offset = 0;
          offset < unavailableCopies.length;
          offset += IMPORT_BATCH_SIZE
        ) {
          const batch = unavailableCopies.slice(
            offset,
            offset + IMPORT_BATCH_SIZE,
          );
          await withTiming(timings.database, () =>
            this.database.transaction(async (transaction) => {
              const mediaIds = new Set<string>();
              for (const copy of batch) {
                mediaIds.add(copy.mediaId);
                await transaction.orm.MediaCopy.where({ id: copy.id }).update({
                  available: 0,
                });
                await transaction.orm.ArtworkJob.where({
                  copyId: copy.id,
                }).deleteAndCount();
              }
              for (const mediaId of mediaIds) {
                await this.refreshMediaAvailability(
                  mediaId,
                  transaction,
                  "scan",
                );
              }
            }),
          );
          if (this.catalog) {
            await withTiming(timings.catalog, () =>
              this.catalog!.markScanBatchChanged(requestedSource?.id ?? null),
            );
          }
          await yieldToEventLoop();
        }
        unavailableCount = unavailableCopies.length;
        const syncedAt = new Date();
        await withTiming(timings.database, async () => {
          for (const source of sources) {
            await this.database.orm.LibrarySource.where({
              id: source.id,
            }).update({
              lastSyncedAt: syncedAt,
            });
          }
        });
      }

      const sourceMediaIds = targetedImport
        ? [...processedMediaIds]
        : (
            await this.database.orm.MediaCopy.where((copy) =>
              copy.librarySourceId.in(sources.map((source) => source.id)),
            )
              .select("mediaId")
              .all()
          ).map((copy) => copy.mediaId);
      const musicMedia = targetedImport
        ? processedMediaIds.size
          ? await this.database.orm.Media.where({
              available: 1,
              mediaType: "music",
            })
              .where((media) => media.id.in([...processedMediaIds]))
              .first()
          : null
        : await this.database.orm.Media.where({
            available: 1,
            mediaType: "music",
          })
            .where((media) => media.id.in(sourceMediaIds))
            .first();
      if (this.metadataEnrichment && musicMedia) {
        await queueMetadataEnrichment(tasks, {
          source: requestedSource
            ? {
                id: requestedSource.id,
                name: requestedSource.name || "Library source",
              }
            : null,
          parentTaskId: task.id,
          mediaIds: targetedImport ? [...processedMediaIds] : null,
        });
      }
      await queueMediaMatch(tasks, task.id);
      if (
        await this.catalog?.hasPendingProjection(requestedSource?.id ?? null)
      ) {
        await queueCatalogProjection(tasks, {
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
      if (this.catalog) {
        await withTiming(timings.catalog, () => this.catalog!.flushChanges());
      }
      return {
        details: scanDetails({
          source: sourceName,
          discovered: discoveredCount,
          created: counts.createdCount,
          updated: counts.updatedCount,
          unchanged: counts.unchangedCount,
          unavailable: unavailableCount,
          errors: counts.errorCount + unsupportedCount + discoveryErrorCount,
          timingMs: scanTimingValues(timings),
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
      if (error instanceof LibrarySourceConnectorError) {
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
    timings: ScanTimings,
  ): Promise<string | null> {
    throwIfAborted(signal);
    if (prepared.kind === "unchanged") {
      await withTiming(timings.database, () =>
        this.database.transaction(async (transaction) => {
          await transaction.orm.MediaCopy.where({
            id: prepared.existing.id,
          }).update({
            available: 1,
            lastSeenScanId: scanId,
          });
          await refreshCanonicalMediaFromCopies(transaction, prepared.media.id);
        }),
      );
      if (prepared.wasUnavailable) {
        await withTiming(timings.catalog, () =>
          this.catalog
            ? this.catalog.reindexMedia(prepared.media.id, "scan")
            : Promise.resolve(),
        );
      }
      counts.unchangedCount += 1;
      return prepared.media.id;
    }

    if (prepared.kind === "failed") {
      counts.errorCount += 1;
      if (prepared.existing) {
        const failedExisting = prepared.existing;
        await withTiming(timings.database, () =>
          this.markFileError(prepared.file, failedExisting, scanId),
        );
      }
      return null;
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
      const recordingIdentityKeys = serializeRecordingIdentityKeys(
        localRecordingIdentityKeys(metadata),
      );
      const taggedPublishedAt = parsePublishedAt(
        metadata.releasedate,
        metadata.originaldate,
        metadata.date,
        metadata.year,
      );
      const publishedAt =
        taggedPublishedAt ??
        (detected.mediaType === "podcast" ? file.modifiedAt : null);
      const coverId = await withTiming(timings.artwork, () =>
        this.storeCover(coverImage(metadata.cover)),
      );

      const mediaData = {
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
        available: 1,
        catalogProjectionPending: 1,
        metadataVersion: CURRENT_METADATA_VERSION,
      };
      const copyData = {
        librarySourceId: file.sourceId,
        relativePath: file.relativePath,
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
        recordingIdentityKeys,
        audioLossless: metadata.audioLossless ? 1 : 0,
        audioBitrate: metadata.audioBitrate,
        available: 1,
        lastSeenScanId: scanId,
        metadataVersion: CURRENT_METADATA_VERSION,
      };
      if (existing) {
        const mediaId = prepared.media?.id ?? existing.mediaId;
        await withTiming(timings.database, () =>
          this.database.transaction(async (transaction) => {
            const protectedWrite = protectedAutomaticWrite(
              existing.manualOverrides,
              copyData,
            );
            await transaction.orm.MediaCopy.where({ id: existing.id }).update({
              ...protectedWrite.values,
              manualOverrides: protectedWrite.manualOverrides,
            });
            await refreshCanonicalMediaFromCopies(transaction, mediaId);
          }),
        );
        await withTiming(timings.catalog, () =>
          this.catalog
            ? this.catalog.reindexMedia(mediaId, "scan")
            : Promise.resolve(),
        );
        counts.updatedCount += 1;
        return mediaId;
      } else {
        const created = await withTiming(timings.database, () =>
          this.database.transaction(async (transaction) => {
            const media = await transaction.orm.Media.create(mediaData);
            await transaction.orm.MediaCopy.create({
              ...copyData,
              mediaId: media.id,
            });
            return media;
          }),
        );
        await withTiming(timings.catalog, () =>
          this.catalog
            ? this.catalog.reindexMedia(created.id, "scan")
            : Promise.resolve(),
        );
        counts.createdCount += 1;
        return created.id;
      }
    } catch (error) {
      if (signal.aborted) throw error;
      counts.errorCount += 1;
      if (existing) {
        await withTiming(timings.database, () =>
          this.markFileError(file, existing, scanId),
        );
      }
      return null;
    }
  }

  private async markFileError(
    file: SourceFile,
    existing: MediaCopyRow,
    scanId: string,
  ): Promise<void> {
    try {
      await this.database.transaction(async (transaction) => {
        const protectedWrite = protectedAutomaticWrite(
          existing.manualOverrides,
          {
            fileSizeBytes: file.size,
            fileModifiedAt: file.modifiedAt,
            available: 1,
            lastSeenScanId: scanId,
          },
        );
        await transaction.orm.MediaCopy.where({ id: existing.id }).update({
          ...protectedWrite.values,
          manualOverrides: protectedWrite.manualOverrides,
        });
        await refreshCanonicalMediaFromCopies(transaction, existing.mediaId);
        await this.refreshMediaAvailability(
          existing.mediaId,
          transaction,
          "scan",
        );
      });
    } catch {
      // The file remains counted as an error if even the fallback write
      // cannot acquire SQLite's write lock.
    }
  }

  private async refreshMediaAvailability(
    mediaId: string,
    transaction: Parameters<Parameters<Database["transaction"]>[0]>[0],
    reason:
      | "scan"
      | "metadata"
      | "reset"
      | "source"
      | "source-removal"
      | "media-match",
  ): Promise<void> {
    const primary = await refreshCanonicalMediaFromCopies(transaction, mediaId);
    const available = primary ? 1 : 0;
    await transaction.orm.Media.where({ id: mediaId }).update({
      available,
      catalogProjectionPending: 1,
    });
    const projection = await transaction.orm.CatalogMedia.first({
      id: mediaId,
    });
    if (projection) {
      await transaction.orm.CatalogMedia.where({ id: mediaId }).update({
        available,
        ...(available ? {} : { albumId: null }),
      });
    }
    void reason;
  }

  private async applyRemoteBatch(
    items: readonly LibrarySourceTrackRecord[],
    source: IntegrationSourceWork,
    scanId: string,
    counts: ScanCounts,
    signal: AbortSignal,
    timings: ScanTimings,
  ): Promise<void> {
    throwIfAborted(signal);
    if (!items.length) return;
    const existingCopies = await this.database.orm.MediaCopy.where({
      librarySourceId: source.source.id,
    })
      .where((copy) => copy.externalId.in(items.map((item) => item.externalId)))
      .all();
    const existingByExternalId = new Map(
      existingCopies.flatMap((copy) =>
        copy.externalId ? [[copy.externalId, copy] as const] : [],
      ),
    );
    const existingMedia = await this.database.orm.Media.where((media) =>
      media.id.in([...new Set(existingCopies.map((copy) => copy.mediaId))]),
    ).all();
    const mediaById = new Map(existingMedia.map((media) => [media.id, media]));
    const artworkSyncInputs: ArtworkJobSyncInput[] = [];
    const coverIds = new Map<string, string>();
    const missingCovers = new Map<
      string,
      { itemId: string; tag: string | null }
    >();
    for (const item of items) {
      const existing = existingByExternalId.get(item.externalId) ?? null;
      const coverKey = remoteCoverKey(item);
      if (coverKey && item.cover) {
        if (
          existing?.coverId &&
          (existing.externalCoverKey === null ||
            existing.externalCoverKey === coverKey)
        ) {
          coverIds.set(coverKey, existing.coverId);
          missingCovers.delete(coverKey);
        } else if (!coverIds.has(coverKey)) {
          missingCovers.set(coverKey, item.cover);
        }
      }
    }
    if (missingCovers.size) {
      const fetchedCovers = await withTiming(timings.artwork, () =>
        this.fetchRemoteCovers([...missingCovers], source, signal),
      );
      for (const [key, coverId] of fetchedCovers) {
        if (coverId) coverIds.set(key, coverId);
      }
    }
    const mediaDataFor = (
      item: LibrarySourceTrackRecord,
      coverId: string | null,
    ) => {
      const artistCredits = normalizeArtistCredits(
        item.artists.length ? item.artists : ["Unknown artist"],
      );
      const itemAlbumArtists = normalizeOptionalArtistCredits(
        item.albumArtists,
      );
      const albumArtists =
        item.mediaType !== "music" && itemAlbumArtists.length === 0
          ? artistCredits
          : itemAlbumArtists;
      return {
        mediaType: item.mediaType,
        mediaTypeOrigin: item.mediaTypeOrigin,
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
        available: 1,
        catalogProjectionPending: 1,
        metadataVersion: CURRENT_METADATA_VERSION,
      };
    };
    const copyDataFor = (
      item: LibrarySourceTrackRecord,
      coverId: string | null,
      coverKey: string | null,
    ) => {
      const artistCredits = normalizeArtistCredits(
        item.artists.length ? item.artists : ["Unknown artist"],
      );
      const itemAlbumArtists = normalizeOptionalArtistCredits(
        item.albumArtists,
      );
      const albumArtists =
        item.mediaType !== "music" && itemAlbumArtists.length === 0
          ? artistCredits
          : itemAlbumArtists;
      return {
        librarySourceId: source.source.id,
        relativePath: item.relativePath,
        mediaType: item.mediaType,
        mediaTypeOrigin: item.mediaTypeOrigin,
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
        recordingIdentityKeys: serializeRecordingIdentityKeys(
          item.recordingIdentityKeys,
        ),
        audioLossless: item.audioLossless ? 1 : 0,
        audioBitrate: item.audioBitrate,
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
    };
    const changedMediaIds = new Set<string>();
    const mediaIdsToRefresh = new Set<string>();

    await withTiming(timings.database, () =>
      this.database.transaction(async (transaction) => {
        for (const item of items) {
          throwIfAborted(signal);
          const coverKey = remoteCoverKey(item);
          const existing = existingByExternalId.get(item.externalId) ?? null;
          const existingCoverUsable = Boolean(
            existing?.coverId &&
            (existing.externalCoverKey === null ||
              existing.externalCoverKey === coverKey),
          );
          const coverId =
            (coverKey ? coverIds.get(coverKey) : null) ??
            (existingCoverUsable ? existing!.coverId : null);
          const mediaData = mediaDataFor(item, coverId);
          const copyData = copyDataFor(item, coverId, coverKey);
          let copyId: string;
          let mediaId: string;
          if (existing) {
            copyId = existing.id;
            mediaId = existing.mediaId;
            const unchanged =
              existing.externalVersion === item.externalVersion &&
              existing.metadataVersion >= CURRENT_METADATA_VERSION &&
              Boolean(existing.available) &&
              mediaType(existing.mediaType) === item.mediaType &&
              trackMediaTypeOrigin(existing.mediaTypeOrigin) ===
                item.mediaTypeOrigin;
            const protectedWrite = protectedAutomaticWrite(
              existing.manualOverrides,
              {
                ...(unchanged ? {} : copyData),
                available: 1,
                lastSeenScanId: scanId,
                ...(coverId ? { coverId } : {}),
              },
            );
            await transaction.orm.MediaCopy.where({ id: existing.id }).update({
              ...protectedWrite.values,
              manualOverrides: protectedWrite.manualOverrides,
            });
            const existingMedia = mediaById.get(mediaId);
            mediaIdsToRefresh.add(mediaId);
            if (unchanged && existingMedia?.available) {
              counts.unchangedCount += 1;
            } else {
              counts.updatedCount += 1;
              changedMediaIds.add(mediaId);
            }
          } else {
            const createdMedia = await transaction.orm.Media.create(mediaData);
            mediaId = createdMedia.id;
            const createdCopy = await transaction.orm.MediaCopy.create({
              ...copyData,
              mediaId,
            });
            copyId = createdCopy.id;
            counts.createdCount += 1;
            changedMediaIds.add(mediaId);
          }
          artworkSyncInputs.push({
            copyId,
            librarySourceId: source.source.id,
            externalCoverItemId: coverId ? null : (item.cover?.itemId ?? null),
            externalCoverTag: coverId ? null : (item.cover?.tag ?? null),
          });
        }
        await refreshCanonicalMediaFromCopiesBatch(transaction, [
          ...mediaIdsToRefresh,
        ]);
        await syncArtworkJobsInBatch(transaction, artworkSyncInputs);
      }),
    );
    if (this.catalog) {
      await this.catalog.indexScanBatch([...changedMediaIds]);
      await withTiming(timings.catalog, () =>
        this.catalog!.markScanBatchChanged(source.source.id),
      );
    }
  }

  private async fetchRemoteCovers(
    covers: readonly (readonly [
      string,
      { itemId: string; tag: string | null },
    ])[],
    source: IntegrationSourceWork,
    signal: AbortSignal,
  ): Promise<Map<string, string | null>> {
    const coverIds = new Map<string, string | null>();
    let nextIndex = 0;
    const pending = new Map<
      number,
      Promise<{ key: string; cover: CoverImage | null }>
    >();

    while (nextIndex < covers.length || pending.size) {
      throwIfAborted(signal);
      while (
        nextIndex < covers.length &&
        pending.size < REMOTE_ARTWORK_CONCURRENCY
      ) {
        const index = nextIndex;
        const entry = covers[nextIndex++];
        if (!entry) break;
        const [key, reference] = entry;
        pending.set(
          index,
          source.integration
            .artwork({
              source: source.handle,
              reference,
              signal,
            })
            .then(
              (cover) => ({
                key,
                cover: cover
                  ? { data: cover.data, mimeType: cover.mimeType }
                  : null,
              }),
              (error: unknown) => {
                if (signal.aborted) throw error;
                return { key, cover: null };
              },
            ),
        );
      }
      if (!pending.size) break;

      const completed = await Promise.race(
        [...pending].map(async ([index, promise]) => ({
          index,
          result: await promise,
        })),
      );
      pending.delete(completed.index);
      coverIds.set(
        completed.result.key,
        await this.storeCover(completed.result.cover),
      );
      await new Promise<void>((resolve) => setImmediate(resolve));
    }

    return coverIds;
  }

  private async applyRemoteBatchWithRetry(
    items: readonly LibrarySourceTrackRecord[],
    source: IntegrationSourceWork,
    scanId: string,
    counts: ScanCounts,
    signal: AbortSignal,
    timings: ScanTimings,
  ): Promise<void> {
    const initial = { ...counts };
    for (let attempt = 0; attempt < 8; attempt += 1) {
      throwIfAborted(signal);
      try {
        await this.applyRemoteBatch(
          items,
          source,
          scanId,
          counts,
          signal,
          timings,
        );
        return;
      } catch (error) {
        Object.assign(counts, initial);
        if (
          attempt === 7 ||
          !(error instanceof Error) ||
          !/database is locked/i.test(error.message)
        ) {
          throw error;
        }
        await new Promise<void>((resolve) =>
          setTimeout(resolve, 50 * (attempt + 1)),
        );
      }
    }
  }

  private async storeCover(cover: CoverImage | null): Promise<string | null> {
    if (!cover || !this.artworkCache) return null;
    try {
      const hash = await this.artworkCache.store(cover.data);
      const existing = await this.database.orm.Cover.where({
        hash,
      }).first();
      const stored =
        existing ?? (await this.database.orm.Cover.create({ hash }));
      return stored.id;
    } catch {
      return null;
    }
  }

  private async removeUnusedCovers(): Promise<void> {
    const tracks = await this.database.orm.Media.where((track) =>
      track.coverId.isNotNull(),
    )
      .select("coverId")
      .all();
    const coverIds = [
      ...new Set(tracks.flatMap(({ coverId }) => (coverId ? [coverId] : []))),
    ];
    await (
      coverIds.length
        ? this.database.orm.Cover.where((cover) => cover.id.notIn(coverIds))
        : this.database.orm.Cover.where((cover) => cover.id.isNotNull())
    ).deleteAndCount();
  }
}
