import type { TrackResponse } from "@peridot/contracts";
import type { Ref } from "vue";
import { onBeforeUnmount, watch } from "vue";
import { isTauriRuntime } from "../lib/desktop-runtime";
import { isAndroidRuntime } from "../lib/android-runtime";
import { trackArtistNames, trackCoverUrl } from "../lib/library";
import { configureWebMediaSession } from "../lib/web-media-session";
import { useServer } from "./use-server";

export interface WebMediaSessionPlayer {
  active: Readonly<Ref<TrackResponse | null>>;
  currentTrackId: Readonly<Ref<string | null>>;
  durationSeconds: Readonly<Ref<number>>;
  elapsed: Readonly<Ref<number>>;
  next: () => void;
  playing: Readonly<Ref<boolean>>;
  previous: () => void;
  seek: (seconds: number) => void;
  togglePlayback: () => void;
}

function setPositionState(
  mediaSession: MediaSession,
  elapsed: number,
  duration: number,
) {
  if (!mediaSession.setPositionState) return;
  if (!Number.isFinite(duration) || duration <= 0) return;
  try {
    mediaSession.setPositionState({
      duration,
      playbackRate: 1,
      position: Math.max(0, Math.min(elapsed, duration)),
    });
  } catch {
    // Position updates are optional and can race a track reset.
  }
}

export function useWebMediaSession(player: WebMediaSessionPlayer) {
  if (
    !import.meta.client ||
    isTauriRuntime() ||
    isAndroidRuntime() ||
    !navigator.mediaSession
  ) {
    return;
  }

  const { address } = useServer();
  const mediaSession = navigator.mediaSession;
  const cleanupActions = configureWebMediaSession(mediaSession, {
    play: () => {
      if (player.currentTrackId.value && !player.playing.value) {
        player.togglePlayback();
      }
    },
    pause: () => {
      if (player.playing.value) player.togglePlayback();
    },
    next: player.next,
    previous: player.previous,
    seek: player.seek,
  });

  const updateMetadata = () => {
    const track = player.active.value;
    if (!track || typeof MediaMetadata === "undefined") {
      mediaSession.metadata = null;
      return;
    }
    const coverUrl = trackCoverUrl(address.value ?? "", track.coverUrl);
    mediaSession.metadata = new MediaMetadata({
      title: track.title,
      artist: trackArtistNames(track).join(", "),
      album: track.album ?? undefined,
      artwork: coverUrl ? [{ src: coverUrl }] : [],
    });
  };

  watch(player.active, updateMetadata, { immediate: true });
  watch(
    [player.playing, player.active],
    () => {
      mediaSession.playbackState = player.active.value
        ? player.playing.value
          ? "playing"
          : "paused"
        : "none";
    },
    { immediate: true },
  );
  watch(
    [player.elapsed, player.durationSeconds],
    ([elapsed, duration]) => {
      setPositionState(mediaSession, elapsed, duration);
    },
    { immediate: true },
  );

  onBeforeUnmount(() => {
    cleanupActions();
    mediaSession.metadata = null;
    mediaSession.playbackState = "none";
  });
}
