import type {
  AlbumSummaryResponse,
  ArtistSummaryResponse,
  TrackResponse,
} from "@peridot/contracts";
import { clear, createStore, get, set } from "idb-keyval";
import {
  listAlbums,
  listArtists,
  listTracks,
  type CardListOptions,
  type TrackListOptions,
} from "./peridot-client.ts";
import type { PeridotQueryScope } from "./query-keys";
import { sortTracks, trackArtistNames } from "./library.ts";

export const OFFLINE_CATALOG_VERSION = 1 as const;
export const OFFLINE_DATABASE = "peridot-web-offline-catalog-v1";
const OFFLINE_CATALOG_STORE = "offline-catalog";
const OFFLINE_CATALOG_KEY = "catalog-snapshot";
const OFFLINE_PAGE_SIZE = 200;

export interface OfflineCatalogSnapshot {
  version: typeof OFFLINE_CATALOG_VERSION;
  scope: PeridotQueryScope;
  tracks: TrackResponse[];
  albums: AlbumSummaryResponse[];
  artists: ArtistSummaryResponse[];
  catalogRevision: number;
  syncedAt: string;
}

function offlineCatalogStore() {
  return createStore(OFFLINE_DATABASE, OFFLINE_CATALOG_STORE);
}

function normalize(value: string): string {
  return value.trim().toLowerCase();
}

function matchesQuery(
  values: readonly (string | null | undefined)[],
  query?: string,
) {
  const terms = normalize(query ?? "")
    .split(/\s+/)
    .filter(Boolean);
  if (!terms.length) return true;
  const haystack = values.map((value) => normalize(value ?? "")).join(" ");
  return terms.every((term) => haystack.includes(term));
}

function compareText(left: string, right: string): number {
  return left.localeCompare(right, "en-US", {
    numeric: true,
    sensitivity: "base",
  });
}

function compareDirection(
  result: number,
  direction: "asc" | "desc" | undefined,
): number {
  return direction === "desc" ? -result : result;
}

export function offlineTracks(
  snapshot: OfflineCatalogSnapshot,
  options: TrackListOptions = {},
): TrackResponse[] {
  const artistNames =
    options.artistId === undefined
      ? null
      : new Set(
          (() => {
            const artist = snapshot.artists.find(
              (candidate) => candidate.id === options.artistId,
            );
            return artist ? [artist.name, artist.localName].map(normalize) : [];
          })(),
        );
  const availability = options.availability ?? "available";
  const filtered = snapshot.tracks.filter((track) => {
    if (availability === "available" && !track.available) return false;
    if (availability === "unavailable" && track.available) return false;
    if (options.albumId && track.albumId !== options.albumId) return false;
    if (options.liked && !track.liked) return false;
    if (
      artistNames &&
      !trackArtistNames(track).some((artist) =>
        artistNames.has(normalize(artist)),
      )
    ) {
      return false;
    }
    return matchesQuery(
      [track.title, track.artist, ...track.artists, track.album],
      options.query,
    );
  });

  if (
    !options.sort ||
    options.sort === "track" ||
    options.sort === "title" ||
    options.sort === "artist" ||
    options.sort === "album" ||
    options.sort === "duration"
  ) {
    return sortTracks(filtered, {
      field: options.sort === "track" ? "number" : (options.sort ?? "title"),
      direction: options.direction ?? "asc",
    });
  }
  return filtered;
}

export function offlineAlbums(
  snapshot: OfflineCatalogSnapshot,
  options: CardListOptions = {},
): AlbumSummaryResponse[] {
  const artist = options.artistId
    ? snapshot.artists.find((candidate) => candidate.id === options.artistId)
    : null;
  const artistNames = artist
    ? new Set([artist.name, artist.localName].map(normalize))
    : null;
  return snapshot.albums
    .filter((album) => {
      if (options.liked && !album.liked) return false;
      if (
        artistNames &&
        !album.artists.some((name) => artistNames.has(normalize(name))) &&
        !artistNames.has(normalize(album.artist))
      ) {
        return false;
      }
      return matchesQuery(
        [album.title, album.artist, ...album.artists],
        options.query,
      );
    })
    .sort((left, right) =>
      compareDirection(
        compareText(left.title, right.title) ||
          compareText(left.artist, right.artist),
        options.direction,
      ),
    );
}

export function offlineArtists(
  snapshot: OfflineCatalogSnapshot,
  options: CardListOptions = {},
): ArtistSummaryResponse[] {
  return snapshot.artists
    .filter((artist) => {
      if (options.liked && !artist.liked) return false;
      return matchesQuery([artist.name, artist.localName], options.query);
    })
    .sort((left, right) =>
      compareDirection(compareText(left.name, right.name), options.direction),
    );
}

export async function readOfflineCatalog(
  scope: PeridotQueryScope,
): Promise<OfflineCatalogSnapshot | null> {
  if (typeof indexedDB === "undefined") return null;
  const snapshot = await get<OfflineCatalogSnapshot>(
    OFFLINE_CATALOG_KEY,
    offlineCatalogStore(),
  );
  if (
    !snapshot ||
    snapshot.version !== OFFLINE_CATALOG_VERSION ||
    normalize(snapshot.scope.serverAddress) !==
      normalize(scope.serverAddress) ||
    snapshot.scope.userId !== scope.userId
  ) {
    return null;
  }
  return snapshot;
}

async function collectPages<T>(
  fetchPage: (cursor: string | null) => Promise<{
    items: T[];
    nextCursor: string | null;
    catalogRevision: number;
  }>,
): Promise<{ items: T[]; catalogRevision: number }> {
  const items: T[] = [];
  const seenCursors = new Set<string>();
  let cursor: string | null = null;
  let catalogRevision = 0;
  do {
    const page = await fetchPage(cursor);
    items.push(...page.items);
    catalogRevision = Math.max(catalogRevision, page.catalogRevision);
    const nextCursor: string | null = page.nextCursor;
    if (nextCursor && seenCursors.has(nextCursor)) {
      throw new Error("The catalog returned a repeated cursor.");
    }
    if (nextCursor) seenCursors.add(nextCursor);
    cursor = nextCursor;
  } while (cursor);
  return { items, catalogRevision };
}

export async function syncOfflineCatalog(
  scope: PeridotQueryScope,
  token: string,
): Promise<OfflineCatalogSnapshot> {
  if (typeof indexedDB === "undefined") {
    throw new Error("Offline catalog storage is unavailable.");
  }

  const [trackPage, albumPage, artistPage] = await Promise.all([
    collectPages((cursor) =>
      listTracks(scope.serverAddress, token, {
        availability: "all",
        limit: OFFLINE_PAGE_SIZE,
        sort: "title",
        direction: "asc",
        ...(cursor ? { cursor } : {}),
      }),
    ),
    collectPages((cursor) =>
      listAlbums(scope.serverAddress, token, {
        limit: OFFLINE_PAGE_SIZE,
        sort: "title",
        direction: "asc",
        ...(cursor ? { cursor } : {}),
      }),
    ),
    collectPages((cursor) =>
      listArtists(scope.serverAddress, token, {
        limit: OFFLINE_PAGE_SIZE,
        ...(cursor ? { cursor } : {}),
      }),
    ),
  ]);

  const snapshot: OfflineCatalogSnapshot = {
    version: OFFLINE_CATALOG_VERSION,
    scope,
    tracks: trackPage.items,
    albums: albumPage.items,
    artists: artistPage.items,
    catalogRevision: Math.max(
      trackPage.catalogRevision,
      albumPage.catalogRevision,
      artistPage.catalogRevision,
    ),
    syncedAt: new Date().toISOString(),
  };
  await set(OFFLINE_CATALOG_KEY, snapshot, offlineCatalogStore());
  return snapshot;
}

export async function clearOfflineCatalog(): Promise<void> {
  if (typeof indexedDB !== "undefined") {
    await clear(offlineCatalogStore());
  }
}
