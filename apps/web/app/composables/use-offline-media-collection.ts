import type { MediaType } from "@peridot/contracts";
import { computed, toValue, type MaybeRefOrGetter } from "vue";
import { notifyOfflineCollectionFailed } from "../lib/toasts";
import { useOfflineTracks } from "./use-offline-tracks";

export interface OfflineMediaCollection {
  id: string;
  title: string;
  trackCount: number;
}

export function useOfflineMediaCollection(
  collectionSource: MaybeRefOrGetter<OfflineMediaCollection | null>,
  mediaType: Exclude<MediaType, "music">,
) {
  const collection = computed(() => toValue(collectionSource));
  const {
    savedTracks,
    error,
    canSave,
    isAlbumPending,
    albumProgressFor,
    saveCollection,
    removeAlbum,
  } = useOfflineTracks();

  const collectionId = computed(() => collection.value?.id ?? "");
  const savedTrackCount = computed(
    () =>
      savedTracks.value.filter(
        (saved) => saved.track.albumId === collectionId.value,
      ).length,
  );
  const allSaved = computed(
    () =>
      Boolean(collection.value?.trackCount) &&
      savedTrackCount.value >= (collection.value?.trackCount ?? 0),
  );
  const pending = computed(() => isAlbumPending(collectionId.value));
  const progress = computed(() => albumProgressFor(collectionId.value));
  const canToggle = computed(
    () =>
      Boolean(collection.value?.trackCount) &&
      !pending.value &&
      (canSave.value || allSaved.value),
  );

  async function toggle() {
    const current = collection.value;
    if (!current || !canToggle.value) return false;
    if (allSaved.value) {
      const removed = await removeAlbum(current.id);
      if (!removed && error.value) {
        notifyOfflineCollectionFailed(current.title, error.value);
      }
      return removed;
    }
    if (!canSave.value) return false;
    error.value = null;
    const saved = await saveCollection(current.id, mediaType, current.title);
    if (!saved && error.value) {
      notifyOfflineCollectionFailed(current.title, error.value);
    }
    return saved;
  }

  return { allSaved, pending, progress, canToggle, toggle };
}
