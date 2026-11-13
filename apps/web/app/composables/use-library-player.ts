import { useI18n, useState } from "#imports";
import type { TrackResponse } from "@peridot/contracts";
import { useQueryClient } from "@tanstack/vue-query";
import { computed, onMounted, onUnmounted, watch } from "vue";
import {
  haveSameTrackReferences,
  mergePlayerQueueTracks,
  resolvePlayerQueue,
  selectPlayerTrack,
  trackDownloadFileName,
} from "../lib/library";
import {
  addTrackAfterActive,
  advanceShuffle,
  appendToShufflePool,
  compactQueueAfterShuffle,
  consumeQueue,
  moveTrackToFront,
  nextRepeatMode,
  normalizeQueueTrackIds,
  removeFromShufflePool,
  removeQueueTrack,
  reorderSourceQueue,
  restorePreviousTrack,
  restorePreviousShuffleTrack,
  rotateQueueToTrack,
  shuffledPoolExcept,
  type RepeatMode,
} from "../lib/playback-queue";
import {
  createPlaybackToken,
  fetchQueue,
  isAuthenticationRedirectError,
  isPeridotNetworkError,
  recordTrackPlay,
  replaceQueue,
  resolveTracks,
  trackAudioUrl,
} from "../lib/peridot-client";
import { offlineAudioBlob, readSavedOfflineTracks } from "../lib/offline-audio";
import { readOfflineCatalog } from "../lib/offline-catalog";
import { isTrackPlayable } from "../lib/offline-playback";
import {
  notifyQueueSaveFailed,
  notifyTrackDownloadFailed,
} from "../lib/toasts";
import { useCatalogRevision } from "./use-catalog-query";
import {
  readPersistedPlayerState,
  savePersistedPlayerState,
  type PlayerStateScope,
} from "../lib/player-storage";
import { useServer } from "./use-server";
import { useSession } from "./use-session";
import { useUser } from "./use-user";
import { useLocalizedMessage } from "./use-localized-message";
import { localizedError } from "../lib/messages.ts";
import { useServerConnection } from "./use-server-connection";
import { queryKeys } from "../lib/query-keys";
import { persistQueryKey } from "../lib/query-persister";

let queueWriteTail = Promise.resolve();
let pendingQueueSave: {
  scope: string;
  version: number;
  body: {
    trackIds: string[];
    activeTrackId: string | null;
    shuffleEnabled: boolean;
    shuffleTrackIds: string[];
  };
} | null = null;

interface QueueSnapshot {
  trackIds: readonly string[];
  activeTrackId: string | null;
  shuffleEnabled: boolean;
  shuffleTrackIds: readonly string[];
}

type PlayerTrack = string | TrackResponse;

export function useLibraryPlayer(options: { audio?: boolean } = {}) {
  const { address } = useServer();
  const { token } = useSession();
  const { user } = useUser();
  const { t } = useI18n();
  const { errorMessage } = useLocalizedMessage();
  const { status: serverStatus } = useServerConnection();
  const queryClient = useQueryClient();
  const { revision: catalogRevision } = useCatalogRevision();
  const playing = useState("player-playing", () => false);
  const repeatMode = useState<RepeatMode>("player-repeat-mode", () => "off");
  const elapsed = useState("player-elapsed", () => 0);
  const volume = useState("player-volume", () => 72);
  const mediaDuration = useState("player-media-duration", () => 0);
  const loading = useState("player-loading", () => false);
  const error = useState<string | null>("player-error", () => null);
  const playbackRequest = useState("player-playback-request", () => 0);
  const playHistoryVersion = useState("player-play-history-version", () => 0);
  const queueTrackIds = useState<string[]>("player-queue-track-ids", () => []);
  const activeTrackId = useState<string | null>(
    "player-active-track-id",
    () => null,
  );
  const shuffleEnabled = useState("player-shuffle-enabled", () => false);
  const shuffleTrackIds = useState<string[]>(
    "player-shuffle-track-ids",
    () => [],
  );
  const queueLoaded = useState("player-queue-loaded", () => false);
  const queueLoading = useState("player-queue-loading", () => false);
  const queueError = useState<string | null>("player-queue-error", () => null);
  const queueAuthScope = useState<string | null>(
    "player-queue-auth-scope",
    () => null,
  );
  const queueMutationVersion = useState(
    "player-queue-mutation-version",
    () => 0,
  );
  const queueHistory = useState<string[]>("player-queue-history", () => []);
  const activePlaylistId = useState<string | null>(
    "player-active-playlist-id",
    () => null,
  );
  const offlineSavedTrackIds = useState<string[]>(
    "player-offline-saved-track-ids",
    () => [],
  );
  const queueTracks = useState<TrackResponse[]>(
    "player-queue-tracks",
    () => [],
  );
  const repeatCycleTrackIds = useState<string[]>(
    "player-repeat-cycle-track-ids",
    () => [],
  );
  let localStateChecked = false;
  let localPersistenceReady = false;
  let queueHydrationVersion = 0;
  const resolvedQueueTracks = computed(() =>
    resolvePlayerQueue(queueTracks.value, queueTrackIds.value),
  );
  const active = computed(() =>
    selectPlayerTrack(resolvedQueueTracks.value, activeTrackId.value),
  );
  const currentTrackId = computed(() => active.value?.id ?? null);
  const upcomingTracks = computed(() =>
    resolvedQueueTracks.value.filter(
      (track) => track.id !== currentTrackId.value,
    ),
  );
  const offlineSavedTrackIdSet = computed(
    () => new Set(offlineSavedTrackIds.value),
  );
  const currentTrackPlayable = computed(() =>
    active.value
      ? isTrackPlayable(active.value, {
          serverLost: serverStatus.value === "lost",
          savedTrackIds: offlineSavedTrackIdSet.value,
        })
      : false,
  );
  const canGoNext = computed(() => {
    if (!currentTrackId.value) return false;
    const playableQueueIds =
      serverStatus.value === "lost"
        ? normalizedQueue().filter((trackId) =>
            offlineSavedTrackIdSet.value.has(trackId),
          )
        : normalizedQueue();
    return shuffleEnabled.value
      ? shuffleTrackIds.value.some((trackId) =>
          playableQueueIds.includes(trackId),
        ) ||
          (repeatMode.value === "all" && playableQueueIds.length > 1)
      : playableQueueIds.some((trackId) => trackId !== currentTrackId.value) ||
          (repeatMode.value === "all" &&
            repeatCycleTrackIds.value.some(
              (trackId) =>
                serverStatus.value !== "lost" ||
                offlineSavedTrackIdSet.value.has(trackId),
            ));
  });
  const durationSeconds = computed(() => {
    const catalogDuration = Math.floor((active.value?.durationMs ?? 0) / 1000);
    return catalogDuration > 0 ? catalogDuration : mediaDuration.value;
  });

  function currentScope(): string {
    return `${address.value ?? ""}|${user.value?.id ?? ""}`;
  }

  async function hydrateQueueTracks(force = false) {
    const version = ++queueHydrationVersion;
    if (
      !import.meta.client ||
      !address.value ||
      !token.value ||
      !queueTrackIds.value.length
    ) {
      queueTracks.value = [];
      return;
    }
    const requestedIds = [...new Set(queueTrackIds.value)];
    const existingIds = new Set(queueTracks.value.map((track) => track.id));
    const missingIds = force
      ? requestedIds
      : requestedIds.filter((trackId) => !existingIds.has(trackId));
    if (!missingIds.length) return;
    const serverAddress = address.value;
    const sessionToken = token.value;
    try {
      const items: TrackResponse[] = [];
      for (let index = 0; index < missingIds.length; index += 200) {
        const result = await resolveTracks(
          serverAddress,
          sessionToken,
          missingIds.slice(index, index + 200),
        );
        items.push(...result.items);
      }
      if (
        version !== queueHydrationVersion ||
        serverAddress !== address.value ||
        sessionToken !== token.value
      ) {
        return;
      }
      const resolved = mergePlayerQueueTracks(
        queueTracks.value,
        items,
        requestedIds,
      );
      if (!haveSameTrackReferences(resolved, queueTracks.value)) {
        queueTracks.value = resolved;
      }
    } catch {
      const scope = playerStateScope();
      if (scope && import.meta.client) {
        try {
          const saved = await readSavedOfflineTracks(scope);
          const catalog = await readOfflineCatalog(scope);
          const savedById = new Map(
            saved.map((item) => [item.track.id, item.track]),
          );
          const catalogById = new Map(
            (catalog?.tracks ?? []).map((track) => [track.id, track]),
          );
          const fallbackItems = requestedIds.flatMap((trackId) => {
            const track = savedById.get(trackId) ?? catalogById.get(trackId);
            return track ? [track] : [];
          });
          const resolved = mergePlayerQueueTracks(
            queueTracks.value,
            fallbackItems,
            requestedIds,
          );
          if (!haveSameTrackReferences(resolved, queueTracks.value)) {
            queueTracks.value = resolved;
          }
        } catch {
          // Keep already-resolved queue rows visible when both sources fail.
        }
      }
    }
  }

  function playerStateScope(): PlayerStateScope | null {
    if (!address.value || !user.value?.id) return null;
    return {
      serverAddress: address.value,
      userId: user.value.id,
    };
  }

  async function refreshOfflineSavedTracks() {
    const scope = playerStateScope();
    if (!scope) {
      offlineSavedTrackIds.value = [];
      return;
    }
    try {
      const saved = await readSavedOfflineTracks(scope);
      offlineSavedTrackIds.value = saved.map((item) => item.track.id);
    } catch {
      offlineSavedTrackIds.value = [];
    }
  }

  function isOfflineTrackPlayable(trackId: string | null): boolean {
    return Boolean(
      trackId &&
      (serverStatus.value !== "lost" ||
        offlineSavedTrackIdSet.value.has(trackId)),
    );
  }

  function playableQueueIds(): string[] {
    const trackIds = normalizedQueue();
    return serverStatus.value === "lost"
      ? trackIds.filter((trackId) => offlineSavedTrackIdSet.value.has(trackId))
      : trackIds;
  }

  function persistLocalPlayerState() {
    if (!localPersistenceReady || !import.meta.client) return;
    const scope = playerStateScope();
    if (!scope) return;
    savePersistedPlayerState(window.localStorage, scope, {
      currentTrackId: activeTrackId.value,
      positionSeconds: elapsed.value,
      queueTrackIds: queueTrackIds.value,
      shuffleEnabled: shuffleEnabled.value,
      shuffleTrackIds: shuffleTrackIds.value,
    });
  }

  function restoreLocalPlayerState(): boolean {
    if (!import.meta.client) return false;
    const scope = playerStateScope();
    if (!scope) return false;
    const stored = readPersistedPlayerState(window.localStorage, scope);
    if (!stored) return false;

    queueAuthScope.value = currentScope();
    setQueueSnapshot(
      {
        trackIds: stored.queueTrackIds,
        activeTrackId: stored.currentTrackId,
        shuffleEnabled: stored.shuffleEnabled,
        shuffleTrackIds: stored.shuffleTrackIds,
      },
      false,
    );
    elapsed.value = stored.positionSeconds;
    mediaDuration.value = 0;
    playing.value = false;
    return true;
  }

  function availableTrackIds(): Set<string> {
    return new Set(queueTrackIds.value);
  }

  function normalizedQueue(
    trackIds: readonly string[] = queueTrackIds.value,
  ): string[] {
    return [...new Set(trackIds)];
  }

  function trackIdFor(track: PlayerTrack): string {
    return typeof track === "string" ? track : track.id;
  }

  function rememberQueueTrackDetails(
    tracks: readonly PlayerTrack[],
    nextQueueTrackIds: readonly string[],
  ) {
    const trackDetails = tracks.filter(
      (track): track is TrackResponse => typeof track !== "string",
    );
    if (!trackDetails.length) return;
    const resolved = mergePlayerQueueTracks(
      queueTracks.value,
      trackDetails,
      nextQueueTrackIds,
    );
    if (!haveSameTrackReferences(resolved, queueTracks.value)) {
      queueTracks.value = resolved;
    }
  }

  function clearQueue() {
    queueTrackIds.value = [];
    activeTrackId.value = null;
    shuffleEnabled.value = false;
    shuffleTrackIds.value = [];
    queueHistory.value = [];
    queueLoaded.value = false;
    queueLoading.value = false;
    queueError.value = null;
    repeatCycleTrackIds.value = [];
    repeatMode.value = "off";
    playing.value = false;
    elapsed.value = 0;
    mediaDuration.value = 0;
  }

  function syncScope() {
    const scope = currentScope();
    if (queueAuthScope.value === scope) return false;
    clearQueue();
    queueAuthScope.value = scope;
    localStateChecked = false;
    queueMutationVersion.value += 1;
    return true;
  }

  function saveQueue(snapshot: QueueSnapshot) {
    const serverAddress = address.value;
    const sessionToken = token.value;
    const scope = currentScope();
    const version = queueMutationVersion.value;
    const body = {
      trackIds: [...snapshot.trackIds],
      activeTrackId: snapshot.activeTrackId,
      shuffleEnabled: snapshot.shuffleEnabled,
      shuffleTrackIds: [...snapshot.shuffleTrackIds],
    };
    pendingQueueSave = { scope, version, body };
    queueWriteTail = queueWriteTail
      .catch(() => undefined)
      .then(async () => {
        if (
          queueAuthScope.value !== scope ||
          queueMutationVersion.value !== version
        ) {
          return;
        }
        if (!serverAddress || !sessionToken) {
          throw localizedError(
            "error.connectServer",
            "Connect to your server and try again.",
          );
        }
        const savedQueue = await replaceQueue(
          serverAddress,
          sessionToken,
          body,
        );
        if (user.value?.id) {
          const queueKey = queryKeys.queue({
            serverAddress,
            userId: user.value.id,
          });
          queryClient.setQueryData(queueKey, savedQueue);
          await persistQueryKey(queueKey);
        }
        if (
          pendingQueueSave?.scope === scope &&
          pendingQueueSave.version === version
        ) {
          pendingQueueSave = null;
        }
      })
      .catch((reason: unknown) => {
        if (
          isPeridotNetworkError(reason) ||
          serverStatus.value === "lost" ||
          isAuthenticationRedirectError(reason)
        ) {
          return;
        }
        notifyQueueSaveFailed(errorMessage(reason, "error.queueSave"));
      });
  }

  function flushPendingQueue() {
    const pending = pendingQueueSave;
    const serverAddress = address.value;
    const sessionToken = token.value;
    if (
      !pending ||
      !serverAddress ||
      !sessionToken ||
      pending.scope !== currentScope()
    ) {
      return;
    }
    queueWriteTail = queueWriteTail
      .catch(() => undefined)
      .then(async () => {
        await replaceQueue(serverAddress, sessionToken, pending.body);
        if (pendingQueueSave?.version === pending.version) {
          pendingQueueSave = null;
        }
      })
      .catch(() => undefined);
  }

  function setQueueSnapshot(
    snapshot: QueueSnapshot,
    persist = true,
    rememberRepeatCycle = true,
  ) {
    const normalizedTrackIds = normalizedQueue(snapshot.trackIds);
    const normalizedActiveTrackId =
      snapshot.activeTrackId &&
      normalizedTrackIds.includes(snapshot.activeTrackId)
        ? snapshot.activeTrackId
        : (normalizedTrackIds[0] ?? null);
    const allowedShuffleIds = new Set(
      normalizedTrackIds.filter(
        (trackId) => trackId !== normalizedActiveTrackId,
      ),
    );
    const normalizedShuffleTrackIds = snapshot.shuffleEnabled
      ? [...new Set(snapshot.shuffleTrackIds)].filter((trackId) =>
          allowedShuffleIds.has(trackId),
        )
      : [];
    const normalized: QueueSnapshot = {
      trackIds: normalizedTrackIds,
      activeTrackId: normalizedActiveTrackId,
      shuffleEnabled: snapshot.shuffleEnabled,
      shuffleTrackIds: normalizedShuffleTrackIds,
    };

    queueTrackIds.value = normalizedTrackIds;
    activeTrackId.value = normalizedActiveTrackId;
    shuffleEnabled.value = snapshot.shuffleEnabled;
    shuffleTrackIds.value = normalizedShuffleTrackIds;
    if (rememberRepeatCycle) repeatCycleTrackIds.value = normalizedTrackIds;
    queueLoaded.value = true;
    queueError.value = null;
    queueMutationVersion.value += 1;
    if (address.value && user.value?.id) {
      const queueKey = queryKeys.queue({
        serverAddress: address.value,
        userId: user.value.id,
      });
      queryClient.setQueryData(queueKey, normalized);
      void persistQueryKey(queueKey);
    }
    if (persist) saveQueue(normalized);
    return normalized;
  }

  async function loadQueue(force = false) {
    syncScope();
    if (!force && !localStateChecked) {
      localStateChecked = true;
      if (restoreLocalPlayerState()) return;
    }
    if (force) localStateChecked = true;
    if (queueLoading.value || (!force && queueLoaded.value)) return;
    const serverAddress = address.value;
    const sessionToken = token.value;
    if (!serverAddress || !sessionToken) {
      clearQueue();
      return;
    }

    const scope = currentScope();
    const version = queueMutationVersion.value;
    queueLoading.value = true;
    queueError.value = null;
    try {
      const response = await queryClient.fetchQuery({
        queryKey: queryKeys.queue({
          serverAddress,
          userId: user.value?.id ?? "",
        }),
        queryFn: () => fetchQueue(serverAddress, sessionToken),
        staleTime: 0,
        meta: { persist: true },
      });
      if (
        queueAuthScope.value !== scope ||
        queueMutationVersion.value !== version
      ) {
        return;
      }
      setQueueSnapshot(response, false);
      playing.value = false;
      elapsed.value = 0;
      mediaDuration.value = 0;
    } catch (reason) {
      if (isAuthenticationRedirectError(reason)) return;
      queueError.value = errorMessage(reason, "error.queueLoad");
    } finally {
      if (queueAuthScope.value === scope) queueLoading.value = false;
    }
  }

  function rememberCurrentTrack(nextTrackId: string) {
    const current = currentTrackId.value;
    if (current && current !== nextTrackId) {
      queueHistory.value = [...queueHistory.value, current];
    }
  }

  function play(track?: PlayerTrack, restart = false) {
    activePlaylistId.value = null;
    const nextTrackId = track ? trackIdFor(track) : currentTrackId.value;
    if (!nextTrackId) return;
    if (!isOfflineTrackPlayable(nextTrackId)) return;
    if (!restart && nextTrackId === currentTrackId.value && playing.value) {
      playing.value = false;
      return;
    }
    void loadQueue();
    const changed = nextTrackId !== currentTrackId.value;
    if (changed) rememberCurrentTrack(nextTrackId);
    const trackIds = moveTrackToFront(normalizedQueue(), nextTrackId);
    rememberQueueTrackDetails(track ? [track] : [], trackIds);
    setQueueSnapshot({
      trackIds,
      activeTrackId: nextTrackId,
      shuffleEnabled: shuffleEnabled.value,
      shuffleTrackIds: shuffleEnabled.value
        ? removeFromShufflePool(shuffleTrackIds.value, nextTrackId)
        : [],
    });
    if (restart || changed) {
      elapsed.value = 0;
      playbackRequest.value++;
    }
    playing.value = true;
  }

  function playCollection(
    tracks: readonly PlayerTrack[],
    startTrackId: string = tracks[0] ? trackIdFor(tracks[0]) : "",
  ) {
    activePlaylistId.value = null;
    const playableTracks =
      serverStatus.value === "lost"
        ? tracks.filter((track) =>
            offlineSavedTrackIdSet.value.has(trackIdFor(track)),
          )
        : tracks;
    const trackIds = playableTracks.map(trackIdFor);
    const nextQueue = rotateQueueToTrack(
      normalizeQueueTrackIds(trackIds, new Set(trackIds)),
      startTrackId,
    );
    const firstTrackId = nextQueue[0];
    if (!firstTrackId) return;
    void loadQueue();
    rememberCurrentTrack(firstTrackId);
    rememberQueueTrackDetails(playableTracks, nextQueue);
    setQueueSnapshot({
      trackIds: nextQueue,
      activeTrackId: firstTrackId,
      shuffleEnabled: shuffleEnabled.value,
      shuffleTrackIds: shuffleEnabled.value
        ? shuffledPoolExcept(nextQueue, firstTrackId)
        : [],
    });
    elapsed.value = 0;
    playbackRequest.value++;
    playing.value = true;
  }

  function next() {
    const current = currentTrackId.value;
    if (!current) return;
    queueHistory.value = [...queueHistory.value, current];
    if (shuffleEnabled.value) {
      const trackIds = playableQueueIds();
      const shufflePool = shuffleTrackIds.value.filter((trackId) =>
        trackIds.includes(trackId),
      );
      const advanced = advanceShuffle(
        trackIds,
        current,
        shufflePool,
        repeatMode.value === "all",
      );
      if (advanced.activeTrackId === current) {
        playing.value = false;
        return;
      }
      setQueueSnapshot(
        {
          trackIds,
          activeTrackId: advanced.activeTrackId,
          shuffleEnabled: true,
          shuffleTrackIds: advanced.shuffleTrackIds,
        },
        true,
        false,
      );
      elapsed.value = 0;
      mediaDuration.value = 0;
      playbackRequest.value++;
      playing.value = true;
      return;
    }

    const nextQueue = consumeQueue(playableQueueIds());
    const repeatingAll =
      repeatMode.value === "all" && repeatCycleTrackIds.value.length > 0;
    const sourceQueue =
      repeatingAll && !nextQueue.length
        ? repeatCycleTrackIds.value.filter(
            (trackId) =>
              serverStatus.value !== "lost" ||
              offlineSavedTrackIdSet.value.has(trackId),
          )
        : nextQueue;
    setQueueSnapshot(
      {
        trackIds: sourceQueue,
        activeTrackId: sourceQueue[0] ?? null,
        shuffleEnabled: false,
        shuffleTrackIds: [],
      },
      true,
      false,
    );
    elapsed.value = 0;
    mediaDuration.value = 0;
    if (nextQueue.length || repeatingAll) {
      playbackRequest.value++;
      playing.value = true;
    } else {
      playing.value = false;
    }
  }

  function previous() {
    const available =
      serverStatus.value === "lost"
        ? new Set(playableQueueIds())
        : availableTrackIds();
    while (
      queueHistory.value.length &&
      !available.has(queueHistory.value[queueHistory.value.length - 1]!)
    ) {
      queueHistory.value = queueHistory.value.slice(0, -1);
    }
    const previousTrackId = queueHistory.value.at(-1);
    if (previousTrackId) {
      queueHistory.value = queueHistory.value.slice(0, -1);
      if (shuffleEnabled.value) {
        const trackIds = normalizedQueue();
        const pool = removeFromShufflePool(
          shuffleTrackIds.value,
          previousTrackId,
        );
        setQueueSnapshot({
          trackIds: trackIds.includes(previousTrackId)
            ? trackIds
            : [previousTrackId, ...trackIds],
          activeTrackId: previousTrackId,
          shuffleEnabled: true,
          shuffleTrackIds: restorePreviousShuffleTrack(
            pool,
            currentTrackId.value,
          ),
        });
      } else {
        const trackIds = restorePreviousTrack(
          normalizedQueue(),
          previousTrackId,
        );
        setQueueSnapshot({
          trackIds,
          activeTrackId: trackIds[0] ?? null,
          shuffleEnabled: false,
          shuffleTrackIds: [],
        });
      }
      elapsed.value = 0;
      playbackRequest.value++;
      playing.value = true;
      return;
    }
    if (!currentTrackId.value) return;
    elapsed.value = 0;
    playbackRequest.value++;
    playing.value = true;
  }

  async function addToQueue(trackId: string): Promise<boolean> {
    if (!trackId) return false;
    if (!isOfflineTrackPlayable(trackId)) return false;
    if (!queueLoaded.value) await loadQueue();
    if (!queueLoaded.value) return false;
    const trackIds = addTrackAfterActive(
      normalizedQueue(),
      currentTrackId.value,
      trackId,
    );
    setQueueSnapshot({
      trackIds,
      activeTrackId: currentTrackId.value,
      shuffleEnabled: shuffleEnabled.value,
      shuffleTrackIds:
        shuffleEnabled.value && trackId !== currentTrackId.value
          ? appendToShufflePool(shuffleTrackIds.value, trackId)
          : [],
    });
    return true;
  }

  function removeFromQueue(trackId: string) {
    const current = currentTrackId.value;
    if (!trackId || trackId === current) return;
    setQueueSnapshot({
      trackIds: removeQueueTrack(normalizedQueue(), trackId),
      activeTrackId: current,
      shuffleEnabled: shuffleEnabled.value,
      shuffleTrackIds: removeFromShufflePool(shuffleTrackIds.value, trackId),
    });
  }

  function reorderQueue(upcomingTrackIds: readonly string[]) {
    setQueueSnapshot({
      trackIds: reorderSourceQueue(
        normalizedQueue(),
        currentTrackId.value,
        upcomingTrackIds,
      ),
      activeTrackId: currentTrackId.value,
      shuffleEnabled: shuffleEnabled.value,
      shuffleTrackIds: shuffleTrackIds.value,
    });
  }

  function toggleRandomization() {
    if (shuffleEnabled.value) {
      const trackIds = compactQueueAfterShuffle(
        normalizedQueue(),
        currentTrackId.value,
        shuffleTrackIds.value,
      );
      setQueueSnapshot({
        trackIds,
        activeTrackId: currentTrackId.value,
        shuffleEnabled: false,
        shuffleTrackIds: [],
      });
      return;
    }
    const trackIds = playableQueueIds();
    if (trackIds.length < 2 || !currentTrackId.value) return;
    setQueueSnapshot({
      trackIds,
      activeTrackId: currentTrackId.value,
      shuffleEnabled: true,
      shuffleTrackIds: shuffledPoolExcept(trackIds, currentTrackId.value),
    });
  }

  function cycleRepeatMode() {
    repeatMode.value = nextRepeatMode(repeatMode.value);
  }

  function togglePlayback() {
    if (!isOfflineTrackPlayable(currentTrackId.value)) return;
    playing.value = !playing.value;
  }

  function seek(seconds: number) {
    const maximum = durationSeconds.value;
    const bounded = Math.max(
      0,
      Math.min(Math.floor(seconds), maximum > 0 ? maximum : seconds),
    );
    elapsed.value = Number.isFinite(bounded) ? bounded : 0;
  }

  function setVolume(nextVolume: number) {
    volume.value = Math.max(0, Math.min(100, Math.round(nextVolume)));
  }

  async function downloadTrack(trackId = currentTrackId.value) {
    const serverAddress = address.value;
    const sessionToken = token.value;
    if (!trackId) return;
    if (!serverAddress || !sessionToken) {
      notifyTrackDownloadFailed(t("like.track"), t("error.connectServer"));
      return;
    }

    try {
      const track =
        queueTracks.value.find((candidate) => candidate.id === trackId) ??
        (await resolveTracks(serverAddress, sessionToken, [trackId])).items[0];
      if (!track) return;
      const issued = await createPlaybackToken(
        serverAddress,
        sessionToken,
        track.id,
      );
      const response = await fetch(
        trackAudioUrl(serverAddress, track.id, issued.token),
      );
      if (!response.ok) {
        throw localizedError(
          "error.audioPrepare",
          "The server could not provide the audio file.",
        );
      }
      const objectUrl = URL.createObjectURL(await response.blob());
      const anchor = document.createElement("a");
      anchor.href = objectUrl;
      anchor.download = trackDownloadFileName(track);
      document.body.append(anchor);
      anchor.click();
      anchor.remove();
      setTimeout(() => URL.revokeObjectURL(objectUrl), 0);
    } catch (reason) {
      if (isAuthenticationRedirectError(reason)) return;
      notifyTrackDownloadFailed(
        queueTracks.value.find((candidate) => candidate.id === trackId)
          ?.title ?? t("like.track"),
        errorMessage(reason, "error.audioPrepare"),
      );
    }
  }

  watch([address, token], () => void hydrateQueueTracks());
  watch(queueTrackIds, () => void hydrateQueueTracks());
  watch(catalogRevision, () => void hydrateQueueTracks(true));
  watch(
    serverStatus,
    (status) => {
      if (status === "lost") void refreshOfflineSavedTracks();
    },
    { immediate: true },
  );

  if (options.audio) {
    watch([address, token, () => user.value?.id], () => {
      if (syncScope()) void loadQueue();
    });
  }

  if (options.audio) {
    watch(serverStatus, (status) => {
      if (status === "connected") flushPendingQueue();
    });
  }

  if (options.audio && import.meta.client) {
    localPersistenceReady = true;
    const stopLocalStateWatch = watch(
      [queueTrackIds, activeTrackId, shuffleEnabled, shuffleTrackIds, elapsed],
      persistLocalPlayerState,
      { deep: true },
    );
    onUnmounted(stopLocalStateWatch);
  }

  if (options.audio) {
    let audio: HTMLAudioElement | undefined;
    let loadedTrackId: string | null = null;
    let loadingTrackId: string | null = null;
    let offlineObjectUrl: string | null = null;
    let loadAttempt = 0;
    let lastRecordedPlaybackRequest = -1;
    let stallTimer: ReturnType<typeof setTimeout> | undefined;
    let stopAudioWatch: (() => void) | undefined;
    let stopPositionWatch: (() => void) | undefined;
    let stopVolumeWatch: (() => void) | undefined;

    const playbackError = (reason: unknown, fallbackKey: string) =>
      errorMessage(reason, fallbackKey);

    async function playLoadedTrack(trackId: string, attempt: number) {
      if (
        !audio ||
        loadedTrackId !== trackId ||
        currentTrackId.value !== trackId ||
        !playing.value
      ) {
        return;
      }
      try {
        loading.value = true;
        await audio.play();
        if (
          attempt === loadAttempt &&
          loadedTrackId === trackId &&
          currentTrackId.value === trackId &&
          playing.value &&
          serverStatus.value !== "lost" &&
          !offlineObjectUrl &&
          lastRecordedPlaybackRequest !== playbackRequest.value
        ) {
          lastRecordedPlaybackRequest = playbackRequest.value;
          const serverAddress = address.value;
          const sessionToken = token.value;
          if (serverAddress && sessionToken) {
            void recordTrackPlay(serverAddress, sessionToken, trackId)
              .then(() => {
                playHistoryVersion.value += 1;
              })
              .catch(() => undefined);
          }
        }
        if (
          attempt === loadAttempt &&
          loadedTrackId === trackId &&
          currentTrackId.value === trackId
        ) {
          loading.value = false;
        }
      } catch (reason) {
        if (
          attempt !== loadAttempt ||
          currentTrackId.value !== trackId ||
          !playing.value
        ) {
          return;
        }
        const blocked =
          reason instanceof DOMException && reason.name === "NotAllowedError";
        playing.value = false;
        error.value = blocked
          ? t("error.playbackBlocked")
          : t("error.audioUnavailable");
        if (!blocked) loadedTrackId = null;
        loading.value = false;
      }
    }

    async function loadOfflineTrack(
      trackId: string,
      attempt: number,
    ): Promise<boolean> {
      const scope = playerStateScope();
      const blob = scope ? await offlineAudioBlob(scope, trackId) : null;
      if (!blob || attempt !== loadAttempt || !audio) return false;
      if (offlineObjectUrl) URL.revokeObjectURL(offlineObjectUrl);
      offlineObjectUrl = URL.createObjectURL(blob);
      audio.src = offlineObjectUrl;
      loadedTrackId = trackId;
      audio.load();
      if (elapsed.value > 0) audio.currentTime = elapsed.value;
      playing.value = true;
      await playLoadedTrack(trackId, attempt);
      return true;
    }

    async function prepareTrack(trackId: string, attempt: number) {
      const serverAddress = address.value;
      const sessionToken = token.value;
      if (serverStatus.value === "lost") {
        try {
          error.value = null;
          if (!(await loadOfflineTrack(trackId, attempt))) {
            playing.value = false;
            error.value = t("error.offlineTrackMissing");
          }
        } finally {
          if (attempt === loadAttempt) {
            loading.value = false;
            loadingTrackId = null;
          }
        }
        return;
      }
      if (!serverAddress || !sessionToken) {
        playing.value = false;
        error.value = t("error.playServer");
        loading.value = false;
        loadingTrackId = null;
        return;
      }

      try {
        const issued = await createPlaybackToken(
          serverAddress,
          sessionToken,
          trackId,
        );
        if (attempt !== loadAttempt || !audio) return;
        audio.src = trackAudioUrl(serverAddress, trackId, issued.token);
        loadedTrackId = trackId;
        audio.load();
        if (elapsed.value > 0) audio.currentTime = elapsed.value;
        await playLoadedTrack(trackId, attempt);
      } catch (reason) {
        if (attempt !== loadAttempt) return;
        loadedTrackId = null;
        playing.value = false;
        if (isAuthenticationRedirectError(reason)) return;
        if (isPeridotNetworkError(reason)) {
          if (await loadOfflineTrack(trackId, attempt)) {
            return;
          }
          error.value = t("error.offlineTrackMissing");
          return;
        }
        error.value = playbackError(reason, "error.audioPrepare");
      } finally {
        if (attempt === loadAttempt) {
          loading.value = false;
          loadingTrackId = null;
        }
      }
    }

    onMounted(() => {
      audio = new Audio();
      audio.preload = "auto";
      audio.volume = volume.value / 100;
      void loadQueue();

      const updatePosition = () => {
        if (!audio || !Number.isFinite(audio.currentTime)) return;
        elapsed.value = Math.floor(audio.currentTime);
      };
      const updateDuration = () => {
        if (!audio || !Number.isFinite(audio.duration)) return;
        mediaDuration.value = Math.floor(audio.duration);
        if (elapsed.value > 0) audio.currentTime = elapsed.value;
      };
      const handleEnded = () => {
        if (loadedTrackId !== currentTrackId.value) return;
        if (repeatMode.value === "one") {
          elapsed.value = 0;
          playbackRequest.value++;
          playing.value = true;
          return;
        }
        next();
      };
      const handleError = () => {
        if (!loadedTrackId) return;
        const failedTrackId = loadedTrackId;
        const failedAttempt = loadAttempt;
        loadedTrackId = null;
        loading.value = false;
        playing.value = false;
        if (!offlineObjectUrl) {
          error.value = null;
          void loadOfflineTrack(failedTrackId, failedAttempt).then((loaded) => {
            if (!loaded) error.value = t("error.audioDecode");
          });
        } else {
          error.value = t("error.audioDecode");
        }
      };
      const handleWaiting = () => {
        if (!audio || !playing.value) return;
        loading.value = true;
        if (stallTimer) clearTimeout(stallTimer);
        if (!offlineObjectUrl) {
          stallTimer = setTimeout(() => {
            stallTimer = undefined;
            handleError();
          }, 3_000);
        }
      };
      const handlePlaying = () => {
        if (!audio || loadedTrackId !== currentTrackId.value) return;
        if (stallTimer) clearTimeout(stallTimer);
        stallTimer = undefined;
        loading.value = false;
      };

      audio.addEventListener("timeupdate", updatePosition);
      audio.addEventListener("loadedmetadata", updateDuration);
      audio.addEventListener("ended", handleEnded);
      audio.addEventListener("error", handleError);
      audio.addEventListener("waiting", handleWaiting);
      audio.addEventListener("stalled", handleWaiting);
      audio.addEventListener("playing", handlePlaying);

      stopVolumeWatch = watch(volume, (value) => {
        if (audio) audio.volume = value / 100;
      });
      stopPositionWatch = watch(elapsed, (position) => {
        if (
          !audio ||
          !Number.isFinite(position) ||
          Math.abs(audio.currentTime - position) < 0.5
        ) {
          return;
        }
        try {
          audio.currentTime = position;
        } catch {
          // The pending seek is applied when the media source is ready.
        }
      });

      stopAudioWatch = watch(
        [currentTrackId, playing, playbackRequest],
        async ([trackId, shouldPlay, request], previous) => {
          if (!audio) return;
          const previousTrackId = previous?.[0] ?? null;
          const previousRequest = previous?.[2] ?? request;
          const trackChanged =
            previous !== undefined && trackId !== previousTrackId;

          if (trackChanged) {
            loadAttempt++;
            loadedTrackId = null;
            loadingTrackId = null;
            loading.value = false;
            error.value = null;
            elapsed.value = 0;
            mediaDuration.value = 0;
            audio.pause();
            audio.removeAttribute("src");
            audio.load();
            if (offlineObjectUrl) {
              URL.revokeObjectURL(offlineObjectUrl);
              offlineObjectUrl = null;
            }
          }

          if (!trackId) return;
          if (!shouldPlay) {
            audio.pause();
            loading.value = false;
            return;
          }

          if (
            !trackChanged &&
            request !== previousRequest &&
            loadedTrackId === trackId
          ) {
            audio.currentTime = 0;
            elapsed.value = 0;
            await playLoadedTrack(trackId, loadAttempt);
            return;
          }
          if (loadedTrackId === trackId) {
            await playLoadedTrack(trackId, loadAttempt);
            return;
          }
          if (loadingTrackId === trackId) return;

          const attempt = ++loadAttempt;
          loadingTrackId = trackId;
          loading.value = true;
          error.value = null;
          await prepareTrack(trackId, attempt);
        },
        { immediate: true },
      );
    });

    onUnmounted(() => {
      stopAudioWatch?.();
      stopPositionWatch?.();
      stopVolumeWatch?.();
      if (stallTimer) clearTimeout(stallTimer);
      if (!audio) return;
      loadAttempt++;
      loading.value = false;
      loadingTrackId = null;
      audio.pause();
      audio.removeAttribute("src");
      audio.load();
      if (offlineObjectUrl) {
        URL.revokeObjectURL(offlineObjectUrl);
        offlineObjectUrl = null;
      }
      audio = undefined;
    });
  }

  return {
    tracks: resolvedQueueTracks,
    playing,
    repeatMode,
    currentTrackId,
    elapsed,
    volume,
    loading,
    error,
    queueError,
    queueLoaded,
    queueLoading,
    shuffleEnabled,
    active,
    queueTracks,
    upcomingTracks,
    currentTrackPlayable,
    canGoNext,
    durationSeconds,
    loadQueue,
    play,
    playCollection,
    addToQueue,
    removeFromQueue,
    reorderQueue,
    toggleRandomization,
    cycleRepeatMode,
    next,
    previous,
    togglePlayback,
    seek,
    setVolume,
    downloadTrack,
  };
}
