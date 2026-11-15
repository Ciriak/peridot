export type PlaybackState = "idle" | "loading" | "playing" | "paused" | "error";
export type RepeatMode = "off" | "all" | "one";

export interface PlaybackSnapshot {
  state: PlaybackState;
  trackId: string | null;
  positionMs: number;
  durationMs: number;
  volume: number;
  repeatMode: RepeatMode;
  shuffleEnabled: boolean;
  error: string | null;
}

export interface PlaybackQueue {
  trackIds: string[];
  activeTrackId: string | null;
  shuffleEnabled: boolean;
  shuffleTrackIds: string[];
  repeatMode: RepeatMode;
  positionMs: number;
}

export interface PlaybackTransport {
  initialize(): Promise<void>;
  replaceQueue(queue: PlaybackQueue): Promise<void>;
  play(): Promise<void>;
  pause(): Promise<void>;
  next(): Promise<void>;
  previous(): Promise<void>;
  seek(positionMs: number): Promise<void>;
  setVolume(volume: number): Promise<void>;
  dispose(): Promise<void>;
}
