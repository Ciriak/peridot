import type { MediaType } from "@peridot/contracts";
import { computed, toValue, type MaybeRefOrGetter } from "vue";
import { loadCollectionTracks } from "../lib/catalog-collections";
import { isAuthenticationRedirectError } from "../lib/peridot-client";
import {
  notifyOfflineCollectionFailed,
  notifyOfflineCollectionSaved,
} from "../lib/toasts";
import { useLocalizedMessage } from "./use-localized-message";
import { useOfflineTracks } from "./use-offline-tracks";
import { useServer } from "./use-server";
import { useSession } from "./use-session";

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
    if (!address.value || !token.value || !canSave.value) return false;
    error.value = null;
    try {
      const tracks = await loadCollectionTracks(address.value, token.value, {
        collectionId: current.id,
        mediaType,
      });
      const saved = await saveAlbum(current.id, tracks);
      if (saved) {
        notifyOfflineCollectionSaved(current.title);
      } else if (error.value) {
        notifyOfflineCollectionFailed(current.title, error.value);
      }
      return saved;
    } catch (reason) {
      if (isAuthenticationRedirectError(reason)) return false;
      error.value = errorMessage(reason, "error.offlineAlbumLoad");
      notifyOfflineCollectionFailed(current.title, error.value);
      return false;
    }
  }

  return { allSaved, pending, progress, canToggle, toggle };
}
