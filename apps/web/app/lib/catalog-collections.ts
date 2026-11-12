import type { TrackResponse } from "@peridot/contracts";
import { listTracks } from "./peridot-client";

interface CollectionQuery {
  albumId?: string;
  artistId?: string;
}

export async function loadCollectionTracks(
  serverAddress: string,
  token: string,
  query: CollectionQuery,
): Promise<TrackResponse[]> {
  const tracks: TrackResponse[] = [];
  let cursor: string | null = null;
  do {
    const page = await listTracks(serverAddress, token, {
      ...query,
      limit: 200,
      sort: query.albumId ? "track" : "artist",
      direction: "asc",
      ...(cursor ? { cursor } : {}),
    });
    tracks.push(...page.items);
    cursor = page.nextCursor;
  } while (cursor);
  return tracks;
}
