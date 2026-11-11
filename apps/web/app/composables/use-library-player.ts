import { useState } from "#imports";
import { computed, onMounted, onUnmounted, watch } from "vue";
import { resolvePlayerQueue, trackDownloadFileName } from "../lib/library";
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
  shuffledPoolExcept,
  type RepeatMode,
} from "../lib/playback-queue";
import {
  createPlaybackToken,
  fetchQueue,
  replaceQueue,
  trackAudioUrl,
} from "../lib/peridot-client";
import {
  notifyQueueSaveFailed,
  notifyTrackDownloaded,
  notifyTrackDownloadFailed,
} from "../lib/toasts";
import {
  readPersistedPlayerState,
  savePersistedPlayerState,
  type PlayerStateScope,
} from "../lib/player-storage";
import { useLibraryTracks } from "./use-library-tracks";
import { useServer } from "./use-server";
import { useSession } from "./use-session";
import { useUser } from "./use-user";

let queueWriteTail = Promise.resolve();

interface QueueSnapshot {
  trackIds: readonly string[];
  activeTrackId: string | null;
  shuffleEnabled: boolean;
  shuffleTrackIds: readonly string[];
}

export function useLibraryPlayer(options: { audio?: boolean } = {}) {
  const { tracks, loaded: tracksLoaded } = useLibraryTracks();
  const { address } = useServer();
  const { token } = useSession();
  const { user } = useUser();
  const playing = useState("player-playing", () => false);
  const repeatMode = useState<RepeatMode>("player-repeat-mode", () => "off");
  const elapsed = useState("player-elapsed", () => 0);
  const volume = useState("player-volume", () => 72);
  const mediaDuration = useState("player-media-duration", () => 0);
  const loading = useState("player-loading", () => false);
  const error = useState<string | null>("player-error", () => null);
  const playbackRequest = useState("player-playback-request", () => 0);
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
  const repeatCycleTrackIds = useState<string[]>(
    "player-repeat-cycle-track-ids",
    () => [],
  );
  let localStateChecked = false;
  let localPersistenceReady = false;
  const queueTracks = computed(() =>
    resolvePlayerQueue(tracks.value, queueTrackIds.value),
  );
  const active = computed(
    () =>
      queueTracks.value.find((track) => track.id === activeTrackId.value) ??
      queueTracks.value[0] ??
      null,
  );
  const currentTrackId = computed(() => active.value?.id ?? null);
  const upcomingTracks = computed(() =>
    queueTracks.value.filter((track) => track.id !== currentTrackId.value),
  );
  const canGoNext = computed(
    () =>
      Boolean(currentTrackId.value) &&
      (shuffleEnabled.value
        ? shuffleTrackIds.value.length > 0 ||
          (repeatMode.value === "all" && queueTracks.value.length > 1)
        : upcomingTracks.value.length > 0 ||
          (repeatMode.value === "all" && repeatCycleTrackIds.value.length > 0)),
  );
  const durationSeconds = computed(() => {
    const catalogDuration = Math.floor((active.value?.durationMs ?? 0) / 1000);
    return catalogDuration > 0 ? catalogDuration : mediaDuration.value;
  });

  function currentScope(): string {
    return `${address.value ?? ""}|${user.value?.id ?? ""}`;
  }

  function playerStateScope(): PlayerStateScope | null {
    if (!address.value || !user.value?.id) return null;
    return {
      serverAddress: address.value,
      userId: user.value.id,
    };
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
    return new Set(tracks.value.map((track) => track.id));
  }

  function normalizedQueue(
    trackIds: readonly string[] = queueTrackIds.value,
  ): string[] {
    return tracksLoaded.value
      ? normalizeQueueTrackIds(trackIds, availableTrackIds())
      : [...new Set(trackIds)];
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
          throw new Error("Connect to your Peridot server and try again.");
        }
        await replaceQueue(serverAddress, sessionToken, body);
      })
      .catch((reason: unknown) => {
        notifyQueueSaveFailed(
          reason instanceof Error
            ? reason.message
            : "The server could not save the queue.",
        );
      });
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
      const response = await fetchQueue(serverAddress, sessionToken);
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
      queueError.value =
        reason instanceof Error
          ? reason.message
          : "The server could not load your queue.";
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

  function play(trackId?: string, restart = false) {
    const nextTrackId = trackId ?? currentTrackId.value;
    if (
      !nextTrackId ||
      !tracks.value.some((track) => track.id === nextTrackId)
    ) {
      return;
    }
    if (!restart && nextTrackId === currentTrackId.value && playing.value) {
      playing.value = false;
      return;
    }
    void loadQueue();
    const changed = nextTrackId !== currentTrackId.value;
    if (changed) rememberCurrentTrack(nextTrackId);
    const trackIds = moveTrackToFront(normalizedQueue(), nextTrackId);
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

  function playCollection(trackIds: readonly string[]) {
    const nextQueue = normalizeQueueTrackIds(trackIds, availableTrackIds());
    const firstTrackId = nextQueue[0];
    if (!firstTrackId) return;
    void loadQueue();
    rememberCurrentTrack(firstTrackId);
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
      const trackIds = normalizedQueue();
      const advanced = advanceShuffle(
        trackIds,
        current,
        shuffleTrackIds.value,
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

    const nextQueue = consumeQueue(normalizedQueue());
    const repeatingAll =
      repeatMode.value === "all" && repeatCycleTrackIds.value.length > 0;
    const sourceQueue =
      repeatingAll && !nextQueue.length ? repeatCycleTrackIds.value : nextQueue;
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
    const available = availableTrackIds();
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
    if (!tracks.value.some((track) => track.id === trackId)) return false;
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
    const trackIds = normalizedQueue();
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
    if (!currentTrackId.value) return;
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
    const track = tracks.value.find((candidate) => candidate.id === trackId);
    const serverAddress = address.value;
    const sessionToken = token.value;
    if (!track) return;
    if (!serverAddress || !sessionToken) {
      notifyTrackDownloadFailed(
        track.title,
        "Connect to your Peridot server and try again.",
      );
      return;
    }

    try {
      const issued = await createPlaybackToken(
        serverAddress,
        sessionToken,
        track.id,
      );
      const response = await fetch(
        trackAudioUrl(serverAddress, track.id, issued.token),
      );
      if (!response.ok) {
        throw new Error("The server could not provide the audio file.");
      }
      const objectUrl = URL.createObjectURL(await response.blob());
      const anchor = document.createElement("a");
      anchor.href = objectUrl;
      anchor.download = trackDownloadFileName(track);
      document.body.append(anchor);
      anchor.click();
      anchor.remove();
      setTimeout(() => URL.revokeObjectURL(objectUrl), 0);
      notifyTrackDownloaded(track.title);
    } catch (reason) {
      notifyTrackDownloadFailed(
        track.title,
        reason instanceof Error
          ? reason.message
          : "The audio file could not be prepared.",
      );
    }
  }

  if (options.audio) {
    watch([address, token, () => user.value?.id], () => {
      if (syncScope()) void loadQueue();
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
    let loadAttempt = 0;
    let stopAudioWatch: (() => void) | undefined;
    let stopPositionWatch: (() => void) | undefined;
    let stopVolumeWatch: (() => void) | undefined;

    const playbackError = (reason: unknown, fallback: string) =>
      reason instanceof Error ? reason.message : fallback;

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
        await audio.play();
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
          ? "Your browser blocked playback. Press play to try again."
          : "This track could not be played.";
        if (!blocked) loadedTrackId = null;
      }
    }

    async function prepareTrack(trackId: string, attempt: number) {
      const serverAddress = address.value;
      const sessionToken = token.value;
      if (!serverAddress || !sessionToken) {
        playing.value = false;
        error.value = "Connect to your Peridot server to play music.";
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
        error.value = playbackError(
          reason,
          "The track could not be prepared for playback.",
        );
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
        loadedTrackId = null;
        loading.value = false;
        playing.value = false;
        error.value = "This audio file could not be decoded or played.";
      };

      audio.addEventListener("timeupdate", updatePosition);
      audio.addEventListener("loadedmetadata", updateDuration);
      audio.addEventListener("ended", handleEnded);
      audio.addEventListener("error", handleError);

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
          }

          if (!trackId) return;
          if (!shouldPlay) {
            audio.pause();
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
      if (!audio) return;
      loadAttempt++;
      loading.value = false;
      loadingTrackId = null;
      audio.pause();
      audio.removeAttribute("src");
      audio.load();
      audio = undefined;
    });
  }

  return {
    tracks,
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
