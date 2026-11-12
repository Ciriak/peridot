import { useState } from "#imports";
import type {
  AlbumSummaryResponse,
  ArtistSummaryResponse,
  TrackResponse,
} from "@peridot/contracts";
import {
  useInfiniteQuery,
  useQueryClient,
  type InfiniteData,
  type QueryKey,
} from "@tanstack/vue-query";
import { computed } from "vue";
import {
  isAuthenticationRedirectError,
  listAlbums,
  listArtists,
  listTracks,
  type CardListOptions,
  type TrackListOptions,
} from "../lib/peridot-client";
import {
  PERIDOT_QUERY_ROOT,
  peridotScopeKey,
  queryKeys,
  type PeridotQueryScope,
} from "../lib/query-keys";
import {
  blockingQueryLoading,
  visibleQueryError,
} from "../lib/query-view-state";
import { useLocalizedMessage } from "./use-localized-message";
import { useQueryScope } from "./use-query-scope";
import { useSession } from "./use-session";

export function useCatalogRevision() {
  const revision = useState("catalog-revision", () => 0);
  const resyncVersion = useState("catalog-resync-version", () => 0);
  const queryClient = useQueryClient();
  const { scope } = useQueryScope();

  function invalidate() {
    revision.value += 1;
    if (!scope.value) return;
    void queryClient.invalidateQueries({
      queryKey: [...peridotScopeKey(scope.value), "catalog"],
    });
  }

  function applyRevision(value: number) {
    revision.value = Math.max(revision.value, value);
    invalidate();
  }

  function requestResync() {
    resyncVersion.value += 1;
    invalidate();
  }

  function reset() {
    revision.value = 0;
    resyncVersion.value += 1;
  }

  return {
    revision,
    resyncVersion,
    applyRevision,
    requestResync,
    invalidate,
    reset,
  };
}

function catalogErrorMessage(
  reason: unknown,
  errorMessage: (reason: unknown, fallbackKey: string) => string | null,
) {
  return isAuthenticationRedirectError(reason)
    ? null
    : errorMessage(reason, "error.catalogLoad");
}

function useCatalogInfiniteQuery<T>(options: {
  queryKey: () => QueryKey;
  fetchPage: (
    cursor: string | null,
    scope: PeridotQueryScope,
    token: string,
  ) => Promise<{
    items: T[];
    nextCursor: string | null;
    catalogRevision: number;
  }>;
  itemKey: (item: T) => string;
}) {
  const { scope } = useQueryScope();
  const { token } = useSession();
  const { errorMessage } = useLocalizedMessage();
  const query = useInfiniteQuery<
    {
      items: T[];
      nextCursor: string | null;
      catalogRevision: number;
    },
    Error,
    InfiniteData<
      { items: T[]; nextCursor: string | null; catalogRevision: number },
      string | null
    >,
    QueryKey,
    string | null
  >({
    queryKey: computed(() => options.queryKey()),
    queryFn: ({ pageParam }) => {
      if (!scope.value || !token.value) {
        throw new Error("Peridot query scope is unavailable.");
      }
      return options.fetchPage(pageParam, scope.value, token.value);
    },
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    enabled: computed(() => Boolean(scope.value && token.value)),
    meta: { persist: true },
  });

  const items = computed(() => {
    const seen = new Set<string>();
    return (query.data.value?.pages ?? []).flatMap((page) =>
      page.items.filter((item) => {
        const key = options.itemKey(item);
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      }),
    );
  });
  const loaded = computed(() => query.data.value !== undefined);
  const loading = computed(() =>
    blockingQueryLoading(loaded.value, query.isPending.value),
  );
  const loadingMore = computed(() => query.isFetchingNextPage.value);
  const error = computed(() =>
    visibleQueryError(
      loaded.value,
      query.error.value
        ? catalogErrorMessage(query.error.value, errorMessage)
        : null,
    ),
  );
  const nextCursor = computed(
    () => query.data.value?.pages.at(-1)?.nextCursor ?? null,
  );
  const hasMore = computed(() => query.hasNextPage.value);

  async function load(force = false) {
    if (!scope.value || !token.value) return;
    if (force || !query.data.value) await query.refetch();
  }

  async function loadMore() {
    if (!query.hasNextPage.value || query.isFetchingNextPage.value) return;
    await query.fetchNextPage();
  }

  return {
    items,
    loading,
    loadingMore,
    loaded,
    error,
    nextCursor,
    hasMore,
    load,
    loadMore,
    reload: () => load(true),
  };
}

export function useCatalogTrackQuery(
  options: () => TrackListOptions = () => ({}),
) {
  const { scope } = useQueryScope();
  const optionKey = computed(() => options());
  const query = useCatalogInfiniteQuery<TrackResponse>({
    queryKey: () => {
      const scopeValue = scope.value;
      return scopeValue
        ? queryKeys.tracks(scopeValue, optionKey.value)
        : [
            PERIDOT_QUERY_ROOT,
            "unscoped",
            "catalog",
            "tracks",
            optionKey.value,
          ];
    },
    fetchPage: (cursor, scopeValue, token) =>
      listTracks(scopeValue.serverAddress, token, {
        ...optionKey.value,
        ...(cursor ? { cursor } : {}),
      }),
    itemKey: (track) => track.id,
  });
  return { ...query, tracks: query.items };
}

function useCatalogCardQuery<T extends { id: string }>(config: {
  queryKey: (
    scope: PeridotQueryScope,
    listOptions: CardListOptions,
  ) => QueryKey;
  fetchPage: (
    address: string,
    token: string,
    listOptions: CardListOptions,
  ) => Promise<{
    items: T[];
    nextCursor: string | null;
    catalogRevision: number;
  }>;
  options: () => CardListOptions;
}) {
  const { scope } = useQueryScope();
  const optionKey = computed(() => config.options());
  return useCatalogInfiniteQuery<T>({
    queryKey: () => {
      const scopeValue = scope.value;
      return scopeValue
        ? config.queryKey(scopeValue, optionKey.value)
        : [PERIDOT_QUERY_ROOT, "unscoped", "catalog", optionKey.value];
    },
    fetchPage: (cursor, scopeValue, token) =>
      config.fetchPage(scopeValue.serverAddress, token, {
        ...optionKey.value,
        ...(cursor ? { cursor } : {}),
      }),
    itemKey: (item) => item.id,
  });
}

export function useCatalogAlbumQuery(
  options: () => CardListOptions = () => ({}),
) {
  return useCatalogCardQuery<AlbumSummaryResponse>({
    queryKey: queryKeys.albums,
    fetchPage: listAlbums,
    options,
  });
}

export function useCatalogArtistQuery(
  options: () => CardListOptions = () => ({}),
) {
  return useCatalogCardQuery<ArtistSummaryResponse>({
    queryKey: queryKeys.artists,
    fetchPage: listArtists,
    options,
  });
}
