import type { MediaType } from "@peridot/contracts";

export type SearchResultType =
  | "album"
  | "playlist"
  | "song"
  | "chapter"
  | "episode";

export function trackSearchResultType(
  mediaType: MediaType,
): Exclude<SearchResultType, "album" | "playlist"> {
  if (mediaType === "audiobook") return "chapter";
  if (mediaType === "podcast") return "episode";
  return "song";
}

export function searchResultTypeLabelKey(type: SearchResultType): string {
  return `page.search.resultType.${type}`;
}
