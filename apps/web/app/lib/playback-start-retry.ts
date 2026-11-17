export const PLAYBACK_START_MAX_RETRIES = 3;

export function nextPlaybackStartRetry(retriesUsed: number): number | null {
  return retriesUsed < PLAYBACK_START_MAX_RETRIES ? retriesUsed + 1 : null;
}
