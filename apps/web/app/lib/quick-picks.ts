import type { QuickPickItemResponse, TrackResponse } from "@peridot/contracts";
import {
  findAlbum,
  groupAlbums,
  trackArtistNames,
  type AlbumGroup,
} from "./library.ts";

export interface ResolvedQuickPickTrack {
  kind: "track";
  key: string;
  track: TrackResponse;
  coverUrl: string | null;
}

export interface ResolvedQuickPickAlbum {
  kind: "album";
  key: string;
  album: AlbumGroup;
  coverUrl: string | null;
}

export type ResolvedQuickPickItem =
  ResolvedQuickPickTrack | ResolvedQuickPickAlbum;

export function quickPickArtistNames(
  item: ResolvedQuickPickItem,
): readonly string[] {
  return item.kind === "track"
    ? trackArtistNames(item.track)
    : item.album.artists;
}

export function resolveQuickPicks(
  items: readonly QuickPickItemResponse[],
  tracks: readonly TrackResponse[],
): ResolvedQuickPickItem[] {
  const tracksById = new Map(tracks.map((track) => [track.id, track]));
  const albums = groupAlbums(tracks);
  const albumsByTrackId = new Map(
    albums.flatMap((album) =>
      album.trackIds.map((trackId) => [trackId, album] as const),
    ),
  );

  return items.flatMap((item): ResolvedQuickPickItem[] => {
    if (item.kind === "track") {
      const track = tracksById.get(item.trackId);
      if (!track) return [];
      return [
        {
          kind: "track",
          key: item.key,
          track,
          coverUrl: albumsByTrackId.get(track.id)?.coverUrl ?? track.coverUrl,
        },
      ];
    }
    const album = findAlbum(albums, item.title, item.artist);
    return album
      ? [{ kind: "album", key: item.key, album, coverUrl: album.coverUrl }]
      : [];
  });
}
