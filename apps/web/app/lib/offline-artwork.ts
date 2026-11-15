import type { PeridotQueryScope } from "./query-keys";

export const OFFLINE_ARTWORK_CACHE = "peridot-artwork-v2";
const LEGACY_ARTWORK_CACHE = "peridot-artwork-v1";
const ARTWORK_CONCURRENCY = 4;

type ArtworkKind = "cover" | "artist";

export interface ArtworkIdentity {
  kind: ArtworkKind;
  assetId: string;
}

export function artworkIdentity(
  imageUrl: string | null | undefined,
): ArtworkIdentity | null {
  if (!imageUrl) return null;
  try {
    const url = new URL(imageUrl, "http://peridot.local");
    const cover = /^\/api\/covers\/([^/]+)\/?$/.exec(url.pathname);
    if (cover?.[1]) {
      return { kind: "cover", assetId: decodeURIComponent(cover[1]) };
    }
    const legacyCover = /^\/api\/tracks\/([^/]+)\/cover\/?$/.exec(url.pathname);
    if (legacyCover?.[1]) {
      return {
        kind: "cover",
        assetId: `track:${decodeURIComponent(legacyCover[1])}`,
      };
    }
    const artist = /^\/api\/artists\/([^/]+)\/image\/?$/.exec(url.pathname);
    if (artist?.[1]) {
      return { kind: "artist", assetId: decodeURIComponent(artist[1]) };
    }
  } catch {
    return null;
  }
  return null;
}

function artworkStorageKey(
  scope: PeridotQueryScope,
  identity: ArtworkIdentity,
): string {
  return [
    encodeURIComponent(scope.serverAddress),
    encodeURIComponent(scope.userId),
    identity.kind,
    encodeURIComponent(identity.assetId),
  ].join(":");
}

export function offlineArtworkCacheRequest(
  scope: PeridotQueryScope,
  imageUrl: string,
  origin = globalThis.location?.origin ?? "http://peridot.local",
): Request | null {
  const identity = artworkIdentity(imageUrl);
  if (!identity) return null;
  return new Request(
    new URL(
      `/__peridot/offline-artwork/${artworkStorageKey(scope, identity)}`,
      origin,
    ),
  );
}

async function readArtwork(
  scope: PeridotQueryScope,
  imageUrl: string,
): Promise<{ cache: Cache; request: Request; response: Response } | null> {
  if (typeof caches === "undefined") return null;
  const request = offlineArtworkCacheRequest(scope, imageUrl);
  if (!request) return null;
  const cache = await caches.open(OFFLINE_ARTWORK_CACHE);
  const response = await cache.match(request);
  return response ? { cache, request, response } : null;
}

export async function cachedArtworkBlob(
  scope: PeridotQueryScope,
  imageUrl: string,
): Promise<Blob | null> {
  const cached = await readArtwork(scope, imageUrl);
  return cached ? cached.response.blob() : null;
}

export async function loadArtworkBlob(
  scope: PeridotQueryScope,
  imageUrl: string,
  options: { refresh?: boolean } = {},
): Promise<Blob> {
  const request = offlineArtworkCacheRequest(scope, imageUrl);
  if (!request || typeof caches === "undefined") {
    throw new Error("Artwork caching is unavailable.");
  }
  const cache = await caches.open(OFFLINE_ARTWORK_CACHE);
  if (!options.refresh) {
    const cached = await cache.match(request);
    if (cached) return cached.blob();
  }

  const response = await fetch(imageUrl);
  if (!response.ok) {
    throw new Error("The artwork could not be downloaded.");
  }
  await cache.put(request, response.clone());
  return response.blob();
}

export async function warmOfflineArtwork(
  scope: PeridotQueryScope,
  imageUrls: readonly string[],
  options: { refresh?: boolean; concurrency?: number } = {},
): Promise<{ cached: number; failed: number }> {
  const urls = [
    ...new Set(
      imageUrls.filter(
        (url): url is string => Boolean(url) && artworkIdentity(url) !== null,
      ),
    ),
  ];
  let next = 0;
  let cached = 0;
  let failed = 0;
  const workerCount = Math.max(
    1,
    Math.min(options.concurrency ?? ARTWORK_CONCURRENCY, urls.length),
  );
  await Promise.all(
    Array.from({ length: workerCount }, async () => {
      while (next < urls.length) {
        const imageUrl = urls[next++];
        if (!imageUrl) continue;
        try {
          await loadArtworkBlob(scope, imageUrl, {
            refresh: options.refresh,
          });
          cached += 1;
        } catch {
          failed += 1;
        }
      }
    }),
  );
  return { cached, failed };
}

export async function clearOfflineArtwork(): Promise<void> {
  if (typeof caches === "undefined") return;
  await Promise.all([
    caches.delete(OFFLINE_ARTWORK_CACHE),
    caches.delete(LEGACY_ARTWORK_CACHE),
  ]);
}
