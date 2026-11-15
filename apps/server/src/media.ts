import type { MediaType, TrackMediaFilter } from "@peridot/contracts";

const MEDIA_TYPES = new Set<MediaType>(["music", "audiobook", "podcast"]);

export function mediaTypeOrNull(value: unknown): MediaType | null {
  return typeof value === "string" && MEDIA_TYPES.has(value as MediaType)
    ? (value as MediaType)
    : null;
}

export function mediaType(value: unknown): MediaType {
  return mediaTypeOrNull(value) ?? "music";
}

export function storedMediaType(value: string): MediaType {
  return mediaType(value);
}

export function trackMediaFilter(value: unknown): TrackMediaFilter {
  return value === "all" ? "all" : mediaType(value);
}

export function parsePublishedAt(...values: unknown[]): Date | null {
  for (const value of values) {
    if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
    if (typeof value === "number" && Number.isFinite(value)) {
      const year = value >= 1000 && value <= 9999 ? value : null;
      if (year !== null) return new Date(Date.UTC(year, 0, 1));
      continue;
    }
    if (typeof value !== "string" || !value.trim()) continue;
    const text = value.trim();
    const yearOnly = /^\d{4}$/.test(text);
    const parsed = yearOnly
      ? new Date(Date.UTC(Number(text), 0, 1))
      : new Date(text);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }
  return null;
}

export function collectionFallbackTitle(relativePath: string): string {
  const normalized = relativePath.replaceAll("\\", "/");
  const segments = normalized.split("/").filter(Boolean);
  return segments.at(-2)?.trim() || "Unknown collection";
}
