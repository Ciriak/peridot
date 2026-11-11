import type { AlbumGroup } from "./library";

export const SEARCH_RECENTS_STORAGE_VERSION = 1;
export const SEARCH_RECENTS_STORAGE_PREFIX = "peridot:search-recents";
export const SEARCH_RECENTS_LIMIT = 8;

export interface SearchRecentAlbum {
  title: string;
  artist: string;
}

export interface SearchRecentsScope {
  serverAddress: string;
  userId: string;
}

export interface SearchRecentsStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

interface StoredSearchRecents {
  version: number;
  serverAddress: string;
  userId: string;
  items: SearchRecentAlbum[];
}

function searchAlbumKey(album: SearchRecentAlbum): string {
  return `${album.artist.trim().toLowerCase()}\u0000${album.title
    .trim()
    .toLowerCase()}`;
}

function normalizeAlbum(album: SearchRecentAlbum): SearchRecentAlbum | null {
  const title = album.title.trim();
  const artist = album.artist.trim();
  return title && artist ? { title, artist } : null;
}

function normalizeRecentAlbums(
  albums: readonly SearchRecentAlbum[],
): SearchRecentAlbum[] {
  const seen = new Set<string>();
  const normalized: SearchRecentAlbum[] = [];
  for (const value of albums) {
    const album = normalizeAlbum(value);
    if (!album) continue;
    const key = searchAlbumKey(album);
    if (seen.has(key)) continue;
    seen.add(key);
    normalized.push(album);
    if (normalized.length === SEARCH_RECENTS_LIMIT) break;
  }
  return normalized;
}

export function searchRecentsStorageKey(scope: SearchRecentsScope): string {
  return `${SEARCH_RECENTS_STORAGE_PREFIX}:v${SEARCH_RECENTS_STORAGE_VERSION}:${encodeURIComponent(scope.serverAddress)}:${encodeURIComponent(scope.userId)}`;
}

export function addRecentAlbum(
  recents: readonly SearchRecentAlbum[],
  album: SearchRecentAlbum,
): SearchRecentAlbum[] {
  const normalized = normalizeAlbum(album);
  return normalized
    ? normalizeRecentAlbums([
        normalized,
        ...recents.filter(
          (candidate) =>
            searchAlbumKey(candidate) !== searchAlbumKey(normalized),
        ),
      ])
    : normalizeRecentAlbums(recents);
}

export function parsePersistedSearchRecents(
  raw: string,
  scope: SearchRecentsScope,
): SearchRecentAlbum[] | null {
  try {
    const candidate = JSON.parse(raw) as Partial<StoredSearchRecents>;
    if (
      candidate.version !== SEARCH_RECENTS_STORAGE_VERSION ||
      candidate.serverAddress !== scope.serverAddress ||
      candidate.userId !== scope.userId ||
      !Array.isArray(candidate.items) ||
      !candidate.items.every(
        (item) =>
          item !== null &&
          typeof item === "object" &&
          typeof item.title === "string" &&
          typeof item.artist === "string",
      )
    ) {
      return null;
    }
    return normalizeRecentAlbums(candidate.items);
  } catch {
    return null;
  }
}

export function readPersistedSearchRecents(
  storage: SearchRecentsStorage,
  scope: SearchRecentsScope,
): SearchRecentAlbum[] {
  try {
    const raw = storage.getItem(searchRecentsStorageKey(scope));
    return raw ? (parsePersistedSearchRecents(raw, scope) ?? []) : [];
  } catch {
    return [];
  }
}

export function savePersistedSearchRecents(
  storage: SearchRecentsStorage,
  scope: SearchRecentsScope,
  recents: readonly SearchRecentAlbum[],
): boolean {
  const stored: StoredSearchRecents = {
    version: SEARCH_RECENTS_STORAGE_VERSION,
    serverAddress: scope.serverAddress,
    userId: scope.userId,
    items: normalizeRecentAlbums(recents),
  };
  try {
    storage.setItem(searchRecentsStorageKey(scope), JSON.stringify(stored));
    return true;
  } catch {
    return false;
  }
}

export function resolveRecentAlbums(
  recents: readonly SearchRecentAlbum[],
  albums: readonly AlbumGroup[],
): AlbumGroup[] {
  const albumsByKey = new Map(
    albums.map((album) => [searchAlbumKey(album), album]),
  );
  return normalizeRecentAlbums(recents).flatMap((recent) => {
    const album = albumsByKey.get(searchAlbumKey(recent));
    return album ? [album] : [];
  });
}
