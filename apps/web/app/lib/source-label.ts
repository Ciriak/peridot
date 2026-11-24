import type { SourceKind } from "@peridot/contracts";
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

export function sourceKindIcon(kind: SourceKind | null | undefined) {
  if (kind === "path") return icons.folder;
  if (kind === "jellyfin") return icons.jellyfin;
  if (kind === "url" || kind === "torznab") return icons.globe;
  return null;
}

export function sourceKindLabelKey(
  kind: SourceKind | null | undefined,
): string | null {
  if (kind === "path") return "settings.sources.path";
  if (kind === "jellyfin") return "settings.sources.jellyfin.title";
  if (kind === "torznab") return "indexer.title";
  if (kind === "url") return "settings.sources.url";
  return null;
}
