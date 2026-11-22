import type {
  PlaylistEntryResponse,
  PlaylistSummaryResponse,
  TrackResponse,
} from "@peridot/contracts";
import {
  isTrackPlayable,
  type PlaybackAvailability,
} from "./offline-playback.ts";

export type PlaylistPlaybackAvailability = PlaybackAvailability;

export function playlistPlayableTracks(
  entries: readonly PlaylistEntryResponse[],
  availability: PlaylistPlaybackAvailability,
): TrackResponse[] {
  return entries.flatMap((entry) => {
    if (!entry.track) return [];
    return isTrackPlayable(entry.track, availability) ? [entry.track] : [];
  });
}

export function playlistCoverSlots(
  coverUrls: readonly string[],
): Array<string | null> {
  return Array.from({ length: 9 }, (_, index) => coverUrls[index] ?? null);
}

export function filterPlaylistEntries(
  entries: readonly PlaylistEntryResponse[],
  query: string,
): PlaylistEntryResponse[] {
  const normalized = query.trim().toLocaleLowerCase();
  if (!normalized) return [...entries];
  return entries.filter((entry) =>
    `${entry.title} ${[entry.artist, ...entry.artists].join(" ")} ${entry.album ?? ""}`
      .toLocaleLowerCase()
      .includes(normalized),
  );
}

export function filterAddablePlaylists(
  playlists: readonly PlaylistSummaryResponse[],
  query: string,
): PlaylistSummaryResponse[] {
  const terms = query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
  return playlists.filter(
    (playlist) =>
      playlist.kind === "manual" &&
      terms.every((term) => playlist.name.toLocaleLowerCase().includes(term)),
  );
}
