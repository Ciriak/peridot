import type { LibrarySourceKind } from "@peridot/contracts";
import { icons } from "./icons.ts";

export function sourceFolderName(path: string): string {
  const trimmed = path.trim();
  const withoutTrailingSeparators = trimmed.replace(/[\\/]+$/, "");
  if (!withoutTrailingSeparators) return trimmed;

  const separatorIndex = Math.max(
    withoutTrailingSeparators.lastIndexOf("/"),
    withoutTrailingSeparators.lastIndexOf("\\"),
  );
  return withoutTrailingSeparators.slice(separatorIndex + 1);
}

export function sourceKindIcon(
  kind: LibrarySourceKind | "torznab" | null | undefined,
) {
  if (kind === "path") return icons.folder;
  if (kind === "jellyfin") return icons.jellyfin;
  if (kind === "torznab") return icons.download;
  return null;
}

export function sourceKindLabelKey(
  kind: LibrarySourceKind | "torznab" | null | undefined,
): string | null {
  if (kind === "path") return "settings.sources.path";
  if (kind === "jellyfin") return "settings.sources.jellyfin.title";
  if (kind === "torznab") return "indexer.title";
  return null;
}
