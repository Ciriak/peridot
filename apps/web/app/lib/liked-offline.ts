import type {
  AlbumListResponse,
  AlbumSummaryResponse,
  MediaListResponse,
  MediaResponse,
} from "@peridot/contracts";

export type LikedPageLoader<T> = (
  cursor: string | null,
) => Promise<{ items: T[]; nextCursor: string | null }>;

export type LikedTrackPageLoader = (
  cursor: string | null,
) => Promise<MediaListResponse>;
export type LikedAlbumPageLoader = (
  cursor: string | null,
) => Promise<AlbumListResponse>;

async function loadAllLikedItems<T>(
  loadPage: LikedPageLoader<T>,
  itemId: (item: T) => string,
  label: string,
): Promise<T[]> {
  const items: T[] = [];
  const seenIds = new Set<string>();
  const seenCursors = new Set<string>();
  let cursor: string | null = null;

  while (true) {
    const page = await loadPage(cursor);
    for (const item of page.items) {
      const id = itemId(item);
      if (seenIds.has(id)) continue;
      seenIds.add(id);
      items.push(item);
    }

    if (!page.nextCursor) return items;
    if (seenCursors.has(page.nextCursor)) {
      throw new Error(`Liked ${label} pagination repeated a cursor.`);
    }
    seenCursors.add(page.nextCursor);
    cursor = page.nextCursor;
  }
}

export function loadAllLikedTracks(
  loadPage: LikedTrackPageLoader,
): Promise<MediaResponse[]> {
  return loadAllLikedItems(loadPage, (track) => track.id, "track");
}

export function loadAllLikedAlbums(
  loadPage: LikedAlbumPageLoader,
): Promise<AlbumSummaryResponse[]> {
  return loadAllLikedItems(loadPage, (album) => album.id, "album");
}

export interface LikedTrackOfflineSaveOptions {
  isSaved: (mediaId: string) => boolean;
  save: (track: MediaResponse) => Promise<boolean>;
  shouldContinue?: () => boolean;
}

export interface LikedTrackOfflineSaveResult {
  failedTrackIds: string[];
  savedTrackIds: string[];
  stopped: boolean;
}

export async function saveLikedTracksOffline(
  tracks: MediaResponse[],
  options: LikedTrackOfflineSaveOptions,
): Promise<LikedTrackOfflineSaveResult> {
  const failedTrackIds: string[] = [];
  const savedTrackIds: string[] = [];

  for (const track of tracks) {
    if (options.shouldContinue && !options.shouldContinue()) {
      return { failedTrackIds, savedTrackIds, stopped: true };
    }
    if (!track.available || options.isSaved(track.id)) continue;

    try {
      if (await options.save(track)) {
        savedTrackIds.push(track.id);
      } else {
        failedTrackIds.push(track.id);
      }
    } catch {
      failedTrackIds.push(track.id);
    }
  }

  return { failedTrackIds, savedTrackIds, stopped: false };
}

export interface LikedAlbumOfflineSaveOptions {
  loadTracks: (album: AlbumSummaryResponse) => Promise<MediaResponse[]>;
  save: (
    album: AlbumSummaryResponse,
    tracks: MediaResponse[],
  ) => Promise<boolean>;
  shouldContinue?: () => boolean;
}

export interface LikedAlbumOfflineSaveResult {
  failedAlbumIds: string[];
  savedAlbumIds: string[];
  stopped: boolean;
}

export async function saveLikedAlbumsOffline(
  albums: AlbumSummaryResponse[],
  options: LikedAlbumOfflineSaveOptions,
): Promise<LikedAlbumOfflineSaveResult> {
  const failedAlbumIds: string[] = [];
  const savedAlbumIds: string[] = [];

  for (const album of albums) {
    if (options.shouldContinue && !options.shouldContinue()) {
      return { failedAlbumIds, savedAlbumIds, stopped: true };
    }

    try {
      const tracks = await options.loadTracks(album);
      if (options.shouldContinue && !options.shouldContinue()) {
        return { failedAlbumIds, savedAlbumIds, stopped: true };
      }
      if (await options.save(album, tracks)) {
        savedAlbumIds.push(album.id);
      } else {
        failedAlbumIds.push(album.id);
      }
    } catch {
      failedAlbumIds.push(album.id);
    }
  }

  return { failedAlbumIds, savedAlbumIds, stopped: false };
}
