import type { TrackRow } from "./prisma/models.js";

const MAX_TRACK_GENRES = 24;
const MAX_GENRE_LENGTH = 80;

export function normalizeGenres(
  values: readonly unknown[] | null | undefined,
): string[] {
  const genres: string[] = [];
  const seen = new Set<string>();
  for (const value of values ?? []) {
    if (typeof value !== "string") continue;
    const genre = value
      .normalize("NFKC")
      .replace(/\s+/gu, " ")
      .trim()
      .slice(0, MAX_GENRE_LENGTH);
    if (!genre) continue;
    const key = genre.toLocaleLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    genres.push(genre);
    if (genres.length === MAX_TRACK_GENRES) break;
  }
  return genres;
}

export function serializeGenres(
  values: readonly unknown[] | null | undefined,
): string | null {
  const genres = normalizeGenres(values);
  return genres.length ? JSON.stringify(genres) : null;
}

export function parseStoredGenres(value: string | null): string[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed) ? normalizeGenres(parsed) : [];
  } catch {
    return [];
  }
}

export function effectiveTrackGenres(
  track: Pick<TrackRow, "genres" | "metadataGenres">,
): string[] {
  const metadataGenres = parseStoredGenres(track.metadataGenres);
  return metadataGenres.length
    ? metadataGenres
    : parseStoredGenres(track.genres);
}
