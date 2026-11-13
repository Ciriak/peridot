import type { TrackListResponse, TrackResponse } from "@peridot/contracts";

export type LikedTrackPageLoader = (
  cursor: string | null,
) => Promise<TrackListResponse>;

export async function loadAllLikedTracks(
  loadPage: LikedTrackPageLoader,
): Promise<TrackResponse[]> {
  const tracks: TrackResponse[] = [];
  const seenTrackIds = new Set<string>();
  const seenCursors = new Set<string>();
  let cursor: string | null = null;

  while (true) {
    const page = await loadPage(cursor);
    for (const track of page.items) {
      if (seenTrackIds.has(track.id)) continue;
      seenTrackIds.add(track.id);
      tracks.push(track);
    }

    if (!page.nextCursor) return tracks;
    if (seenCursors.has(page.nextCursor)) {
      throw new Error("Liked track pagination repeated a cursor.");
    }
    seenCursors.add(page.nextCursor);
    cursor = page.nextCursor;
  }
}
