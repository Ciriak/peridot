import type { MediaResponse } from "@peridot/contracts";
import {
  clear as clearStore,
  createStore,
  del,
  entries,
  get,
  set,
} from "idb-keyval";
import {
  createPlaybackToken,
  PeridotNetworkError,
  resolveTracks,
  trackAudioUrl,
} from "./peridot-client.ts";
import { trackCoverUrl } from "./library.ts";
import { clearOfflineArtwork, loadArtworkBlob } from "./offline-artwork.ts";
import type { PeridotQueryScope } from "./query-keys";
import { isAndroidRuntime } from "./android-runtime.ts";
import {
  androidTrackSnapshot,
  PeridotMedia,
  trackResponseFromAndroid,
} from "./android-playback.ts";
import { reportServerReachability } from "./server-connectivity.ts";

export const OFFLINE_AUDIO_CACHE = "peridot-offline-audio-v2";
export const LEGACY_OFFLINE_AUDIO_CACHE = "peridot-offline-audio-v1";
export const OFFLINE_TRACK_DATABASE = "peridot-web-offline-tracks-v2";
export const LEGACY_OFFLINE_TRACK_DATABASE = "peridot-web-offline-tracks-v1";
const OFFLINE_TRACK_STORE = "offline-tracks";
const offlineTrackRefreshes = new Map<string, Promise<SavedOfflineTrack[]>>();

export interface SavedOfflineTrack {
  scope: PeridotQueryScope;
  track: MediaResponse;
  savedAt: string;
  size: number;
}

export interface PreparedOfflineResponse {
  response: Response;
  size: number;
}

export interface OfflineTrackAliasMove {
  source: SavedOfflineTrack;
  target: SavedOfflineTrack;
}

export function snapshotTrackForOffline(track: MediaResponse): MediaResponse {
  // TanStack Query exposes deeply reactive Vue proxies. IndexedDB cannot
  // structured-clone those proxies, so persist only their plain data snapshot.
  return JSON.parse(JSON.stringify(track)) as MediaResponse;
}

export async function prepareOfflineResponse(
  response: Response,
  onProgress?: (progress: number | null) => void,
): Promise<PreparedOfflineResponse> {
  const totalBytes = Math.max(
    0,
    Number(response.headers.get("content-length")) || 0,
  );
  const reportProgress = (receivedBytes: number) => {
    onProgress?.(
      totalBytes > 0
        ? Math.min(100, Math.round((receivedBytes / totalBytes) * 100))
        : null,
    );
  };
  reportProgress(0);

  if (!response.body) {
    const blob = await response.blob();
    onProgress?.(100);
    return {
      response: new Response(blob, {
        status: response.status,
        statusText: response.statusText,
        headers: response.headers,
      }),
      size: blob.size,
    };
  }

  const reader = response.body.getReader();
  const chunks: ArrayBuffer[] = [];
  let receivedBytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const chunk = new Uint8Array(value.byteLength);
      chunk.set(value);
      chunks.push(chunk.buffer);
      receivedBytes += value.byteLength;
      reportProgress(receivedBytes);
    }
  } finally {
    reader.releaseLock();
  }

  onProgress?.(100);
  const blob = new Blob(chunks, {
    type: response.headers.get("content-type") ?? "",
  });
  return {
    response: new Response(blob, {
      status: response.status,
      statusText: response.statusText,
      headers: response.headers,
    }),
    size: blob.size,
  };
}

function offlineTrackStore() {
  return createStore(OFFLINE_TRACK_DATABASE, OFFLINE_TRACK_STORE);
}

function normalizeSavedOfflineTrack(
  saved: SavedOfflineTrack,
): SavedOfflineTrack {
  return {
    ...saved,
    track: {
      ...saved.track,
      mediaType: saved.track.mediaType ?? "music",
      publishedAt: saved.track.publishedAt ?? null,
    },
  };
}

function scopePrefix(scope: PeridotQueryScope): string {
  return `${encodeURIComponent(scope.serverAddress)}:${encodeURIComponent(scope.userId)}:`;
}

export function offlineTrackStorageKey(
  scope: PeridotQueryScope,
  mediaId: string,
): string {
  return `${scopePrefix(scope)}${encodeURIComponent(mediaId)}`;
}

export function offlineAudioCacheRequest(
  scope: PeridotQueryScope,
  mediaId: string,
  origin = globalThis.location?.origin ?? "http://peridot.local",
): Request {
  return new Request(
    new URL(
      `/__peridot/offline-audio/${scopePrefix(scope)}${encodeURIComponent(mediaId)}`,
      origin,
    ),
  );
}

export function offlineTrackAliasMoves(
  savedTracks: readonly SavedOfflineTrack[],
  resolution: {
    items: readonly MediaResponse[];
    aliases: Readonly<Record<string, string>>;
  },
): OfflineTrackAliasMove[] {
  const tracksById = new Map(
    resolution.items.map((track) => [track.id, track]),
  );
  return savedTracks.flatMap((source) => {
    const canonicalId = resolution.aliases[source.track.id];
    const canonical = canonicalId ? tracksById.get(canonicalId) : undefined;
    if (!canonicalId || !canonical) return [];
    return [
      {
        source,
        target: {
          ...source,
          track: canonical,
        },
      },
    ];
  });
}

export async function readSavedOfflineTracks(
  scope: PeridotQueryScope,
): Promise<SavedOfflineTrack[]> {
  if (isAndroidRuntime()) {
    const { items } = await PeridotMedia.listCachedTracks();
    return items.map((item) => ({
      scope,
      track: trackResponseFromAndroid(item.track),
      savedAt: item.savedAt,
      size: item.size,
    }));
  }
  if (typeof indexedDB === "undefined") return [];
  const prefix = scopePrefix(scope);
  const values = await entries<string, SavedOfflineTrack>(offlineTrackStore());
  return values
    .filter(([key]) => key.startsWith(prefix))
    .map(([, value]) => normalizeSavedOfflineTrack(value))
    .sort(
      (left, right) =>
        new Date(right.savedAt).getTime() - new Date(left.savedAt).getTime(),
    );
}

export async function readSavedOfflineTrack(
  scope: PeridotQueryScope,
  mediaId: string,
): Promise<SavedOfflineTrack | undefined> {
  if (isAndroidRuntime()) {
    return (await readSavedOfflineTracks(scope)).find(
      (saved) => saved.track.id === mediaId,
    );
  }
  if (typeof indexedDB === "undefined") return undefined;
  const saved = await get<SavedOfflineTrack>(
    offlineTrackStorageKey(scope, mediaId),
    offlineTrackStore(),
  );
  return saved ? normalizeSavedOfflineTrack(saved) : undefined;
}

async function moveOfflineAudioCache(
  scope: PeridotQueryScope,
  sourceTrackId: string,
  targetTrackId: string,
): Promise<boolean> {
  if (sourceTrackId === targetTrackId) return true;
  if (typeof caches === "undefined") return false;
  const cache = await caches.open(OFFLINE_AUDIO_CACHE);
  const targetRequest = offlineAudioCacheRequest(scope, targetTrackId);
  if (await cache.match(targetRequest)) return true;
  const sourceRequest = offlineAudioCacheRequest(scope, sourceTrackId);
  const response = await cache.match(sourceRequest);
  if (!response) return false;
  await cache.put(targetRequest, response);
  return true;
}

async function reconcileSavedOfflineTracks(
  scope: PeridotQueryScope,
  token: string | null,
): Promise<SavedOfflineTrack[]> {
  const savedTracks = await readSavedOfflineTracks(scope);
  if (!token || !savedTracks.length) return savedTracks;

  let moves: OfflineTrackAliasMove[];
  try {
    const items: MediaResponse[] = [];
    const aliases: Record<string, string> = {};
    const mediaIds = savedTracks.map((saved) => saved.track.id);
    for (let index = 0; index < mediaIds.length; index += 200) {
      const resolution = await resolveTracks(
        scope.serverAddress,
        token,
        mediaIds.slice(index, index + 200),
      );
      items.push(...resolution.items);
      Object.assign(aliases, resolution.aliases);
    }
    moves = offlineTrackAliasMoves(savedTracks, { items, aliases });
  } catch {
    return savedTracks;
  }
  if (!moves.length) return savedTracks;

  if (isAndroidRuntime()) {
    for (const move of moves) {
      await PeridotMedia.moveCachedTrack({
        fromTrackId: move.source.track.id,
        track: androidTrackSnapshot(move.target.track, scope.serverAddress),
        savedAt: move.target.savedAt,
      }).catch(() => undefined);
    }
    return readSavedOfflineTracks(scope);
  }
  if (typeof caches === "undefined") return savedTracks;

  const cache = await caches.open(OFFLINE_AUDIO_CACHE);
  for (const move of moves) {
    const sourceId = move.source.track.id;
    const targetId = move.target.track.id;
    if (!(await moveOfflineAudioCache(scope, sourceId, targetId))) continue;

    const targetKey = offlineTrackStorageKey(scope, targetId);
    const existingTarget = await get<SavedOfflineTrack>(
      targetKey,
      offlineTrackStore(),
    );
    if (
      !existingTarget ||
      new Date(move.target.savedAt).getTime() >=
        new Date(existingTarget.savedAt).getTime()
    ) {
      await set(targetKey, move.target, offlineTrackStore());
    }
    await del(offlineTrackStorageKey(scope, sourceId), offlineTrackStore());
    await cache.delete(offlineAudioCacheRequest(scope, sourceId));
  }
  return readSavedOfflineTracks(scope);
}

export function refreshSavedOfflineTracks(
  scope: PeridotQueryScope,
  token: string | null,
): Promise<SavedOfflineTrack[]> {
  const key = `${scope.serverAddress}\u0000${scope.userId}\u0000${token ?? ""}`;
  const pending = offlineTrackRefreshes.get(key);
  if (pending) return pending;
  const refresh = reconcileSavedOfflineTracks(scope, token).finally(() => {
    if (offlineTrackRefreshes.get(key) === refresh) {
      offlineTrackRefreshes.delete(key);
    }
  });
  offlineTrackRefreshes.set(key, refresh);
  return refresh;
}

export async function saveTrackForOffline(
  scope: PeridotQueryScope,
  token: string,
  track: MediaResponse,
  options: {
    onProgress?: (progress: number | null) => void;
  } = {},
): Promise<SavedOfflineTrack> {
  if (isAndroidRuntime()) {
    if (!track.available) {
      throw new Error("This track is unavailable.");
    }
    const savedTrack = snapshotTrackForOffline(track);
    const progressListener = options.onProgress
      ? await PeridotMedia.addListener("offlineProgress", (event) => {
          if (event.mediaId === track.id) options.onProgress?.(event.progress);
        })
      : null;
    try {
      const cached = await PeridotMedia.cacheTrack({
        track: {
          id: savedTrack.id,
          title: savedTrack.title,
          artist: savedTrack.artists.join(", ") || savedTrack.artist,
          album: savedTrack.album,
          albumId: savedTrack.albumId,
          durationMs: savedTrack.durationMs,
          coverUrl: savedTrack.coverUrl
            ? trackCoverUrl(scope.serverAddress, savedTrack.coverUrl)
            : null,
          mimeType: savedTrack.mimeType,
          available: savedTrack.available,
          mediaType: savedTrack.mediaType,
        },
      });
      return {
        scope,
        track: savedTrack,
        savedAt: cached.savedAt,
        size: cached.size,
      };
    } finally {
      await progressListener?.remove();
    }
  }
  if (
    typeof caches === "undefined" ||
    typeof navigator === "undefined" ||
    typeof window === "undefined"
  ) {
    throw new Error("Offline storage is unavailable.");
  }
  const savedTrack = snapshotTrackForOffline(track);
  if (!savedTrack.available) {
    throw new Error("This track is unavailable.");
  }

  if (navigator.storage?.persist) {
    await navigator.storage.persist().catch(() => false);
  }
  const issued = await createPlaybackToken(
    scope.serverAddress,
    token,
    savedTrack.id,
  );
  let response: Response;
  try {
    response = await fetch(
      trackAudioUrl(scope.serverAddress, savedTrack.id, issued.token),
    );
  } catch {
    reportServerReachability(false);
    throw new PeridotNetworkError();
  }
  if (!response.ok) {
    throw new Error("The audio file could not be saved.");
  }
  const prepared = await prepareOfflineResponse(response, options.onProgress);
  const cache = await caches.open(OFFLINE_AUDIO_CACHE);
  const cacheRequest = offlineAudioCacheRequest(scope, savedTrack.id);
  await cache.put(cacheRequest, prepared.response);

  const coverPath = savedTrack.coverUrl;
  if (coverPath) {
    const coverUrl = trackCoverUrl(scope.serverAddress, coverPath);
    if (coverUrl) {
      try {
        await loadArtworkBlob(scope, coverUrl);
      } catch {
        // Audio remains useful when artwork cannot be cached.
      }
    }
  }

  const saved: SavedOfflineTrack = {
    scope,
    track: savedTrack,
    savedAt: new Date().toISOString(),
    size: prepared.size,
  };
  try {
    await set(
      offlineTrackStorageKey(scope, savedTrack.id),
      saved,
      offlineTrackStore(),
    );
  } catch (reason) {
    await cache.delete(cacheRequest).catch(() => false);
    throw reason;
  }
  return saved;
}

export async function removeTrackForOffline(
  scope: PeridotQueryScope,
  mediaId: string,
): Promise<void> {
  if (isAndroidRuntime()) {
    await PeridotMedia.removeCachedTrack({ mediaId });
    return;
  }
  if (typeof caches !== "undefined") {
    const cache = await caches.open(OFFLINE_AUDIO_CACHE);
    await cache.delete(offlineAudioCacheRequest(scope, mediaId));
  }
  await del(offlineTrackStorageKey(scope, mediaId), offlineTrackStore());
}

export async function offlineAudioBlob(
  scope: PeridotQueryScope,
  mediaId: string,
): Promise<Blob | null> {
  if (isAndroidRuntime()) return null;
  if (typeof caches === "undefined") return null;
  const cache = await caches.open(OFFLINE_AUDIO_CACHE);
  const response = await cache.match(offlineAudioCacheRequest(scope, mediaId));
  return response ? response.blob() : null;
}

export async function clearAllOfflineTracks(): Promise<void> {
  if (isAndroidRuntime()) {
    await PeridotMedia.clearOfflineTracks();
    return;
  }
  if (typeof indexedDB !== "undefined") {
    await clearStore(offlineTrackStore());
  }
  if (typeof caches !== "undefined") {
    await caches.delete(OFFLINE_AUDIO_CACHE);
  }
  await clearOfflineArtwork();
}

export async function clearLegacyOfflineTracks(): Promise<void> {
  if (isAndroidRuntime()) {
    await PeridotMedia.clearLegacyOfflineTracks();
    return;
  }
  if (typeof indexedDB !== "undefined") {
    await new Promise<void>((resolve) => {
      const request = indexedDB.deleteDatabase(LEGACY_OFFLINE_TRACK_DATABASE);
      request.onsuccess = () => resolve();
      request.onerror = () => resolve();
      request.onblocked = () => resolve();
    });
  }
  if (typeof caches !== "undefined") {
    await caches.delete(LEGACY_OFFLINE_AUDIO_CACHE);
  }
}
