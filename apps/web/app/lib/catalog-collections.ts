import { listTracks } from "./peridot-client";

interface CollectionQuery {
  albumId?: string;
  artistId?: string;
}

export async function loadCollectionTrackIds(
  serverAddress: string,
  token: string,
  query: CollectionQuery,
): Promise<string[]> {
  const trackIds: string[] = [];
  let cursor: string | null = null;
  do {
    const page = await listTracks(serverAddress, token, {
      ...query,
      limit: 200,
      sort: query.albumId ? "track" : "artist",
      direction: "asc",
      ...(cursor ? { cursor } : {}),
    });
    trackIds.push(...page.items.map((track) => track.id));
    cursor = page.nextCursor;
  } while (cursor);
  return trackIds;
}
