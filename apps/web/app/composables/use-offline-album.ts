import type { AlbumSummaryResponse } from "@peridot/contracts";
import { computed, toValue, type MaybeRefOrGetter } from "vue";
import { loadCollectionTracks } from "../lib/catalog-collections";
import { isAuthenticationRedirectError } from "../lib/peridot-client";
import { notifyOfflineAlbumFailed } from "../lib/toasts";
import { useLocalizedMessage } from "./use-localized-message";
import { useOfflineTracks } from "./use-offline-tracks";
import { useServer } from "./use-server";
import { useSession } from "./use-session";

export function useOfflineAlbum(
  albumSource: MaybeRefOrGetter<AlbumSummaryResponse | null>,
) {
  const album = computed(() => toValue(albumSource));
  const { address } = useServer();
  const { token } = useSession();
  const { errorMessage } = useLocalizedMessage();
  const {
    savedTracks,
    error,
    canSave,
    isAlbumPending,
    albumProgressFor,
    saveAlbum,
    removeAlbum,
  } = useOfflineTracks();

  const albumId = computed(() => album.value?.id ?? "");
  const savedTrackCount = computed(() =>
    albumId.value
      ? savedTracks.value.filter(
          (saved) => saved.track.albumId === albumId.value,
        ).length
      : 0,
  );
  const allSaved = computed(
    () =>
      Boolean(album.value?.trackCount) &&
      savedTrackCount.value >= (album.value?.trackCount ?? 0),
  );
  const pending = computed(() => isAlbumPending(albumId.value));
  const progress = computed(() => albumProgressFor(albumId.value));
  const canToggle = computed(
    () =>
      Boolean(album.value?.trackCount) &&
      !pending.value &&
      (canSave.value || allSaved.value),
  );

  async function toggle() {
    const currentAlbum = album.value;
    if (!currentAlbum || !canToggle.value) return false;

    if (allSaved.value) {
      const removed = await removeAlbum(currentAlbum.id);
      if (!removed && error.value) {
        notifyOfflineAlbumFailed(currentAlbum.title, error.value);
      }
      return removed;
    }

    if (!address.value || !token.value || !canSave.value) return false;
    error.value = null;
    try {
      const tracks = await loadCollectionTracks(address.value, token.value, {
        albumId: currentAlbum.id,
      });
      const saved = await saveAlbum(currentAlbum.id, tracks);
      if (!saved && error.value) {
        notifyOfflineAlbumFailed(currentAlbum.title, error.value);
      }
      return saved;
    } catch (reason) {
      if (isAuthenticationRedirectError(reason)) return false;
      error.value = errorMessage(reason, "error.offlineAlbumLoad");
      notifyOfflineAlbumFailed(currentAlbum.title, error.value);
      return false;
    }
  }

  return {
    album,
    savedTrackCount,
    allSaved,
    pending,
    progress,
    canToggle,
    toggle,
  };
}
