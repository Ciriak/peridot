import { createHash } from "node:crypto";
import path from "node:path";
import { opendir, readdir, readFile, stat } from "node:fs/promises";
import { or } from "@prisma/orm-sqlite/orm-client";
import { parseFile } from "music-metadata";
import {
  normalizeArtistCredits,
  serializeArtistCredits,
} from "./artist-credits.js";
import type { Database } from "./database.js";
import type { MetadataEnrichment } from "./metadata-enrichment.js";
import type { LibraryScanRow, TrackRow } from "./prisma/models.js";
import { getPathSources, type PathSource } from "./sources.js";

const AUDIO_MIME_TYPES = new Map([
  [".mp3", "audio/mpeg"],
  [".m4a", "audio/mp4"],
  [".aac", "audio/aac"],
  [".ogg", "audio/ogg"],
  [".opus", "audio/ogg"],
  [".wav", "audio/wav"],
  [".flac", "audio/flac"],
]);

// SQLite has a single-writer model. Keep catalog mutations serialized so
// concurrent file workers cannot fail a scan with SQLITE_BUSY.
const SCAN_CONCURRENCY = 1;
const CURRENT_METADATA_VERSION = 3;
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

async function discoverAudioFiles(root: string): Promise<DiscoveredFile[]> {
  const files: DiscoveredFile[] = [];

  async function visit(directory: string): Promise<void> {
    const entries = await opendir(directory);
    for await (const entry of entries) {
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
  private activeScan: Promise<void> | null = null;
  private queueing = false;
  private folderCoverCache = new Map<string, CoverImage | null>();

  constructor(
    private readonly database: Database,
    private readonly metadataEnrichment?: MetadataEnrichment,
  ) {}

  hasActiveOperation(): boolean {
    return this.queueing || this.activeScan !== null;
  }

  async markInterruptedScans(): Promise<void> {
    await this.database.orm.LibraryScan.where((scan) =>
      scan.status.in(["queued", "running"]),
    ).updateAndCount({
      status: "interrupted",
      metadataStatus: "interrupted",
      completedAt: new Date(),
      failureSummary: "The server stopped before this scan completed.",
    });
    await this.database.orm.LibraryScan.where({ status: "completed" })
      .where((scan) => scan.metadataStatus.in(["pending", "running"]))
      .updateAndCount({
        metadataStatus: "interrupted",
        metadataFailureSummary:
          "The server stopped before metadata matching completed.",
      });
  }

  async queueScan(source?: PathSource): Promise<LibraryScanRow | null> {
    if (this.queueing || this.activeScan) return null;
    this.queueing = true;
    try {
      const existing = await this.database.orm.LibraryScan.where((scan) =>
        or(
          scan.status.in(["queued", "running"]),
          scan.metadataStatus.in(["pending", "running"]),
        ),
      ).first();
      if (existing) return null;
      const scan = await this.database.orm.LibraryScan.create({
        status: "queued",
        sourceId: source?.id ?? null,
        sourceName: source
          ? source.name || path.basename(source.path)
          : "All sources",
        metadataStatus: "pending",
      });
      this.activeScan = new Promise((resolve) => setImmediate(resolve))
        .then(() => this.runScan(scan.id, source))
        .catch(() => undefined)
        .finally(() => {
          this.activeScan = null;
        });
      return scan;
    } finally {
      this.queueing = false;
    }
  }

  async queueMetadataRefresh(): Promise<LibraryScanRow | null> {
    if (this.queueing || this.activeScan) return null;
    this.queueing = true;
    try {
      const existing = await this.database.orm.LibraryScan.where((scan) =>
        or(
          scan.status.in(["queued", "running"]),
          scan.metadataStatus.in(["pending", "running"]),
        ),
      ).first();
      if (existing) return null;
      const scan = await this.database.orm.LibraryScan.create({
        status: "completed",
        sourceName: "All sources",
        metadataStatus: "pending",
        startedAt: new Date(),
        completedAt: new Date(),
      });
      this.activeScan = new Promise((resolve) => setImmediate(resolve))
        .then(async () => {
          if (!this.metadataEnrichment) {
            await this.database.orm.LibraryScan.where({ id: scan.id }).update({
              metadataStatus: "skipped",
              metadataFailureSummary: "No metadata providers are configured.",
            });
            return;
          }
          await this.metadataEnrichment.runScan(scan.id, undefined, true);
        })
        .catch(() => undefined)
        .finally(() => {
          this.activeScan = null;
        });
      return scan;
    } finally {
      this.queueing = false;
    }
  }

  async close(): Promise<void> {
    this.metadataEnrichment?.close();
    await this.activeScan;
  }

  private async runScan(
    scanId: string,
    requestedSource?: PathSource,
  ): Promise<void> {
    const counts: ScanCounts = {
      createdCount: 0,
      updatedCount: 0,
      unchangedCount: 0,
      errorCount: 0,
    };

    try {
      this.folderCoverCache.clear();
      await this.database.orm.LibraryScan.where({ id: scanId }).update({
        status: "running",
        startedAt: new Date(),
      });
      const sources = requestedSource
        ? [requestedSource]
        : await getPathSources(this.database);
      if (sources.length === 0) {
        await this.database.orm.LibraryScan.where({ id: scanId }).update({
          status: "failed",
          metadataStatus: "skipped",
          completedAt: new Date(),
          failureSummary: "No music library sources are configured.",
        });
        return;
      }
      const files: SourceFile[] = [];
      for (const source of sources) {
        for (const file of await discoverAudioFiles(source.path)) {
          files.push({ ...file, sourceId: source.id });
        }
      }
      await this.database.orm.LibraryScan.where({ id: scanId }).update({
        discoveredCount: files.length,
      });

      let nextFile = 0;
      const workers = Array.from(
        { length: Math.min(SCAN_CONCURRENCY, files.length) },
        async () => {
          while (nextFile < files.length) {
            const file = files[nextFile++];
            if (file) await this.processFile(file, scanId, counts);
          }
        },
      );
      await Promise.all(workers);
      await this.removeUnusedCovers();

      let trackQuery = this.database.orm.Track.where({ available: 1 });
      if (requestedSource) {
        trackQuery = trackQuery.where({
          sourceId: requestedSource.id,
        });
      }
      const unavailableCount = await trackQuery
        .where((track) =>
          or(track.lastSeenScanId.isNull(), track.lastSeenScanId.neq(scanId)),
        )
        .updateAndCount({ available: 0 });
      await this.database.orm.LibraryScan.where({ id: scanId }).update({
        status: "completed",
        completedAt: new Date(),
        unavailableCount,
        ...counts,
      });
      await this.metadataEnrichment?.runScan(scanId, requestedSource?.id);
    } catch (error) {
      await this.database.orm.LibraryScan.where({ id: scanId }).update({
        status: "failed",
        metadataStatus: "skipped",
        completedAt: new Date(),
        failureSummary: scanFailureSummary(error),
        ...counts,
      });
    }
  }

  private async processFile(
    file: SourceFile,
    scanId: string,
    counts: ScanCounts,
  ): Promise<void> {
    let existing: TrackRow | null = null;
    try {
      const unique = {
        sourceId: file.sourceId,
        relativePath: file.relativePath,
      };
      existing = await this.database.orm.Track.where(unique).first();
      const unchanged =
        existing?.fileSizeBytes === file.size &&
        existing.fileModifiedAt.getTime() === file.modifiedAt.getTime() &&
        existing.metadataVersion >= CURRENT_METADATA_VERSION;

      if (existing && unchanged) {
        await this.database.orm.Track.where({ id: existing.id }).update({
          available: 1,
          lastSeenScanId: scanId,
        });
        counts.unchangedCount += 1;
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
      const album = metadata.common.album?.trim() || null;
      const discNumber = positiveInteger(metadata.common.disk.no);
      const trackNumber = positiveInteger(metadata.common.track.no);
      const durationMs = Number.isFinite(metadata.format.duration)
        ? Math.round(metadata.format.duration! * 1000)
        : null;
      const coverId = await this.storeCover(
        await this.coverFor(file.absolutePath, metadata.common.picture),
      );

      const trackData = {
        title,
        artist,
        artistCredits: serializeArtistCredits(artistCredits),
        album,
        discNumber,
        trackNumber,
        durationMs,
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
        counts.updatedCount += 1;
      } else {
        await this.database.orm.Track.create({
          ...trackData,
          relativePath: file.relativePath,
          sourceId: file.sourceId,
        });
        counts.createdCount += 1;
      }
    } catch {
      counts.errorCount += 1;
      if (existing) {
        try {
          await this.database.orm.Track.where({ id: existing.id }).update({
            fileSizeBytes: file.size,
            fileModifiedAt: file.modifiedAt,
            available: 1,
            lastSeenScanId: scanId,
          });
        } catch {
          // The file remains counted as an error if even the fallback write
          // cannot acquire SQLite's write lock.
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
