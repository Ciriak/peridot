function withoutTrack(trackIds: readonly string[], trackId: string): string[] {
  return trackIds.filter((candidate) => candidate !== trackId);
}

export function normalizeQueueTrackIds(
  trackIds: readonly string[],
  availableTrackIds: ReadonlySet<string>,
): string[] {
  return [...new Set(trackIds)].filter((trackId) =>
    availableTrackIds.has(trackId),
  );
}

export function moveTrackToFront(
  trackIds: readonly string[],
  trackId: string,
): string[] {
  return [trackId, ...withoutTrack(trackIds, trackId)];
}

export function addTrackNext(
  trackIds: readonly string[],
  trackId: string,
): string[] {
  const activeTrackId = trackIds[0];
  if (activeTrackId === trackId) return [...trackIds];
  const remaining = withoutTrack(trackIds, trackId).filter(
    (candidate) => candidate !== activeTrackId,
  );
  return activeTrackId ? [activeTrackId, trackId, ...remaining] : [trackId];
}

export function consumeQueue(trackIds: readonly string[]): string[] {
  return trackIds.slice(1);
}

export function removeQueueTrack(
  trackIds: readonly string[],
  trackId: string,
): string[] {
  return withoutTrack(trackIds, trackId);
}

export function reorderUpcoming(
  trackIds: readonly string[],
  upcomingTrackIds: readonly string[],
): string[] {
  const activeTrackId = trackIds[0];
  if (!activeTrackId) return [];
  const allowed = new Set(trackIds.slice(1));
  const next = [...new Set(upcomingTrackIds)].filter(
    (trackId) => trackId !== activeTrackId && allowed.has(trackId),
  );
  for (const trackId of trackIds.slice(1)) {
    if (!next.includes(trackId)) next.push(trackId);
  }
  return [activeTrackId, ...next];
}

export function shuffleUpcoming(
  trackIds: readonly string[],
  random: () => number = Math.random,
): string[] {
  const activeTrackId = trackIds[0];
  if (!activeTrackId) return [];
  const upcoming = trackIds.slice(1);
  for (let index = upcoming.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    [upcoming[index], upcoming[swapIndex]] = [
      upcoming[swapIndex]!,
      upcoming[index]!,
    ];
  }
  return [activeTrackId, ...upcoming];
}

export function restorePreviousTrack(
  trackIds: readonly string[],
  previousTrackId: string,
): string[] {
  const activeTrackId = trackIds[0];
  if (!activeTrackId) return [previousTrackId];
  return [
    previousTrackId,
    activeTrackId,
    ...withoutTrack(trackIds.slice(1), previousTrackId),
  ];
}
