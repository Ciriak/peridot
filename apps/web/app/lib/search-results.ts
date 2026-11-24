import type { MediaType } from "@peridot/contracts";

export type TrackSearchResultType = "song" | "chapter" | "episode";

export type SearchResultType =
  | "album"
  | "playlist"
  | "music"
  | "audiobook"
  | "podcast"
  | "release"
  | TrackSearchResultType;

export function trackSearchResultType(
  mediaType: MediaType,
): TrackSearchResultType {
  if (mediaType === "audiobook") return "chapter";
  if (mediaType === "podcast") return "episode";
  return "song";
}

export function searchResultTypeLabelKey(type: SearchResultType): string {
  return `page.search.resultType.${type}`;
}
