import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { parentPort } from "node:worker_threads";
import { parseFile } from "music-metadata";
import {
  AUDIO_MIME_TYPES,
  type ScanDirectoryResult,
  type ScanWorkerMetadata,
  type ScanWorkerRequest,
  type ScanWorkerResponse,
} from "./scan-worker-protocol.js";

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

const folderCoverCache = new Map<
  string,
  ScanWorkerMetadata["cover"] | undefined
>();

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "The scan worker failed.";
}

function tagValues(value: string | string[] | undefined): string[] {
  return Array.isArray(value) ? value : value ? [value] : [];
}

async function listDirectory(directory: string): Promise<ScanDirectoryResult> {
  const entries = await readdir(directory, { withFileTypes: true });
  const directories: string[] = [];
  const audioFiles: ScanDirectoryResult["audioFiles"] = [];
  for (const entry of entries) {
    if (entry.isSymbolicLink()) continue;
    const absolutePath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      directories.push(absolutePath);
      continue;
    }
    if (!entry.isFile()) continue;
    const mimeType = AUDIO_MIME_TYPES.get(
      path.extname(entry.name).toLowerCase(),
    );
    if (!mimeType) continue;
    const fileStat = await stat(absolutePath, { bigint: true });
    audioFiles.push({
      absolutePath,
      mimeType,
      size: String(fileStat.size),
      modifiedAtMs: Number(fileStat.mtimeMs),
    });
  }
  return { directories, audioFiles };
}

async function folderCover(
  directory: string,
): Promise<ScanWorkerMetadata["cover"]> {
  if (folderCoverCache.has(directory)) {
    return folderCoverCache.get(directory) ?? null;
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
      const cover = { data: Uint8Array.from(data), mimeType };
      folderCoverCache.set(directory, cover);
      return cover;
    }
  } catch {
    // Missing or unreadable artwork leaves the album placeholder in place.
  }
  folderCoverCache.set(directory, null);
  return null;
}

async function coverFor(
  filePath: string,
  pictures:
    | readonly {
        data: Uint8Array;
        format: string;
        type?: string;
      }[]
    | undefined,
): Promise<ScanWorkerMetadata["cover"]> {
  const ordered = [...(pictures ?? [])].sort((left, right) => {
    const leftFront = /cover\s*\(front\)/i.test(left.type ?? "");
    const rightFront = /cover\s*\(front\)/i.test(right.type ?? "");
    return Number(rightFront) - Number(leftFront);
  });
  for (const picture of ordered) {
    const data = Uint8Array.from(picture.data);
    if (data.length && data.length <= MAX_COVER_BYTES) {
      return {
        data,
        mimeType: picture.format.startsWith("image/")
          ? picture.format
          : "image/jpeg",
      };
    }
  }
  return folderCover(path.dirname(filePath));
}

async function parseMetadata(filePath: string): Promise<ScanWorkerMetadata> {
  const metadata = await parseFile(filePath, {
    duration: true,
    skipCovers: false,
  });
  return {
    container: metadata.format.container ?? "",
    title: metadata.common.title?.trim() || null,
    artists: metadata.common.artists ?? [],
    artist: metadata.common.artist ?? null,
    albumArtists: metadata.common.albumartists ?? [],
    albumArtist: metadata.common.albumartist ?? null,
    album: metadata.common.album?.trim() || null,
    genres: metadata.common.genre ?? [],
    discNumber: metadata.common.disk.no ?? null,
    trackNumber: metadata.common.track.no ?? null,
    durationSeconds: Number.isFinite(metadata.format.duration)
      ? metadata.format.duration!
      : null,
    audioLossless: metadata.format.lossless === true,
    audioBitrate:
      metadata.format.bitrate !== undefined &&
      Number.isFinite(metadata.format.bitrate) &&
      metadata.format.bitrate > 0
        ? Math.round(metadata.format.bitrate)
        : null,
    musicBrainzRecordingIds: tagValues(metadata.common.musicbrainz_recordingid),
    isrcs: tagValues(metadata.common.isrc),
    acoustIds: tagValues(metadata.common.acoustid_id),
    releasedate: metadata.common.releasedate ?? null,
    originaldate: metadata.common.originaldate ?? null,
    date: metadata.common.date ?? null,
    year: metadata.common.year ?? null,
    podcast: metadata.common.podcast === true,
    podcastId: metadata.common.podcastId ?? null,
    podcastUrl: metadata.common.podcasturl ?? null,
    releaseTypes: metadata.common.releasetype ?? [],
    iTunesMediaType: metadata.common.stik ?? 0,
    cover: await coverFor(filePath, metadata.common.picture),
  };
}

async function handle(request: ScanWorkerRequest): Promise<ScanWorkerResponse> {
  try {
    if (request.type === "listDirectory") {
      return {
        id: request.id,
        ok: true,
        type: "listDirectory",
        result: await listDirectory(request.directory),
      };
    }
    return {
      id: request.id,
      ok: true,
      type: "parseFile",
      result: await parseMetadata(request.filePath),
    };
  } catch (error) {
    return {
      id: request.id,
      ok: false,
      error: errorMessage(error),
    };
  }
}

if (!parentPort) {
  throw new Error("The scan worker requires a parent thread.");
}

parentPort.on("message", (request: ScanWorkerRequest) => {
  void handle(request).then((response) => parentPort?.postMessage(response));
});
