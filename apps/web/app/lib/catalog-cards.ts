import type {
  AlbumSummaryResponse,
  PlaylistSummaryResponse,
  TrackResponse,
} from "@peridot/contracts";

export type CatalogCardItem =
  | { kind: "album"; album: AlbumSummaryResponse }
  | { kind: "track"; track: TrackResponse }
  | { kind: "playlist"; playlist: PlaylistSummaryResponse };

export function albumCatalogCard(album: AlbumSummaryResponse): CatalogCardItem {
  return { kind: "album", album };
}

export function trackCatalogCard(track: TrackResponse): CatalogCardItem {
  return { kind: "track", track };
}

export function playlistCatalogCard(
  playlist: PlaylistSummaryResponse,
): CatalogCardItem {
  return { kind: "playlist", playlist };
}

export function catalogCardKey(item: CatalogCardItem): string {
  if (item.kind === "album") return `album:${item.album.id}`;
  if (item.kind === "track") return `track:${item.track.id}`;
  return `playlist:${item.playlist.id}`;
}
