export const REALTIME_RECONNECT_DELAYS = [
  1_000, 2_000, 4_000, 8_000, 15_000, 30_000,
] as const;

export function realtimeReconnectDelay(
  attempt: number,
  randomValue = Math.random(),
): number {
  const delay =
    REALTIME_RECONNECT_DELAYS[
      Math.min(attempt, REALTIME_RECONNECT_DELAYS.length - 1)
    ] ?? REALTIME_RECONNECT_DELAYS.at(-1)!;
  return Math.round(delay * (0.85 + randomValue * 0.3));
}
