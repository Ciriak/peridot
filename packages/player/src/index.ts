export type PlaybackState = "idle" | "loading" | "playing" | "paused" | "error";
export interface PlaybackSnapshot {
  state: PlaybackState;
  trackId: string | null;
  positionMs: number;
  volume: number;
}
