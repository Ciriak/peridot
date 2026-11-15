import type { PlaylistEntryResponse, TrackResponse } from "@peridot/contracts";

export interface PlaylistPlaybackAvailability {
  serverLost: boolean;
  savedTrackIds: ReadonlySet<string>;
}

export function playlistPlayableTracks(
  entries: readonly PlaylistEntryResponse[],
  availability: PlaylistPlaybackAvailability,
): TrackResponse[] {
  return entries.flatMap((entry) => {
    if (!entry.track) return [];
    if (availability.serverLost) {
      return availability.savedTrackIds.has(entry.track.id)
        ? [entry.track]
        : [];
    }
    return entry.track.available ? [entry.track] : [];
  });
}

export function playlistCoverSlots(
  coverUrls: readonly string[],
): Array<string | null> {
  return Array.from({ length: 9 }, (_, index) => coverUrls[index] ?? null);
}
