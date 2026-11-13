import type { AlbumSummaryResponse, TrackResponse } from "@peridot/contracts";

export const HOME_SUGGESTION_LIMIT = 10;

interface HomeAlbumSuggestionOptions {
  albums: readonly AlbumSummaryResponse[];
  likedAlbumIds: readonly string[];
  likedArtistKeys: readonly string[];
  limit?: number;
}

interface HomeTrackSuggestionOptions {
  tracks: readonly TrackResponse[];
  likedTrackIds: readonly string[];
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
  likedAlbumIds,
  likedArtistKeys,
  limit,
}: HomeAlbumSuggestionOptions): AlbumSummaryResponse[] {
  const likedAlbums = new Set(likedAlbumIds);
  const likedArtists = new Set(likedArtistKeys);

  return albums
    .filter((album) => !album.liked && !likedAlbums.has(album.id))
    .sort(
      (left, right) =>
        Number(hasLikedArtist(right.artists, likedArtists)) -
        Number(hasLikedArtist(left.artists, likedArtists)),
    )
    .slice(0, suggestionLimit(limit));
}

export function selectHomeTrackSuggestions({
  tracks,
  likedTrackIds,
  likedArtistKeys,
  limit,
}: HomeTrackSuggestionOptions): TrackResponse[] {
  const likedTracks = new Set(likedTrackIds);
  const likedArtists = new Set(likedArtistKeys);

  return tracks
    .filter((track) => !track.liked && !likedTracks.has(track.id))
    .sort(
      (left, right) =>
        Number(hasLikedArtist(right.artists, likedArtists)) -
        Number(hasLikedArtist(left.artists, likedArtists)),
    )
    .slice(0, suggestionLimit(limit));
}
