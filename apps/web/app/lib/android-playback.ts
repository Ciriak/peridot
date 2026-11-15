import type { TrackResponse } from "@peridot/contracts";
import { registerPlugin, type PluginListenerHandle } from "@capacitor/core";
import { trackCoverUrl } from "./library.ts";

export interface AndroidTrackSnapshot {
  id: string;
  title: string;
  artist: string;
  album: string | null;
  albumId: string | null;
  durationMs: number | null;
  coverUrl: string | null;
  mimeType: string;
  available: boolean;
  mediaType: "music" | "audiobook" | "podcast";
}

export interface AndroidPlaybackQueue {
  tracks: AndroidTrackSnapshot[];
  activeTrackId: string | null;
  positionMs: number;
  playing: boolean;
  volume: number;
  repeatMode: "off" | "all" | "one";
  shuffleEnabled: boolean;
  shuffleTrackIds: string[];
}

export interface AndroidPlaybackSnapshot extends Omit<
  AndroidPlaybackQueue,
  "tracks"
> {
  trackIds: string[];
  tracks: AndroidTrackSnapshot[];
  loading: boolean;
  durationMs: number;
  error: string | null;
}

export interface AndroidCachedTrack {
  track: AndroidTrackSnapshot;
  savedAt: string;
  size: number;
}

interface PeridotMediaPlugin {
  initializeSession(options: {
    serverAddress: string;
    token: string;
    userId: string;
  }): Promise<void>;
  clearSession(): Promise<void>;
  replaceQueue(options: { queue: AndroidPlaybackQueue }): Promise<void>;
  play(): Promise<void>;
  pause(): Promise<void>;
  next(): Promise<void>;
  previous(): Promise<void>;
  seek(options: { positionSeconds: number }): Promise<void>;
  setVolume(options: { volume: number }): Promise<void>;
  setRepeat(options: { mode: "off" | "all" | "one" }): Promise<void>;
  setShuffle(options: { enabled: boolean }): Promise<void>;
  getSnapshot(): Promise<{ snapshot: AndroidPlaybackSnapshot | null }>;
  cacheTrack(options: {
    track: AndroidTrackSnapshot;
  }): Promise<AndroidCachedTrack>;
  listCachedTracks(): Promise<{ items: AndroidCachedTrack[] }>;
  removeCachedTrack(options: { trackId: string }): Promise<void>;
  clearOfflineTracks(): Promise<void>;
  addListener(
    eventName: "playbackStateChanged",
    listener: (event: { snapshot: AndroidPlaybackSnapshot }) => void,
  ): Promise<PluginListenerHandle>;
  addListener(
    eventName: "offlineProgress",
    listener: (event: { trackId: string; progress: number | null }) => void,
  ): Promise<PluginListenerHandle>;
}

export const PeridotMedia = registerPlugin<PeridotMediaPlugin>("PeridotMedia");

export function androidTrackSnapshot(
  track: TrackResponse,
  serverAddress: string,
): AndroidTrackSnapshot {
  return {
    id: track.id,
    title: track.title,
    artist: track.artists.join(", ") || track.artist,
    album: track.album,
    albumId: track.albumId,
    durationMs: track.durationMs,
    coverUrl: trackCoverUrl(serverAddress, track.coverUrl),
    mimeType: track.mimeType,
    available: track.available,
    mediaType: track.mediaType,
  };
}

export function androidQueue(
  tracks: readonly TrackResponse[],
  state: {
    activeTrackId: string | null;
    positionSeconds: number;
    playing: boolean;
    volume: number;
    repeatMode: "off" | "all" | "one";
    shuffleEnabled: boolean;
    shuffleTrackIds: readonly string[];
  },
  serverAddress: string,
): AndroidPlaybackQueue {
  return {
    tracks: tracks.map((track) => androidTrackSnapshot(track, serverAddress)),
    activeTrackId: state.activeTrackId,
    positionMs: Math.max(0, Math.floor(state.positionSeconds * 1000)),
    playing: state.playing,
    volume: Math.max(0, Math.min(1, state.volume / 100)),
    repeatMode: state.repeatMode,
    shuffleEnabled: state.shuffleEnabled,
    shuffleTrackIds: [...state.shuffleTrackIds],
  };
}

export function trackResponseFromAndroid(
  track: AndroidTrackSnapshot,
): TrackResponse {
  let coverUrl: string | null = track.coverUrl;
  if (coverUrl) {
    try {
      const url = new URL(coverUrl);
      coverUrl = `${url.pathname}${url.search}`;
    } catch {
      coverUrl = null;
    }
  }
  return {
    id: track.id,
    mediaType: track.mediaType,
    title: track.title,
    artist: track.artist,
    artists: track.artist ? [track.artist] : [],
    album: track.album,
    genres: [],
    albumId: track.albumId,
    discNumber: null,
    trackNumber: null,
    durationMs: track.durationMs,
    publishedAt: null,
    mimeType: track.mimeType,
    available: track.available,
    coverUrl,
    metadata: null,
    liked: false,
  };
}
