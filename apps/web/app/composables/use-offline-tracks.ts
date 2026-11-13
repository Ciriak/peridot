import type { TrackResponse } from "@peridot/contracts";
import { useI18n, useState } from "#imports";
import { computed, ref, watch } from "vue";
import {
  readSavedOfflineTrack,
  readSavedOfflineTracks,
  removeTrackForOffline,
  saveTrackForOffline,
  type SavedOfflineTrack,
} from "../lib/offline-audio";
import { saveOfflineCollection } from "../lib/offline-collection";
import { isAuthenticationRedirectError } from "../lib/peridot-client";
import { useLocalizedMessage } from "./use-localized-message";
import { useServerConnection } from "./use-server-connection";
import { useQueryScope } from "./use-query-scope";
import { useSession } from "./use-session";

export function useOfflineTracks() {
  const { scope } = useQueryScope();
  const { token } = useSession();
  const { status } = useServerConnection();
  const { t } = useI18n();
  const { errorMessage } = useLocalizedMessage();
  const playerSavedTrackIds = useState<string[]>(
    "player-offline-saved-track-ids",
    () => [],
  );
  const savedTracks = useState<SavedOfflineTrack[]>(
    "player-offline-saved-tracks",
    () => [],
  );
  const saveProgress = useState<Record<string, number | null>>(
    "player-offline-save-progress",
    () => ({}),
  );
  const albumSaveProgress = useState<Record<string, number | null>>(
    "player-offline-album-save-progress",
    () => ({}),
  );
  const pendingTrackIds = ref<string[]>([]);
  const pendingAlbumIds = useState<string[]>(
    "player-offline-pending-album-ids",
    () => [],
  );
  const loaded = ref(false);
  const error = ref<string | null>(null);

  function setProgress(
    values: Record<string, number | null>,
    key: string,
    progress: number | null | undefined,
  ) {
    if (
      Object.prototype.hasOwnProperty.call(values, key) &&
      values[key] === progress
    ) {
      return values;
    }
    const next = { ...values };
    if (progress === undefined) {
      delete next[key];
    } else {
      next[key] = progress;
    }
    return next;
  }

  function setTrackProgress(
    trackId: string,
    progress: number | null | undefined,
  ) {
    saveProgress.value = setProgress(saveProgress.value, trackId, progress);
  }

  function setAlbumProgress(
    albumId: string,
    progress: number | null | undefined,
  ) {
    albumSaveProgress.value = setProgress(
      albumSaveProgress.value,
      albumId,
      progress,
    );
  }

  async function refresh() {
    if (!scope.value) {
      savedTracks.value = [];
      playerSavedTrackIds.value = [];
      loaded.value = true;
      return;
    }
    try {
      savedTracks.value = await readSavedOfflineTracks(scope.value);
      playerSavedTrackIds.value = savedTracks.value.map(
        (saved) => saved.track.id,
      );
    } finally {
      loaded.value = true;
    }
  }

  function isSaved(trackId: string): boolean {
    return savedTracks.value.some((saved) => saved.track.id === trackId);
  }

  function isPending(trackId: string): boolean {
    return pendingTrackIds.value.includes(trackId);
  }

  function progressFor(trackId: string): number | null | undefined {
    return Object.prototype.hasOwnProperty.call(saveProgress.value, trackId)
      ? saveProgress.value[trackId]
      : undefined;
  }

  function isAlbumPending(albumId: string): boolean {
    return pendingAlbumIds.value.includes(albumId);
  }

  function albumProgressFor(albumId: string): number | null | undefined {
    return Object.prototype.hasOwnProperty.call(
      albumSaveProgress.value,
      albumId,
    )
      ? albumSaveProgress.value[albumId]
      : undefined;
  }

  function saveFailureMessage(reason: unknown): string | null {
    if (isAuthenticationRedirectError(reason)) return null;
    return reason instanceof DOMException &&
      reason.name === "QuotaExceededError"
      ? t("error.offlineQuotaExceeded")
      : errorMessage(reason, "error.offlineSave");
  }

  async function saveTrack(
    track: TrackResponse,
    onProgress?: (progress: number | null) => void,
  ) {
    if (!scope.value || !token.value) {
      throw new Error("Offline storage is unavailable.");
    }
    const saved = await saveTrackForOffline(scope.value, token.value, track, {
      onProgress,
    });
    savedTracks.value = [
      saved,
      ...savedTracks.value.filter(
        (candidate) => candidate.track.id !== track.id,
      ),
    ];
    playerSavedTrackIds.value = savedTracks.value.map(
      (candidate) => candidate.track.id,
    );
    return saved;
  }

  async function save(track: TrackResponse): Promise<boolean> {
    if (!scope.value || !token.value) return false;
    if (isPending(track.id)) return false;
    pendingTrackIds.value = [...pendingTrackIds.value, track.id];
    setTrackProgress(track.id, null);
    error.value = null;
    try {
      await saveTrack(track, (progress) =>
        setTrackProgress(track.id, progress),
      );
      return true;
    } catch (reason) {
      error.value = saveFailureMessage(reason);
      return false;
    } finally {
      pendingTrackIds.value = pendingTrackIds.value.filter(
        (trackId) => trackId !== track.id,
      );
      setTrackProgress(track.id, undefined);
    }
  }

  async function saveAlbum(
    albumId: string,
    tracks: TrackResponse[],
  ): Promise<boolean> {
    if (!scope.value || !token.value || isAlbumPending(albumId)) return false;
    if (tracks.some((track) => track.available && isPending(track.id))) {
      return false;
    }

    const startedTrackIds: string[] = [];
    pendingAlbumIds.value = [...pendingAlbumIds.value, albumId];
    error.value = null;
    setAlbumProgress(albumId, null);
    try {
      const result = await saveOfflineCollection(tracks, {
        isSaved,
        onProgress: (progress) => setAlbumProgress(albumId, progress),
        save: async (track, onCollectionProgress) => {
          pendingTrackIds.value = [...pendingTrackIds.value, track.id];
          startedTrackIds.push(track.id);
          setTrackProgress(track.id, null);
          await saveTrack(track, (progress) => {
            setTrackProgress(track.id, progress);
            onCollectionProgress?.(progress);
          });
        },
      });
      if (!result.total) {
        error.value = t("error.offlineAlbumEmpty");
        return false;
      }
      if (result.failure) {
        error.value = saveFailureMessage(result.failure.reason);
        return false;
      }
      return true;
    } finally {
      const started = new Set(startedTrackIds);
      pendingTrackIds.value = pendingTrackIds.value.filter(
        (trackId) => !started.has(trackId),
      );
      for (const trackId of started) setTrackProgress(trackId, undefined);
      pendingAlbumIds.value = pendingAlbumIds.value.filter(
        (pendingId) => pendingId !== albumId,
      );
      setAlbumProgress(albumId, undefined);
    }
  }

  async function remove(trackId: string): Promise<boolean> {
    if (!scope.value || isPending(trackId)) return false;
    pendingTrackIds.value = [...pendingTrackIds.value, trackId];
    error.value = null;
    try {
      await removeTrackForOffline(scope.value, trackId);
      savedTracks.value = savedTracks.value.filter(
        (candidate) => candidate.track.id !== trackId,
      );
      playerSavedTrackIds.value = savedTracks.value.map(
        (candidate) => candidate.track.id,
      );
      return true;
    } catch (reason) {
      error.value = errorMessage(reason, "error.offlineRemove");
      return false;
    } finally {
      pendingTrackIds.value = pendingTrackIds.value.filter(
        (pendingId) => pendingId !== trackId,
      );
    }
  }

  async function removeAlbum(albumId: string): Promise<boolean> {
    if (!scope.value || isAlbumPending(albumId)) return false;
    const albumTracks = savedTracks.value.filter(
      (saved) => saved.track.albumId === albumId,
    );
    if (albumTracks.some((saved) => isPending(saved.track.id))) return false;

    pendingAlbumIds.value = [...pendingAlbumIds.value, albumId];
    error.value = null;
    try {
      for (const saved of albumTracks) {
        pendingTrackIds.value = [...pendingTrackIds.value, saved.track.id];
        try {
          await removeTrackForOffline(scope.value, saved.track.id);
          savedTracks.value = savedTracks.value.filter(
            (candidate) => candidate.track.id !== saved.track.id,
          );
          playerSavedTrackIds.value = savedTracks.value.map(
            (candidate) => candidate.track.id,
          );
        } finally {
          pendingTrackIds.value = pendingTrackIds.value.filter(
            (trackId) => trackId !== saved.track.id,
          );
        }
      }
      return true;
    } catch (reason) {
      error.value = errorMessage(reason, "error.offlineRemove");
      return false;
    } finally {
      pendingAlbumIds.value = pendingAlbumIds.value.filter(
        (pendingId) => pendingId !== albumId,
      );
    }
  }

  async function resolve(trackId: string): Promise<SavedOfflineTrack | null> {
    if (!scope.value) return null;
    const saved =
      savedTracks.value.find((item) => item.track.id === trackId) ??
      (await readSavedOfflineTrack(scope.value, trackId));
    return saved ?? null;
  }

  async function tracksMatching(
    predicate: (track: TrackResponse) => boolean,
  ): Promise<TrackResponse[]> {
    if (!loaded.value) await refresh();
    return savedTracks.value.map((saved) => saved.track).filter(predicate);
  }

  const canSave = computed(
    () => status.value !== "lost" && Boolean(scope.value && token.value),
  );

  watch(
    () => scope.value,
    () => void refresh(),
    { immediate: true },
  );

  return {
    savedTracks,
    loaded,
    error,
    canSave,
    refresh,
    isSaved,
    isPending,
    isAlbumPending,
    progressFor,
    albumProgressFor,
    save,
    saveAlbum,
    remove,
    removeAlbum,
    resolve,
    tracksMatching,
  };
}
