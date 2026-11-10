const ARTIST_SEPARATOR = /(?:\s*[;,]\s*|\s+(?:feat\.?|ft\.?|featuring)\s+)/i;

function splitArtistCredit(value: string): string[] {
  return value
    .split(ARTIST_SEPARATOR)
    .map((artist) => artist.trim())
    .filter(Boolean);
}

export function normalizeArtistCredits(
  values: readonly (string | null | undefined)[],
): string[] {
  const artists: string[] = [];
  const seen = new Set<string>();

  for (const value of values) {
    if (!value) continue;
    for (const artist of splitArtistCredit(value)) {
      const key = artist.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      artists.push(artist);
    }
  }

  return artists.length ? artists : ["Unknown Artist"];
}

export function serializeArtistCredits(artists: readonly string[]): string {
  return JSON.stringify(normalizeArtistCredits(artists));
}

export function parseStoredArtistCredits(
  stored: string | null,
  fallback: string,
): string[] {
  if (stored) {
    try {
      const parsed = JSON.parse(stored) as unknown;
      if (Array.isArray(parsed)) {
        const artists = parsed.filter(
          (artist): artist is string => typeof artist === "string",
        );
        if (artists.length) return normalizeArtistCredits(artists);
      }
    } catch {
      // Legacy or hand-edited rows fall back to their display artist.
    }
  }
  return normalizeArtistCredits([fallback]);
}
