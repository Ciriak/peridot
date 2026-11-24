import type { LocationQuery, LocationQueryRaw } from "vue-router";

export const SEARCH_HISTORY_DEBOUNCE_MS = 250;
export const SEARCH_QUERY_PARAM = "q";
export const SEARCH_TAB_QUERY_PARAM = "tab";

export type SearchTab = "library" | "external";

export function normalizeSearchQuery(value: unknown): string {
  const candidate = Array.isArray(value) ? value[0] : value;
  return typeof candidate === "string" ? candidate.trim() : "";
}

export function normalizeSearchTab(value: unknown): SearchTab {
  const candidate = Array.isArray(value) ? value[0] : value;
  return candidate === "external" ? "external" : "library";
}

export function buildSearchTabHistoryLocation(
  query: LocationQuery,
  tab: SearchTab,
): { path: string; query: LocationQueryRaw } {
  const nextQuery: LocationQueryRaw = { ...query };
  if (tab === "external") {
    nextQuery[SEARCH_TAB_QUERY_PARAM] = "external";
  } else {
    delete nextQuery[SEARCH_TAB_QUERY_PARAM];
  }
  return { path: "/search", query: nextQuery };
}

export function buildSearchHistoryLocation(
  query: LocationQuery,
  value: string,
): { path: string; query: LocationQueryRaw } {
  const normalized = normalizeSearchQuery(value);
  const nextQuery: LocationQueryRaw = { ...query };

  if (normalized) {
    nextQuery[SEARCH_QUERY_PARAM] = normalized;
  } else {
    delete nextQuery[SEARCH_QUERY_PARAM];
  }

  return { path: "/search", query: nextQuery };
}
