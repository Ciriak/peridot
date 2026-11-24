import type {
  AlbumSummaryResponse,
  MediaType,
  MediaResponse,
} from "@peridot/contracts";
import { useState } from "#imports";
import { computed, ref, watch } from "vue";
import {
  readSavedOfflineTrack,
  refreshSavedOfflineTracks,
  removeTrackForOffline,
  saveTrackForOffline,
  type SavedOfflineTrack,
} from "../lib/offline-audio";
import { useLocalizedMessage } from "./use-localized-message";
import { useOfflineDownloadTasks } from "./use-offline-download-tasks";
import { useServerConnection } from "./use-server-connection";
import { useQueryScope } from "./use-query-scope";
import { useSession } from "./use-session";

export function useOfflineTracks() {
  const { scope } = useQueryScope();
  const { token } = useSession();
  const { status } = useServerConnection();
  const { errorMessage } = useLocalizedMessage();
  const playerSavedTrackIds = useState<string[]>(
    "player-offline-saved-track-ids",
    () => [],
  );
  const savedTracks = useState<SavedOfflineTrack[]>(
    "player-offline-saved-tracks",
    () => [],
  );
  const pendingTrackIds = useState<string[]>(
    "player-offline-pending-track-ids",
    () => [],
  );
  const pendingAlbumIds = useState<string[]>(
    "player-offline-pending-album-ids",
    () => [],
  );
  const loaded = ref(false);
  const error = ref<string | null>(null);
  const downloadTasks = useOfflineDownloadTasks();

  async function refresh() {
    if (!scope.value) {
      savedTracks.value = [];
      playerSavedTrackIds.value = [];
      loaded.value = true;
      return;
    }
    try {
      savedTracks.value = await refreshSavedOfflineTracks(
        scope.value,
        token.value,
      );
      playerSavedTrackIds.value = savedTracks.value.map(
        (saved) => saved.track.id,
      );
    } finally {
      loaded.value = true;
    }
  }

  function isSaved(mediaId: string): boolean {
    return savedTracks.value.some((saved) => saved.track.id === mediaId);
  }

  function isPending(mediaId: string): boolean {
    return (
      pendingTrackIds.value.includes(mediaId) ||
      downloadTasks.tasks.value.some(
        (task) =>
          downloadTasks.isActive(task) &&
          task.request.kind === "media" &&
          task.request.track.id === mediaId,
      )
    );
  }

  function progressFor(mediaId: string): number | null | undefined {
    const task = downloadTasks.tasks.value.find(
      (candidate) =>
        downloadTasks.isActive(candidate) &&
        candidate.request.kind === "media" &&
        candidate.request.track.id === mediaId,
    );
    return task ? downloadTasks.progressForTask(task) : undefined;
  }

  function isAlbumPending(albumId: string): boolean {
    return (
      pendingAlbumIds.value.includes(albumId) ||
      downloadTasks.tasks.value.some(
        (task) =>
          downloadTasks.isActive(task) &&
          ((task.request.kind === "album" &&
            task.request.album.id === albumId) ||
            (task.request.kind === "playlist" &&
              task.request.playlistId === albumId) ||
            (task.request.kind === "collection" &&
              task.request.collectionId === albumId)),
      )
    );
  }

  function albumProgressFor(albumId: string): number | null | undefined {
    const task = downloadTasks.tasks.value.find(
      (candidate) =>
        downloadTasks.isActive(candidate) &&
        ((candidate.request.kind === "album" &&
          candidate.request.album.id === albumId) ||
          (candidate.request.kind === "playlist" &&
            candidate.request.playlistId === albumId) ||
          (candidate.request.kind === "collection" &&
            candidate.request.collectionId === albumId)),
    );
    return task ? downloadTasks.progressForTask(task) : undefined;
  }

  async function saveTrack(
    track: MediaResponse,
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

  async function save(track: MediaResponse): Promise<boolean> {
    if (!scope.value || !token.value) return false;
    if (isPending(track.id)) return false;
    error.value = null;
    return Boolean(await downloadTasks.enqueueTrack(track));
  }

  async function saveAlbum(album: AlbumSummaryResponse): Promise<boolean> {
    if (!scope.value || !token.value || isAlbumPending(album.id)) return false;
    error.value = null;
    return Boolean(await downloadTasks.enqueueAlbum(album));
  }

  async function saveCollection(
    collectionId: string,
    mediaType: Exclude<MediaType, "music">,
    title: string,
  ): Promise<boolean> {
    if (!scope.value || !token.value || isAlbumPending(collectionId)) {
      return false;
    }
    error.value = null;
    return Boolean(
      await downloadTasks.enqueueCollection(collectionId, mediaType, title),
    );
  }

  async function remove(mediaId: string): Promise<boolean> {
    if (!scope.value || isPending(mediaId)) return false;
    pendingTrackIds.value = [...pendingTrackIds.value, mediaId];
    error.value = null;
    try {
      await removeTrackForOffline(scope.value, mediaId);
      savedTracks.value = savedTracks.value.filter(
        (candidate) => candidate.track.id !== mediaId,
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
        (pendingId) => pendingId !== mediaId,
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
            (mediaId) => mediaId !== saved.track.id,
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

  async function savePlaylist(
    playlistId: string,
    title: string,
  ): Promise<boolean> {
    if (!scope.value || !token.value || isAlbumPending(playlistId))
      return false;
    error.value = null;
    return Boolean(await downloadTasks.enqueuePlaylist(playlistId, title));
  }

  async function saveLikedTitles() {
    if (!scope.value || !token.value) return null;
    return downloadTasks.enqueueLikedTitles();
  }

  async function removePlaylist(
    playlistId: string,
    mediaIds: readonly string[],
  ): Promise<boolean> {
    if (!scope.value || isAlbumPending(playlistId)) return false;
    const mediaIdSet = new Set(mediaIds);
    const playlistTracks = savedTracks.value.filter((saved) =>
      mediaIdSet.has(saved.track.id),
    );
    if (playlistTracks.some((saved) => isPending(saved.track.id))) return false;

    pendingAlbumIds.value = [...pendingAlbumIds.value, playlistId];
    error.value = null;
    try {
      for (const saved of playlistTracks) {
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
            (mediaId) => mediaId !== saved.track.id,
          );
        }
      }
      return true;
    } catch (reason) {
      error.value = errorMessage(reason, "error.offlineRemove");
      return false;
    } finally {
      pendingAlbumIds.value = pendingAlbumIds.value.filter(
        (pendingId) => pendingId !== playlistId,
      );
    }
  }

  async function resolve(mediaId: string): Promise<SavedOfflineTrack | null> {
    if (!scope.value) return null;
    const saved =
      savedTracks.value.find((item) => item.track.id === mediaId) ??
      (await readSavedOfflineTrack(scope.value, mediaId));
    return saved ?? null;
  }

  async function tracksMatching(
    predicate: (track: MediaResponse) => boolean,
  ): Promise<MediaResponse[]> {
    if (!loaded.value) await refresh();
    return savedTracks.value.map((saved) => saved.track).filter(predicate);
  }

  const canSave = computed(
    () => status.value !== "lost" && Boolean(scope.value && token.value),
  );

  async function startDownloadWorker() {
    if (!loaded.value) await refresh();
    downloadTasks.start({
      isSaved,
      save: async (track, onProgress) => {
        await saveTrack(track, onProgress);
      },
    });
  }

  function refreshDownloadTasks() {
    return downloadTasks.refresh();
  }

  async function clearDownloadQueue() {
    await downloadTasks.clear(scope.value);
  }

  watch([scope, token, status], () => void refresh(), { immediate: true });

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
    saveCollection,
    savePlaylist,
    saveLikedTitles,
    remove,
    removeAlbum,
    removePlaylist,
    resolve,
    tracksMatching,
    downloadTasks,
    startDownloadWorker,
    refreshDownloadTasks,
    clearDownloadQueue,
  };
}
