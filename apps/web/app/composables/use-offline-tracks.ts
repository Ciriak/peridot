import type { TrackResponse } from "@peridot/contracts";
import { useI18n } from "#imports";
import { computed, ref, watch } from "vue";
import {
  readSavedOfflineTrack,
  readSavedOfflineTracks,
  removeTrackForOffline,
  saveTrackForOffline,
  type SavedOfflineTrack,
} from "../lib/offline-audio";
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
  const savedTracks = ref<SavedOfflineTrack[]>([]);
  const pendingTrackIds = ref<string[]>([]);
  const loaded = ref(false);
  const error = ref<string | null>(null);

  async function refresh() {
    if (!scope.value) {
      savedTracks.value = [];
      loaded.value = true;
      return;
    }
    try {
      savedTracks.value = await readSavedOfflineTracks(scope.value);
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

  async function save(track: TrackResponse): Promise<boolean> {
    if (!scope.value || !token.value) return false;
    if (isPending(track.id)) return false;
    pendingTrackIds.value = [...pendingTrackIds.value, track.id];
    error.value = null;
    try {
      const saved = await saveTrackForOffline(scope.value, token.value, track);
      savedTracks.value = [
        saved,
        ...savedTracks.value.filter(
          (candidate) => candidate.track.id !== track.id,
        ),
      ];
      return true;
    } catch (reason) {
      if (isAuthenticationRedirectError(reason)) return false;
      error.value =
        reason instanceof DOMException && reason.name === "QuotaExceededError"
          ? t("error.offlineQuotaExceeded")
          : errorMessage(reason, "error.offlineSave");
      return false;
    } finally {
      pendingTrackIds.value = pendingTrackIds.value.filter(
        (trackId) => trackId !== track.id,
      );
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
    save,
    remove,
    resolve,
    tracksMatching,
  };
}
