import type { AlbumSummaryResponse, TrackResponse } from "@peridot/contracts";

export const HOME_SUGGESTION_LIMIT = 10;

interface HomeAlbumSuggestionOptions {
  albums: readonly AlbumSummaryResponse[];
  likedArtistKeys: readonly string[];
  limit?: number;
}

interface HomeTrackSuggestionOptions {
  tracks: readonly TrackResponse[];
  likedArtistKeys: readonly string[];
  limit?: number;
}

function suggestionLimit(value: number | undefined): number {
  return Math.max(0, Math.floor(value ?? HOME_SUGGESTION_LIMIT));
}

function hasLikedArtist(
  artists: readonly string[],
  likedArtistKeys: ReadonlySet<string>,
): boolean {
  return artists.some((artist) =>
    likedArtistKeys.has(artist.trim().toLowerCase()),
  );
}

export function selectHomeAlbumSuggestions({
  albums,
  likedArtistKeys,
  limit,
}: HomeAlbumSuggestionOptions): AlbumSummaryResponse[] {
  const likedArtists = new Set(likedArtistKeys);

  return [...albums]
    .sort(
      (left, right) =>
        Number(hasLikedArtist(right.artists, likedArtists)) -
        Number(hasLikedArtist(left.artists, likedArtists)),
    )
    .slice(0, suggestionLimit(limit));
}

export function selectHomeTrackSuggestions({
  tracks,
  likedArtistKeys,
  limit,
}: HomeTrackSuggestionOptions): TrackResponse[] {
  const likedArtists = new Set(likedArtistKeys);

  return [...tracks]
    .sort(
      (left, right) =>
        Number(hasLikedArtist(right.artists, likedArtists)) -
        Number(hasLikedArtist(left.artists, likedArtists)),
    )
    .slice(0, suggestionLimit(limit));
}
