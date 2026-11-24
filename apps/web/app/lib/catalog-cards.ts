import type {
  AlbumSummaryResponse,
  PlaylistSummaryResponse,
  MediaResponse,
} from "@peridot/contracts";

export type CatalogCardItem =
  | { kind: "album"; album: AlbumSummaryResponse }
  | { kind: "media"; media: MediaResponse }
  | { kind: "playlist"; playlist: PlaylistSummaryResponse };

export function albumCatalogCard(album: AlbumSummaryResponse): CatalogCardItem {
  return { kind: "album", album };
}

export function mediaCatalogCard(media: MediaResponse): CatalogCardItem {
  return { kind: "media", media };
}

export function playlistCatalogCard(
  playlist: PlaylistSummaryResponse,
): CatalogCardItem {
  return { kind: "playlist", playlist };
}

export function catalogCardKey(item: CatalogCardItem): string {
  if (item.kind === "album") return `album:${item.album.id}`;
  if (item.kind === "media") return `media:${item.media.id}`;
  return `playlist:${item.playlist.id}`;
}
