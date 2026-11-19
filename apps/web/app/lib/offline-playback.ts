import type { TrackResponse } from "@peridot/contracts";

export interface PlaybackAvailability {
  serverLost: boolean;
  savedTrackIds: ReadonlySet<string>;
}

export function isTrackPlayable(
  track: TrackResponse,
  availability: PlaybackAvailability,
): boolean {
  return availability.savedTrackIds.has(track.id) || track.available;
}

export function playableTracks(
  tracks: readonly TrackResponse[],
  availability: PlaybackAvailability,
): TrackResponse[] {
  return tracks.filter((track) => isTrackPlayable(track, availability));
}
