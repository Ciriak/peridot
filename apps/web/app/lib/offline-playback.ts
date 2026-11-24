import type { MediaResponse } from "@peridot/contracts";

export interface PlaybackAvailability {
  serverLost: boolean;
  savedTrackIds: ReadonlySet<string>;
  unavailableTrackIds?: ReadonlySet<string>;
}

export function isTrackPlayable(
  track: MediaResponse,
  availability: PlaybackAvailability,
): boolean {
  if (availability.unavailableTrackIds?.has(track.id)) return false;
  return (
    availability.savedTrackIds.has(track.id) ||
    (!availability.serverLost && track.available)
  );
}

export function playableTracks(
  tracks: readonly MediaResponse[],
  availability: PlaybackAvailability,
): MediaResponse[] {
  return tracks.filter((track) => isTrackPlayable(track, availability));
}
