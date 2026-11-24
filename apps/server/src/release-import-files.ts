import path from "node:path";
import { AUDIO_MIME_TYPES } from "./scan-worker-protocol.js";

export interface TorrentFile {
  name: string;
  progress: number;
}

export function normalizeReleaseImportPath(value: string): string | null {
  if (!value || value.includes("\0")) return null;
  const portable = value.replaceAll("\\", "/");
  if (portable.startsWith("/") || /^[A-Za-z]:/.test(portable)) return null;
  const normalized = path.normalize(portable);
  if (
    normalized === "." ||
    normalized === ".." ||
    normalized.startsWith(`..${path.sep}`) ||
    path.isAbsolute(normalized)
  ) {
    return null;
  }
  return normalized;
}

export function completedAudioReleasePaths(
  files: readonly TorrentFile[],
): string[] {
  const paths = new Set<string>();
  for (const file of files) {
    if (file.progress < 1) continue;
    const relativePath = normalizeReleaseImportPath(file.name);
    if (
      !relativePath ||
      !AUDIO_MIME_TYPES.has(path.extname(relativePath).toLowerCase())
    ) {
      continue;
    }
    paths.add(relativePath);
  }
  return [...paths];
}
