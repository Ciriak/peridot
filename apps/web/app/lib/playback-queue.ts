export type RepeatMode = "off" | "all" | "one";

export function nextRepeatMode(mode: RepeatMode): RepeatMode {
  if (mode === "off") return "all";
  if (mode === "all") return "one";
  return "off";
}

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

export function addTrackAfterActive(
  trackIds: readonly string[],
  activeTrackId: string | null,
  trackId: string,
): string[] {
  const normalized = [...new Set(trackIds)];
  if (!activeTrackId) return [trackId];
  if (activeTrackId === trackId) return normalized;
  const next = withoutTrack(normalized, trackId);
  const activeIndex = next.indexOf(activeTrackId);
  if (activeIndex < 0) return [trackId, ...next];
  next.splice(activeIndex + 1, 0, trackId);
  return next;
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

export function reorderSourceQueue(
  trackIds: readonly string[],
  activeTrackId: string | null,
  reorderedTrackIds: readonly string[],
): string[] {
  if (!activeTrackId) return [];
  const editable = new Set(
    trackIds.filter((trackId) => trackId !== activeTrackId),
  );
  const next = [...new Set(reorderedTrackIds)].filter(
    (trackId) => editable.has(trackId) && trackId !== activeTrackId,
  );
  for (const trackId of trackIds) {
    if (trackId !== activeTrackId && !next.includes(trackId)) {
      next.push(trackId);
    }
  }
  let nextIndex = 0;
  return trackIds.map((trackId) =>
    trackId === activeTrackId ? trackId : next[nextIndex++]!,
  );
}

export function shuffleTrackIds(
  trackIds: readonly string[],
  random: () => number = Math.random,
): string[] {
  const shuffled = [...new Set(trackIds)];
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    [shuffled[index], shuffled[swapIndex]] = [
      shuffled[swapIndex]!,
      shuffled[index]!,
    ];
  }
  return shuffled;
}

export function shuffledPoolExcept(
  trackIds: readonly string[],
  excludedTrackId: string | null,
  random: () => number = Math.random,
): string[] {
  return shuffleTrackIds(
    trackIds.filter((trackId) => trackId !== excludedTrackId),
    random,
  );
}

export function shuffleUpcoming(
  trackIds: readonly string[],
  random: () => number = Math.random,
): string[] {
  const activeTrackId = trackIds[0];
  if (!activeTrackId) return [];
  return [
    activeTrackId,
    ...shuffledPoolExcept(trackIds.slice(1), activeTrackId, random),
  ];
}

export function removeFromShufflePool(
  shuffleTrackIds: readonly string[],
  trackId: string,
): string[] {
  return withoutTrack(shuffleTrackIds, trackId);
}

export function appendToShufflePool(
  shuffleTrackIds: readonly string[],
  trackId: string,
): string[] {
  return [...withoutTrack(shuffleTrackIds, trackId), trackId];
}

export function advanceShuffle(
  trackIds: readonly string[],
  activeTrackId: string,
  shuffleTrackIds: readonly string[],
  repeatAll: boolean,
  random: () => number = Math.random,
): { activeTrackId: string; shuffleTrackIds: string[] } {
  const allowed = new Set(
    trackIds.filter((trackId) => trackId !== activeTrackId),
  );
  const pool = [...new Set(shuffleTrackIds)].filter((trackId) =>
    allowed.has(trackId),
  );
  const nextTrackId = pool[0];
  if (nextTrackId) {
    return {
      activeTrackId: nextTrackId,
      shuffleTrackIds: pool.slice(1),
    };
  }
  if (repeatAll && trackIds.length > 1) {
    const renewed = shuffledPoolExcept(trackIds, activeTrackId, random);
    return {
      activeTrackId: renewed[0]!,
      shuffleTrackIds: renewed.slice(1),
    };
  }
  return { activeTrackId, shuffleTrackIds: [] };
}

export function restorePreviousShuffleTrack(
  shuffleTrackIds: readonly string[],
  displacedTrackId: string | null,
): string[] {
  return displacedTrackId
    ? [displacedTrackId, ...withoutTrack(shuffleTrackIds, displacedTrackId)]
    : [...shuffleTrackIds];
}

export function compactQueueAfterShuffle(
  trackIds: readonly string[],
  activeTrackId: string | null,
  shuffleTrackIds: readonly string[],
): string[] {
  if (!activeTrackId) return [];
  const unplayed = new Set(shuffleTrackIds);
  return [
    activeTrackId,
    ...trackIds.filter(
      (trackId) => trackId !== activeTrackId && unplayed.has(trackId),
    ),
  ];
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
