export type RepeatMode = "off" | "all" | "one";

export function nextRepeatMode(mode: RepeatMode): RepeatMode {
  if (mode === "off") return "all";
  if (mode === "all") return "one";
  return "off";
}

function withoutTrack(mediaIds: readonly string[], mediaId: string): string[] {
  return mediaIds.filter((candidate) => candidate !== mediaId);
}

export function normalizeQueueTrackIds(
  mediaIds: readonly string[],
  availableTrackIds: ReadonlySet<string>,
): string[] {
  return [...new Set(mediaIds)].filter((mediaId) =>
    availableTrackIds.has(mediaId),
  );
}

export function moveTrackToFront(
  mediaIds: readonly string[],
  mediaId: string,
): string[] {
  return [mediaId, ...withoutTrack(mediaIds, mediaId)];
}

export function rotateQueueToTrack(
  mediaIds: readonly string[],
  mediaId: string,
): string[] {
  const uniqueTrackIds = [...new Set(mediaIds)];
  const startIndex = uniqueTrackIds.indexOf(mediaId);
  if (startIndex <= 0) return uniqueTrackIds;
  return [
    ...uniqueTrackIds.slice(startIndex),
    ...uniqueTrackIds.slice(0, startIndex),
  ];
}

export function addTrackNext(
  mediaIds: readonly string[],
  mediaId: string,
): string[] {
  const activeTrackId = mediaIds[0];
  if (activeTrackId === mediaId) return [...mediaIds];
  const remaining = withoutTrack(mediaIds, mediaId).filter(
    (candidate) => candidate !== activeTrackId,
  );
  return activeTrackId ? [activeTrackId, mediaId, ...remaining] : [mediaId];
}

export function addTrackAfterActive(
  mediaIds: readonly string[],
  activeTrackId: string | null,
  mediaId: string,
): string[] {
  const normalized = [...new Set(mediaIds)];
  if (!activeTrackId) return [mediaId];
  if (activeTrackId === mediaId) return normalized;
  const next = withoutTrack(normalized, mediaId);
  const activeIndex = next.indexOf(activeTrackId);
  if (activeIndex < 0) return [mediaId, ...next];
  next.splice(activeIndex + 1, 0, mediaId);
  return next;
}

export function consumeQueue(mediaIds: readonly string[]): string[] {
  return mediaIds.slice(1);
}

export function nextPreviewTrackId({
  currentTrackId,
  playableTrackIds,
  shuffleEnabled,
  shuffleTrackIds,
  repeatMode,
  repeatCycleTrackIds,
}: {
  currentTrackId: string | null;
  playableTrackIds: readonly string[];
  shuffleEnabled: boolean;
  shuffleTrackIds: readonly string[];
  repeatMode: RepeatMode;
  repeatCycleTrackIds: readonly string[];
}): string | null {
  if (!currentTrackId) return null;
  const playable = new Set(playableTrackIds);
  if (shuffleEnabled) {
    return (
      shuffleTrackIds.find(
        (mediaId) => mediaId !== currentTrackId && playable.has(mediaId),
      ) ?? null
    );
  }
  const nextId = consumeQueue(playableTrackIds).find(
    (mediaId) => mediaId !== currentTrackId,
  );
  if (nextId) return nextId;
  if (repeatMode !== "all") return null;
  return (
    repeatCycleTrackIds.find((mediaId) => mediaId !== currentTrackId) ?? null
  );
}

export function lastAvailableHistoryTrackId(
  historyTrackIds: readonly string[],
  availableTrackIds: ReadonlySet<string>,
): string | null {
  return (
    [...historyTrackIds]
      .reverse()
      .find((mediaId) => availableTrackIds.has(mediaId)) ?? null
  );
}

export function removeQueueTrack(
  mediaIds: readonly string[],
  mediaId: string,
): string[] {
  return withoutTrack(mediaIds, mediaId);
}

export function reorderUpcoming(
  mediaIds: readonly string[],
  upcomingTrackIds: readonly string[],
): string[] {
  const activeTrackId = mediaIds[0];
  if (!activeTrackId) return [];
  const allowed = new Set(mediaIds.slice(1));
  const next = [...new Set(upcomingTrackIds)].filter(
    (mediaId) => mediaId !== activeTrackId && allowed.has(mediaId),
  );
  for (const mediaId of mediaIds.slice(1)) {
    if (!next.includes(mediaId)) next.push(mediaId);
  }
  return [activeTrackId, ...next];
}

export function reorderSourceQueue(
  mediaIds: readonly string[],
  activeTrackId: string | null,
  reorderedTrackIds: readonly string[],
): string[] {
  if (!activeTrackId) return [];
  const editable = new Set(
    mediaIds.filter((mediaId) => mediaId !== activeTrackId),
  );
  const next = [...new Set(reorderedTrackIds)].filter(
    (mediaId) => editable.has(mediaId) && mediaId !== activeTrackId,
  );
  for (const mediaId of mediaIds) {
    if (mediaId !== activeTrackId && !next.includes(mediaId)) {
      next.push(mediaId);
    }
  }
  let nextIndex = 0;
  return mediaIds.map((mediaId) =>
    mediaId === activeTrackId ? mediaId : next[nextIndex++]!,
  );
}

export function shuffleTrackIds(
  mediaIds: readonly string[],
  random: () => number = Math.random,
): string[] {
  const shuffled = [...new Set(mediaIds)];
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
  mediaIds: readonly string[],
  excludedTrackId: string | null,
  random: () => number = Math.random,
): string[] {
  return shuffleTrackIds(
    mediaIds.filter((mediaId) => mediaId !== excludedTrackId),
    random,
  );
}

export function shuffleUpcoming(
  mediaIds: readonly string[],
  random: () => number = Math.random,
): string[] {
  const activeTrackId = mediaIds[0];
  if (!activeTrackId) return [];
  return [
    activeTrackId,
    ...shuffledPoolExcept(mediaIds.slice(1), activeTrackId, random),
  ];
}

export function removeFromShufflePool(
  shuffleTrackIds: readonly string[],
  mediaId: string,
): string[] {
  return withoutTrack(shuffleTrackIds, mediaId);
}

export function appendToShufflePool(
  shuffleTrackIds: readonly string[],
  mediaId: string,
): string[] {
  return [...withoutTrack(shuffleTrackIds, mediaId), mediaId];
}

export function advanceShuffle(
  mediaIds: readonly string[],
  activeTrackId: string,
  shuffleTrackIds: readonly string[],
  repeatAll: boolean,
  random: () => number = Math.random,
): { activeTrackId: string; shuffleTrackIds: string[] } {
  const allowed = new Set(
    mediaIds.filter((mediaId) => mediaId !== activeTrackId),
  );
  const pool = [...new Set(shuffleTrackIds)].filter((mediaId) =>
    allowed.has(mediaId),
  );
  const nextTrackId = pool[0];
  if (nextTrackId) {
    return {
      activeTrackId: nextTrackId,
      shuffleTrackIds: pool.slice(1),
    };
  }
  if (repeatAll && mediaIds.length > 1) {
    const renewed = shuffledPoolExcept(mediaIds, activeTrackId, random);
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
  mediaIds: readonly string[],
  activeTrackId: string | null,
  shuffleTrackIds: readonly string[],
): string[] {
  if (!activeTrackId) return [];
  const unplayed = new Set(shuffleTrackIds);
  return [
    activeTrackId,
    ...mediaIds.filter(
      (mediaId) => mediaId !== activeTrackId && unplayed.has(mediaId),
    ),
  ];
}

export function restorePreviousTrack(
  mediaIds: readonly string[],
  previousTrackId: string,
): string[] {
  const activeTrackId = mediaIds[0];
  if (!activeTrackId) return [previousTrackId];
  return [
    previousTrackId,
    activeTrackId,
    ...withoutTrack(mediaIds.slice(1), previousTrackId),
  ];
}
