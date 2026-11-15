import type { PlaylistDetailResponse } from "@peridot/contracts";
import { computed, toValue, type MaybeRefOrGetter } from "vue";
import { notifyOfflinePlaylistFailed } from "../lib/toasts";
import { useOfflineTracks } from "./use-offline-tracks";

export function useOfflinePlaylist(
  playlistSource: MaybeRefOrGetter<PlaylistDetailResponse | null>,
) {
  const playlist = computed(() => toValue(playlistSource));
  const {
    savedTracks,
    error,
    canSave,
    isAlbumPending,
    albumProgressFor,
    savePlaylist,
    removePlaylist,
  } = useOfflineTracks();
  const playlistId = computed(() => playlist.value?.id ?? "");
  const catalogTracks = computed(
    () =>
      playlist.value?.entries.flatMap((entry) =>
        entry.track ? [entry.track] : [],
      ) ?? [],
  );
  const availableTracks = computed(() =>
    catalogTracks.value.filter((track) => track.available),
  );
  const savedTrackIds = computed(
    () => new Set(savedTracks.value.map((saved) => saved.track.id)),
  );
  const savedTrackCount = computed(
    () =>
      availableTracks.value.filter((track) => savedTrackIds.value.has(track.id))
        .length,
  );
  const allSaved = computed(
    () =>
      availableTracks.value.length > 0 &&
      savedTrackCount.value >= availableTracks.value.length,
  );
  const pending = computed(() => isAlbumPending(playlistId.value));
  const progress = computed(() => albumProgressFor(playlistId.value));
  const canToggle = computed(
    () =>
      availableTracks.value.length > 0 &&
      !pending.value &&
      (canSave.value || allSaved.value),
  );

  async function toggle() {
    const current = playlist.value;
    if (!current || !canToggle.value) return false;
    if (allSaved.value) {
      const removed = await removePlaylist(
        current.id,
        catalogTracks.value.map((track) => track.id),
      );
      if (!removed && error.value) {
        notifyOfflinePlaylistFailed(current.name, error.value);
      }
      return removed;
    }
    const saved = await savePlaylist(current.id, availableTracks.value);
    if (!saved && error.value) {
      notifyOfflinePlaylistFailed(current.name, error.value);
    }
    return saved;
  }

  return {
    availableTracks,
    savedTrackCount,
    allSaved,
    pending,
    progress,
    canToggle,
    toggle,
  };
}
