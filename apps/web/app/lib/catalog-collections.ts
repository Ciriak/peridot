import type { MediaResponse } from "@peridot/contracts";
import { listTracks } from "./peridot-client";

interface CollectionQuery {
  albumId?: string;
  collectionId?: string;
  mediaType?: "music" | "audiobook" | "podcast";
  artistId?: string;
}

export async function loadCollectionTracks(
  serverAddress: string,
  token: string,
  query: CollectionQuery,
): Promise<MediaResponse[]> {
  const tracks: MediaResponse[] = [];
  let cursor: string | null = null;
  do {
    const page = await listTracks(serverAddress, token, {
      ...query,
      limit: 200,
      sort:
        query.mediaType === "podcast"
          ? "published"
          : query.albumId || query.collectionId
            ? "track"
            : "artist",
      direction: query.mediaType === "podcast" ? "desc" : "asc",
      ...(cursor ? { cursor } : {}),
    });
    tracks.push(...page.items);
    cursor = page.nextCursor;
  } while (cursor);
  return tracks;
}
