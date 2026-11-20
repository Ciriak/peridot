export const PLAYBACK_START_MAX_ATTEMPTS = 3;
export const PLAYBACK_START_MAX_RETRIES = PLAYBACK_START_MAX_ATTEMPTS - 1;

export function nextPlaybackStartRetry(retriesUsed: number): number | null {
  return retriesUsed < PLAYBACK_START_MAX_RETRIES ? retriesUsed + 1 : null;
}
