import { createHash } from "node:crypto";
import path from "node:path";
import { opendir, readdir, readFile, stat } from "node:fs/promises";
import { and, or } from "@prisma/orm-sqlite/orm-client";
import { parseFile } from "music-metadata";
import type {
  MediaType,
  SourceClassificationMode,
  TrackMediaTypeOrigin,
} from "@peridot/contracts";
import {
  normalizeArtistCredits,
  normalizeOptionalArtistCredits,
  serializeArtistCredits,
} from "./artist-credits.js";
import type { CatalogService } from "./catalog.js";
import type { CredentialStore } from "./credential-store.js";
import type { Database } from "./database.js";
import { serializeGenres } from "./genres.js";
import {
  JellyfinClient,
  JellyfinError,
  type JellyfinAudioItem,
} from "./jellyfin.js";
import type { MetadataEnrichment } from "./metadata-enrichment.js";
import {
  detectMediaType,
  effectiveMediaType,
  mediaTypeValue,
  sourceClassificationMode,
  type DetectedMediaType,
} from "./media-classification.js";
import {
  collectionFallbackTitle,
  mediaType,
  parsePublishedAt,
} from "./media.js";
import { message } from "./messages.js";
import type { SourceRow, TaskRow, TrackRow } from "./prisma/models.js";
import {
  queueMetadataFetch,
  scanDetails,
  TaskExecutionError,
  type TaskExecutionResult,
  type TaskService,
} from "./tasks.js";

const AUDIO_MIME_TYPES = new Map([
  [".mp3", "audio/mpeg"],
  [".m4a", "audio/mp4"],
  [".m4b", "audio/mp4"],
  [".aac", "audio/aac"],
  [".ogg", "audio/ogg"],
  [".opus", "audio/ogg"],
  [".wav", "audio/wav"],
  [".flac", "audio/flac"],
]);

// SQLite has a single-writer model. Keep catalog mutations serialized so
// concurrent file workers cannot fail a scan with SQLITE_BUSY.
const SCAN_CONCURRENCY = 1;
const CURRENT_METADATA_VERSION = 7;
const MAX_COVER_BYTES = 5 * 1024 * 1024;
const FOLDER_COVER_NAMES = new Set([
  "albumart.jpg",
  "albumart.jpeg",
  "albumart.png",
  "cover.jpg",
  "cover.jpeg",
  "cover.png",
  "cover.webp",
  "folder.jpg",
  "folder.jpeg",
  "folder.png",
  "front.jpg",
  "front.jpeg",
  "front.png",
]);
const COVER_MIME_TYPES = new Map([
  [".jpg", "image/jpeg"],
  [".jpeg", "image/jpeg"],
  [".png", "image/png"],
  [".webp", "image/webp"],
]);

interface DiscoveredFile {
  absolutePath: string;
  relativePath: string;
  mimeType: string;
  size: bigint;
  modifiedAt: Date;
}

interface SourceFile extends DiscoveredFile {
  sourceId: string;
  classificationMode: SourceClassificationMode;
  fixedMediaType: MediaType | null;
}

interface JellyfinSource {
  id: string;
  name: string;
  url: string;
  apiKey: string;
  classificationMode: SourceClassificationMode;
  fixedMediaType: MediaType | null;
  libraryCollectionType: string | null;
  libraryId: string | null;
}

interface RemoteSourceItem {
  source: JellyfinSource;
  item: JellyfinAudioItem;
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

function detectedMediaType(track: TrackRow): DetectedMediaType {
  const origin =
    track.detectedMediaTypeOrigin === "jellyfin" ||
    track.detectedMediaTypeOrigin === "embedded"
      ? track.detectedMediaTypeOrigin
      : "fallback";
  return {
    mediaType: mediaType(track.detectedMediaType),
    origin,
  };
}

function trackMediaTypeOrigin(value: string): TrackMediaTypeOrigin {
  return value === "manual" ||
    value === "source" ||
    value === "jellyfin" ||
    value === "embedded"
    ? value
    : "fallback";
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
  signal: AbortSignal,
): Promise<DiscoveredFile[]> {
  const files: DiscoveredFile[] = [];

  async function visit(directory: string): Promise<void> {
    throwIfAborted(signal);
    const entries = await opendir(directory);
    for await (const entry of entries) {
      throwIfAborted(signal);
      const absolutePath = path.join(directory, entry.name);
      if (entry.isSymbolicLink()) continue;
      if (entry.isDirectory()) {
        await visit(absolutePath);
        continue;
      }
      if (!entry.isFile()) continue;
      const mimeType = AUDIO_MIME_TYPES.get(
        path.extname(entry.name).toLowerCase(),
      );
      if (!mimeType) continue;
      const fileStat = await stat(absolutePath, { bigint: true });
      files.push({
        absolutePath,
        relativePath: path.relative(root, absolutePath),
        mimeType,
        size: fileStat.size,
        modifiedAt: new Date(Number(fileStat.mtimeMs)),
      });
    }
  }

  await visit(root);
  return files;
}

export class LibraryScanner {
  private folderCoverCache = new Map<string, CoverImage | null>();
  private jellyfinCoverCache = new Map<string, CoverImage | null>();

  constructor(
    private readonly database: Database,
    private readonly metadataEnrichment?: MetadataEnrichment,
    private readonly catalog?: CatalogService,
    private readonly jellyfin?: JellyfinClient,
    private readonly credentials?: CredentialStore,
  ) {}

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

    try {
      throwIfAborted(signal);
      this.folderCoverCache.clear();
      this.jellyfinCoverCache.clear();
      let requestedSource: SourceRow | undefined;
      if (task.sourceId) {
        const source = await this.database.orm.Source.first({
          id: task.sourceId,
        });
        if (
          !source ||
          (source.kind !== "path" &&
            !(
              source.kind === "integration" && source.integration === "jellyfin"
            ))
        ) {
          throw new TaskExecutionError(
            "The selected music source is no longer available.",
            "failed",
            message("api.message.sourceUnavailable"),
          );
        }
        requestedSource = source;
      }
      const sourceQuery = this.database.orm.Source;
      const sources = requestedSource
        ? [requestedSource]
        : await sourceQuery
            .where((source) =>
              or(
                source.kind.eq("path"),
                and(
                  source.kind.eq("integration"),
                  source.integration.eq("jellyfin"),
                ),
              ),
            )
            .orderBy([
              (source) => source.position.asc(),
              (source) => source.createdAt.asc(),
            ])
            .all();
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
      const jellyfinSources: JellyfinSource[] = [];
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
          for (const file of await discoverAudioFiles(source.path, signal)) {
            files.push({
              ...file,
              sourceId: source.id,
              classificationMode: sourceClassificationMode(
                source.classificationMode,
              ),
              fixedMediaType: mediaTypeValue(source.fixedMediaType),
            });
          }
          continue;
        }
        if (
          !this.jellyfin ||
          !this.credentials ||
          source.integration !== "jellyfin" ||
          !source.url ||
          !source.credentialCiphertext
        ) {
          throw new TaskExecutionError(
            "The selected Jellyfin source is not fully configured.",
            "failed",
            message("api.message.sourceUnavailable"),
          );
        }
        const apiKey = this.credentials.decrypt(
          source.credentialCiphertext,
          "source",
        );
        const remoteSource: JellyfinSource = {
          id: source.id,
          name:
            source.name ||
            task.sourceName ||
            new URL(source.url).host ||
            "Jellyfin",
          url: source.url,
          apiKey,
          classificationMode: sourceClassificationMode(
            source.classificationMode,
          ),
          fixedMediaType: mediaTypeValue(source.fixedMediaType),
          libraryCollectionType: source.externalLibraryCollectionType,
          libraryId: source.externalLibraryId,
        };
        jellyfinSources.push(remoteSource);
      }
      let discoveredCount = files.length;
      let processedItems = 0;
      let unsupportedCount = 0;
      let completedRemoteTotal = 0;
      await tasks.updateProgress(
        task.id,
        0,
        jellyfinSources.length ? null : files.length,
        scanDetails({
          source: sourceName,
          discovered: discoveredCount,
          created: 0,
          updated: 0,
          unchanged: 0,
          unavailable: 0,
          errors: unsupportedCount,
        }),
      );

      let nextFile = 0;
      const workers = Array.from(
        { length: Math.min(SCAN_CONCURRENCY, files.length) },
        async () => {
          while (nextFile < files.length) {
            throwIfAborted(signal);
            const file = files[nextFile++];
            if (file) await this.processFile(file, task.id, counts, signal);
            processedItems += 1;
            await tasks.updateProgress(
              task.id,
              processedItems,
              jellyfinSources.length ? null : discoveredCount,
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
          }
        },
      );
      await Promise.all(workers);
      for (const source of jellyfinSources) {
        throwIfAborted(signal);
        let sourceTotal: number | null = null;
        if (!this.jellyfin) {
          throw new TaskExecutionError(
            "The selected Jellyfin source is not available.",
            "failed",
            message("api.message.sourceUnavailable"),
          );
        }
        const remote = await this.jellyfin.listAudio(
          source.url,
          source.apiKey,
          source.libraryId,
          async (page) => {
            throwIfAborted(signal);
            for (const item of page.items) {
              await this.processRemoteItem(
                { source, item },
                task.id,
                counts,
                signal,
              );
            }
            sourceTotal = page.totalCount ?? sourceTotal;
            unsupportedCount += page.unsupportedCount;
            processedItems += page.items.length + page.unsupportedCount;
            discoveredCount =
              files.length +
              completedRemoteTotal +
              (sourceTotal ?? page.processedCount);
            await tasks.updateProgress(
              task.id,
              processedItems,
              discoveredCount,
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
          },
          signal,
        );
        completedRemoteTotal +=
          sourceTotal ?? remote.totalCount ?? remote.processedCount;
        discoveredCount = files.length + completedRemoteTotal;
      }
      throwIfAborted(signal);
      await this.removeUnusedCovers();

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
        await this.catalog?.reindexTrack(track.id, "scan");
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
      if (error instanceof JellyfinError) {
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
    }
  }

  private async processFile(
    file: SourceFile,
    scanId: string,
    counts: ScanCounts,
    signal: AbortSignal,
  ): Promise<void> {
    let existing: TrackRow | null = null;
    try {
      throwIfAborted(signal);
      const unique = {
        sourceId: file.sourceId,
        relativePath: file.relativePath,
      };
      existing = await this.database.orm.Track.where(unique).first();
      const fileUnchanged =
        existing?.fileSizeBytes === file.size &&
        existing.fileModifiedAt.getTime() === file.modifiedAt.getTime() &&
        existing.metadataVersion >= CURRENT_METADATA_VERSION;

      if (existing && fileUnchanged) {
        const detected = detectedMediaType(existing);
        const effective = effectiveMediaType(detected, {
          override: existing.mediaTypeOverride,
          classificationMode: file.classificationMode,
          fixedMediaType: file.fixedMediaType,
        });
        const classificationUnchanged =
          mediaType(existing.mediaType) === effective.mediaType &&
          trackMediaTypeOrigin(existing.mediaTypeOrigin) === effective.origin;
        if (classificationUnchanged) {
          const wasUnavailable = !existing.available;
          await this.database.orm.Track.where({ id: existing.id }).update({
            available: 1,
            lastSeenScanId: scanId,
          });
          if (wasUnavailable) {
            await this.catalog?.reindexTrack(existing.id, "scan");
          }
          counts.unchangedCount += 1;
          return;
        }

        await this.database.orm.Track.where({ id: existing.id }).update({
          mediaType: effective.mediaType,
          mediaTypeOrigin: effective.origin,
          available: 1,
          lastSeenScanId: scanId,
        });
        await this.catalog?.reindexTrack(existing.id, "scan");
        counts.updatedCount += 1;
        return;
      }

      const metadata = await parseFile(file.absolutePath, {
        duration: true,
        skipCovers: false,
      });
      if (!metadata.format.container) {
        throw new Error("Audio format was not recognized");
      }
      const title =
        metadata.common.title?.trim() || path.parse(file.relativePath).name;
      const artistCredits = normalizeArtistCredits(
        metadata.common.artists?.length
          ? metadata.common.artists
          : [metadata.common.artist],
      );
      const artist = artistCredits.join(", ");
      const albumArtistCredits = normalizeOptionalArtistCredits(
        metadata.common.albumartists?.length
          ? metadata.common.albumartists
          : [metadata.common.albumartist],
      );
      const detected = detectMediaType({
        extension: path.extname(file.relativePath),
        podcast: metadata.common.podcast === true,
        podcastId: metadata.common.podcastId ?? null,
        podcastUrl: metadata.common.podcasturl ?? null,
        releaseTypes: metadata.common.releasetype ?? [],
        iTunesMediaType: metadata.common.stik ?? 0,
      });
      const effective = effectiveMediaType(detected, {
        override: existing?.mediaTypeOverride ?? null,
        classificationMode: file.classificationMode,
        fixedMediaType: file.fixedMediaType,
      });
      const creatorCredits =
        effective.mediaType !== "music" && albumArtistCredits.length === 0
          ? artistCredits
          : albumArtistCredits;
      const albumArtist = creatorCredits.length
        ? creatorCredits.join(", ")
        : null;
      const album =
        metadata.common.album?.trim() ||
        (effective.mediaType === "music"
          ? null
          : collectionFallbackTitle(file.relativePath));
      const genres = serializeGenres(metadata.common.genre);
      const discNumber = positiveInteger(metadata.common.disk.no);
      const trackNumber = positiveInteger(metadata.common.track.no);
      const durationMs = Number.isFinite(metadata.format.duration)
        ? Math.round(metadata.format.duration! * 1000)
        : null;
      const taggedPublishedAt = parsePublishedAt(
        metadata.common.releasedate,
        metadata.common.originaldate,
        metadata.common.date,
        metadata.common.year,
      );
      const publishedAt =
        taggedPublishedAt ??
        (effective.mediaType === "podcast" ? file.modifiedAt : null);
      const coverId = await this.storeCover(
        await this.coverFor(file.absolutePath, metadata.common.picture),
      );

      const trackData = {
        mediaType: effective.mediaType,
        mediaTypeOrigin: effective.origin,
        detectedMediaType: detected.mediaType,
        detectedMediaTypeOrigin: detected.origin,
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
    }
  }

  private async processRemoteItem(
    remote: RemoteSourceItem,
    scanId: string,
    counts: ScanCounts,
    signal: AbortSignal,
  ): Promise<void> {
    const { source, item } = remote;
    let existing: TrackRow | null = null;
    try {
      throwIfAborted(signal);
      existing = await this.database.orm.Track.where({
        sourceId: source.id,
        externalId: item.externalId,
      }).first();
      const detected = detectMediaType({
        jellyfinItemType: item.jellyfinItemType,
        jellyfinLibraryCollectionType: source.libraryCollectionType,
        jellyfinTags: item.jellyfinTags,
        jellyfinProviderIds: item.jellyfinProviderIds,
      });
      const effective = effectiveMediaType(detected, {
        override: existing?.mediaTypeOverride ?? null,
        classificationMode: source.classificationMode,
        fixedMediaType: source.fixedMediaType,
      });
      const unchanged =
        existing?.externalVersion === item.externalVersion &&
        existing.metadataVersion >= CURRENT_METADATA_VERSION &&
        mediaType(existing.mediaType) === effective.mediaType &&
        trackMediaTypeOrigin(existing.mediaTypeOrigin) === effective.origin &&
        mediaType(existing.detectedMediaType) === detected.mediaType &&
        trackMediaTypeOrigin(existing.detectedMediaTypeOrigin) ===
          detected.origin;
      if (existing && unchanged) {
        const wasUnavailable = !existing.available;
        await this.database.orm.Track.where({ id: existing.id }).update({
          available: 1,
          lastSeenScanId: scanId,
        });
        if (wasUnavailable) {
          await this.catalog?.reindexTrack(existing.id, "scan");
        }
        counts.unchangedCount += 1;
        return;
      }

      let cover: CoverImage | null = null;
      if (item.coverItemId && this.jellyfin) {
        const cacheKey = `${item.coverItemId}\u0000${item.coverTag ?? ""}`;
        if (this.jellyfinCoverCache.has(cacheKey)) {
          cover = this.jellyfinCoverCache.get(cacheKey) ?? null;
        } else {
          try {
            cover = await this.jellyfin.cover(
              source.url,
              source.apiKey,
              item.coverItemId,
              item.coverTag,
              signal,
            );
          } catch (error) {
            if (signal.aborted) throw error;
            if (
              error instanceof JellyfinError &&
              error.code !== "unavailable"
            ) {
              throw error;
            }
          }
          this.jellyfinCoverCache.set(cacheKey, cover);
        }
      }
      const coverId = await this.storeCover(cover);
      const artistCredits = normalizeArtistCredits(
        item.artists.length ? item.artists : ["Unknown artist"],
      );
      const itemAlbumArtists = normalizeOptionalArtistCredits(
        item.albumArtists,
      );
      const albumArtists =
        effective.mediaType !== "music" && itemAlbumArtists.length === 0
          ? artistCredits
          : itemAlbumArtists;
      const relativePath = `jellyfin/${item.albumId ?? "unknown"}/${item.externalId}`;
      const trackData = {
        mediaType: effective.mediaType,
        mediaTypeOrigin: effective.origin,
        detectedMediaType: detected.mediaType,
        detectedMediaTypeOrigin: detected.origin,
        relativePath,
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
          sourceId: source.id,
        });
        await this.catalog?.reindexTrack(created.id, "scan");
        counts.createdCount += 1;
      }
    } catch (error) {
      if (signal.aborted) throw error;
      counts.errorCount += 1;
      if (existing) {
        try {
          await this.database.orm.Track.where({ id: existing.id }).update({
            fileSizeBytes: item.fileSizeBytes,
            fileModifiedAt: item.fileModifiedAt,
            externalVersion: item.externalVersion,
            available: 1,
            lastSeenScanId: scanId,
          });
          await this.catalog?.reindexTrack(existing.id, "scan");
        } catch {
          // Preserve the error count when the fallback write also fails.
        }
      }
    }
  }

  private async coverFor(
    absolutePath: string,
    pictures:
      | readonly {
          data: Uint8Array;
          format: string;
          type?: string;
        }[]
      | undefined,
  ): Promise<CoverImage | null> {
    const ordered = [...(pictures ?? [])].sort((left, right) => {
      const leftFront = /cover\s*\(front\)/i.test(left.type ?? "");
      const rightFront = /cover\s*\(front\)/i.test(right.type ?? "");
      return Number(rightFront) - Number(leftFront);
    });
    for (const picture of ordered) {
      const data = Buffer.from(picture.data);
      if (data.length && data.length <= MAX_COVER_BYTES) {
        return {
          data,
          mimeType: picture.format.startsWith("image/")
            ? picture.format
            : "image/jpeg",
        };
      }
    }
    return this.folderCover(path.dirname(absolutePath));
  }

  private async folderCover(directory: string): Promise<CoverImage | null> {
    if (this.folderCoverCache.has(directory)) {
      return this.folderCoverCache.get(directory) ?? null;
    }
    try {
      const entries = await readdir(directory, { withFileTypes: true });
      for (const entry of entries) {
        if (
          !entry.isFile() ||
          entry.isSymbolicLink() ||
          !FOLDER_COVER_NAMES.has(entry.name.toLocaleLowerCase())
        ) {
          continue;
        }
        const mimeType = COVER_MIME_TYPES.get(
          path.extname(entry.name).toLocaleLowerCase(),
        );
        if (!mimeType) continue;
        const data = await readFile(path.join(directory, entry.name));
        if (!data.length || data.length > MAX_COVER_BYTES) continue;
        const cover = { data, mimeType };
        this.folderCoverCache.set(directory, cover);
        return cover;
      }
    } catch {
      // Missing or unreadable artwork leaves the album placeholder in place.
    }
    this.folderCoverCache.set(directory, null);
    return null;
  }

  private async storeCover(cover: CoverImage | null): Promise<string | null> {
    if (!cover) return null;
    const hash = createHash("sha256").update(cover.data).digest("hex");
    const existing = await this.database.orm.TrackCover.where({ hash }).first();
    const stored =
      existing ??
      (await this.database.orm.TrackCover.create({
        hash,
        mimeType: cover.mimeType,
        data: Uint8Array.from(cover.data),
      }));
    return stored.id;
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
