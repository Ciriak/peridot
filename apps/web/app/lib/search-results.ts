import type { MediaType } from "@peridot/contracts";

export const SEARCH_RESULTS_LIMIT = 50;

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

export function limitSearchResults<T>(
  items: readonly T[],
  limit = SEARCH_RESULTS_LIMIT,
): T[] {
  return items.slice(0, Math.max(0, limit));
}

export function searchResultBudgets(
  counts: readonly number[],
  limit = SEARCH_RESULTS_LIMIT,
): number[] {
  let remaining = Math.max(0, limit);
  return counts.map((count) => {
    const budget = Math.min(Math.max(0, count), remaining);
    remaining -= budget;
    return budget;
  });
}
