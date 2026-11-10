import path from "node:path";
import { opendir, stat } from "node:fs/promises";
import { parseFile } from "music-metadata";
import type { LibraryScan } from "./generated/prisma/client.js";
import type { Database } from "./database.js";
import { getPathSources } from "./sources.js";

const AUDIO_MIME_TYPES = new Map([
  [".mp3", "audio/mpeg"],
  [".m4a", "audio/mp4"],
  [".aac", "audio/aac"],
  [".ogg", "audio/ogg"],
  [".opus", "audio/ogg"],
  [".wav", "audio/wav"],
  [".flac", "audio/flac"],
]);

const SCAN_CONCURRENCY = 4;

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

  constructor(private readonly database: Database) {}

  async markInterruptedScans(): Promise<void> {
    await this.database.libraryScan.updateMany({
      where: { status: { in: ["queued", "running"] } },
      data: {
        status: "interrupted",
        completedAt: new Date(),
        failureSummary: "The server stopped before this scan completed.",
      },
    });
  }

  async queueScan(): Promise<LibraryScan | null> {
    if (this.queueing || this.activeScan) return null;
    this.queueing = true;
    try {
      const existing = await this.database.libraryScan.findFirst({
        where: { status: { in: ["queued", "running"] } },
      });
      if (existing) return null;
      const scan = await this.database.libraryScan.create({
        data: { status: "queued" },
      });
      this.activeScan = new Promise((resolve) => setImmediate(resolve))
        .then(() => this.runScan(scan.id))
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
    await this.activeScan;
  }

  private async runScan(scanId: string): Promise<void> {
    const counts: ScanCounts = {
      createdCount: 0,
      updatedCount: 0,
      unchangedCount: 0,
      errorCount: 0,
    };

    try {
      await this.database.libraryScan.update({
        where: { id: scanId },
        data: { status: "running", startedAt: new Date() },
      });
      const sources = await getPathSources(this.database);
      if (sources.length === 0) {
        await this.database.libraryScan.update({
          where: { id: scanId },
          data: {
            status: "failed",
            completedAt: new Date(),
            failureSummary: "No music library sources are configured.",
          },
        });
        return;
      }
      const files: SourceFile[] = [];
      for (const source of sources) {
        for (const file of await discoverAudioFiles(source.path)) {
          files.push({ ...file, sourceId: source.id });
        }
      }
      await this.database.libraryScan.update({
        where: { id: scanId },
        data: { discoveredCount: files.length },
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

      const unavailable = await this.database.track.updateMany({
        where: {
          available: true,
          OR: [{ lastSeenScanId: null }, { lastSeenScanId: { not: scanId } }],
        },
        data: { available: false },
      });
      await this.database.libraryScan.update({
        where: { id: scanId },
        data: {
          status: "completed",
          completedAt: new Date(),
          unavailableCount: unavailable.count,
          ...counts,
        },
      });
    } catch {
      await this.database.libraryScan.update({
        where: { id: scanId },
        data: {
          status: "failed",
          completedAt: new Date(),
          failureSummary:
            "The library scan failed while reading the configured root.",
          ...counts,
        },
      });
    }
  }

  private async processFile(
    file: SourceFile,
    scanId: string,
    counts: ScanCounts,
  ): Promise<void> {
    const where = {
      sourceId_relativePath: {
        sourceId: file.sourceId,
        relativePath: file.relativePath,
      },
    };
    const existing = await this.database.track.findUnique({
      where,
    });
    const unchanged =
      existing?.fileSizeBytes === file.size &&
      existing.fileModifiedAt.getTime() === file.modifiedAt.getTime();

    if (existing && unchanged) {
      await this.database.track.update({
        where: { id: existing.id },
        data: { available: true, lastSeenScanId: scanId },
      });
      counts.unchangedCount += 1;
      return;
    }

    try {
      const metadata = await parseFile(file.absolutePath, {
        duration: true,
        skipCovers: true,
      });
      if (!metadata.format.container) {
        throw new Error("Audio format was not recognized");
      }
      const title =
        metadata.common.title?.trim() || path.parse(file.relativePath).name;
      const artist =
        metadata.common.artists?.find((value) => value.trim())?.trim() ||
        metadata.common.artist?.trim() ||
        "Unknown Artist";
      const album = metadata.common.album?.trim() || null;
      const durationMs = Number.isFinite(metadata.format.duration)
        ? Math.round(metadata.format.duration! * 1000)
        : null;

      await this.database.track.upsert({
        where,
        create: {
          title,
          artist,
          album,
          durationMs,
          relativePath: file.relativePath,
          sourceId: file.sourceId,
          mimeType: file.mimeType,
          fileSizeBytes: file.size,
          fileModifiedAt: file.modifiedAt,
          available: true,
          lastSeenScanId: scanId,
        },
        update: {
          title,
          artist,
          album,
          durationMs,
          mimeType: file.mimeType,
          fileSizeBytes: file.size,
          fileModifiedAt: file.modifiedAt,
          available: true,
          lastSeenScanId: scanId,
        },
      });
      if (existing) counts.updatedCount += 1;
      else counts.createdCount += 1;
    } catch {
      counts.errorCount += 1;
      if (existing) {
        await this.database.track.update({
          where: { id: existing.id },
          data: {
            fileSizeBytes: file.size,
            fileModifiedAt: file.modifiedAt,
            available: true,
            lastSeenScanId: scanId,
          },
        });
      }
    }
  }
}
