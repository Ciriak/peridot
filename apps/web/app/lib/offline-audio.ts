import type { TrackResponse } from "@peridot/contracts";
import {
  clear as clearStore,
  createStore,
  del,
  entries,
  get,
  set,
} from "idb-keyval";
import { createPlaybackToken, trackAudioUrl } from "./peridot-client.ts";
import { trackCoverUrl } from "./library.ts";
import type { PeridotQueryScope } from "./query-keys";

export const OFFLINE_AUDIO_CACHE = "peridot-offline-audio-v1";
export const OFFLINE_ARTWORK_CACHE = "peridot-artwork-v1";
export const OFFLINE_DATABASE = "peridot-web-offline";
const OFFLINE_TRACK_STORE = "offline-tracks";

export interface SavedOfflineTrack {
  scope: PeridotQueryScope;
  track: TrackResponse;
  savedAt: string;
  size: number;
}

function offlineTrackStore() {
  return createStore(OFFLINE_DATABASE, OFFLINE_TRACK_STORE);
}

function scopePrefix(scope: PeridotQueryScope): string {
  return `${encodeURIComponent(scope.serverAddress)}:${encodeURIComponent(scope.userId)}:`;
}

export function offlineTrackStorageKey(
  scope: PeridotQueryScope,
  trackId: string,
): string {
  return `${scopePrefix(scope)}${encodeURIComponent(trackId)}`;
}

export function offlineAudioCacheRequest(
  scope: PeridotQueryScope,
  trackId: string,
  origin = globalThis.location?.origin ?? "http://peridot.local",
): Request {
  return new Request(
    new URL(
      `/__peridot/offline-audio/${scopePrefix(scope)}${encodeURIComponent(trackId)}`,
      origin,
    ),
  );
}

export async function readSavedOfflineTracks(
  scope: PeridotQueryScope,
): Promise<SavedOfflineTrack[]> {
  if (typeof indexedDB === "undefined") return [];
  const prefix = scopePrefix(scope);
  const values = await entries<string, SavedOfflineTrack>(offlineTrackStore());
  return values
    .filter(([key]) => key.startsWith(prefix))
    .map(([, value]) => value)
    .sort(
      (left, right) =>
        new Date(right.savedAt).getTime() - new Date(left.savedAt).getTime(),
    );
}

export async function readSavedOfflineTrack(
  scope: PeridotQueryScope,
  trackId: string,
): Promise<SavedOfflineTrack | undefined> {
  if (typeof indexedDB === "undefined") return undefined;
  return get<SavedOfflineTrack>(
    offlineTrackStorageKey(scope, trackId),
    offlineTrackStore(),
  );
}

export async function saveTrackForOffline(
  scope: PeridotQueryScope,
  token: string,
  track: TrackResponse,
): Promise<SavedOfflineTrack> {
  if (
    typeof caches === "undefined" ||
    typeof navigator === "undefined" ||
    typeof window === "undefined"
  ) {
    throw new Error("Offline storage is unavailable.");
  }

  if (navigator.storage?.persist) {
    await navigator.storage.persist().catch(() => false);
  }
  const issued = await createPlaybackToken(
    scope.serverAddress,
    token,
    track.id,
  );
  const response = await fetch(
    trackAudioUrl(scope.serverAddress, track.id, issued.token),
  );
  if (!response.ok) {
    throw new Error("The audio file could not be saved.");
  }
  const size = Number(response.headers.get("content-length")) || 0;
  const cache = await caches.open(OFFLINE_AUDIO_CACHE);
  await cache.put(offlineAudioCacheRequest(scope, track.id), response.clone());

  const coverPath = track.coverUrl;
  if (coverPath) {
    const coverUrl = trackCoverUrl(scope.serverAddress, coverPath);
    if (coverUrl) {
      try {
        const coverResponse = await fetch(coverUrl);
        if (coverResponse.ok) {
          const artworkCache = await caches.open(OFFLINE_ARTWORK_CACHE);
          await artworkCache.put(coverUrl, coverResponse);
        }
      } catch {
        // Audio remains useful when artwork cannot be cached.
      }
    }
  }

  const saved: SavedOfflineTrack = {
    scope,
    track,
    savedAt: new Date().toISOString(),
    size,
  };
  await set(
    offlineTrackStorageKey(scope, track.id),
    saved,
    offlineTrackStore(),
  );
  return saved;
}

export async function removeTrackForOffline(
  scope: PeridotQueryScope,
  trackId: string,
): Promise<void> {
  if (typeof caches !== "undefined") {
    const cache = await caches.open(OFFLINE_AUDIO_CACHE);
    await cache.delete(offlineAudioCacheRequest(scope, trackId));
  }
  await del(offlineTrackStorageKey(scope, trackId), offlineTrackStore());
}

export async function offlineAudioBlob(
  scope: PeridotQueryScope,
  trackId: string,
): Promise<Blob | null> {
  if (typeof caches === "undefined") return null;
  const cache = await caches.open(OFFLINE_AUDIO_CACHE);
  const response = await cache.match(offlineAudioCacheRequest(scope, trackId));
  return response ? response.blob() : null;
}

export async function clearAllOfflineTracks(): Promise<void> {
  if (typeof indexedDB !== "undefined") {
    await clearStore(offlineTrackStore());
  }
  if (typeof caches !== "undefined") {
    await caches.delete(OFFLINE_AUDIO_CACHE);
    await caches.delete(OFFLINE_ARTWORK_CACHE);
  }
}
