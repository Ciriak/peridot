import type {
  AlbumSummaryResponse,
  ArtistSummaryResponse,
  AudiobookSummaryResponse,
  PlaylistSummaryResponse,
  PodcastSummaryResponse,
} from "@peridot/contracts";
import { useQueries, useQueryClient, type QueryKey } from "@tanstack/vue-query";
import { computed, ref, toValue, watch, type MaybeRefOrGetter } from "vue";
import {
  offlineAlbums,
  offlineArtists,
  offlineAudiobooks,
  offlinePodcasts,
  type OfflineCatalogSnapshot,
} from "../lib/offline-catalog";
import {
  isAuthenticationRedirectError,
  listAlbums,
  listArtists,
  listAudiobooks,
  listPlaylists,
  listPodcasts,
  type CardListOptions,
  type PlaylistListOptions,
} from "../lib/peridot-client";
import {
  PERIDOT_QUERY_ROOT,
  queryKeys,
  type PeridotQueryScope,
} from "../lib/query-keys";
import { blockingQueryLoading } from "../lib/query-view-state";
import {
  VIRTUAL_CATALOG_PAGE_SIZE,
  virtualCatalogPageOffsets,
} from "../lib/virtual-albums";
import { useLocalizedMessage } from "./use-localized-message";
import { useOfflineCatalog } from "./use-offline-catalog";
import { useQueryScope } from "./use-query-scope";
import { useServerConnection } from "./use-server-connection";
import { useSession } from "./use-session";

interface VirtualCatalogPage<T> {
  items: T[];
  totalCount: number;
}

interface VirtualCatalogPageRequest<T> {
  queryKey: QueryKey;
  fetchPage: () => Promise<VirtualCatalogPage<T>>;
  enabled: boolean;
}

function useVirtualCatalogPages<T>(options: {
  pageSize: number;
  optionsKey?: MaybeRefOrGetter<unknown>;
  requestPage: (offset: number) => VirtualCatalogPageRequest<T>;
  offlineItems: () => readonly T[] | null;
  errorKey: string;
}) {
  const queryClient = useQueryClient();
  const { errorMessage } = useLocalizedMessage();
  const visibleStart = ref(0);
  const visibleEnd = ref(options.pageSize - 1);
  const offlineItems = computed(() => options.offlineItems());
  const usingOffline = computed(() => offlineItems.value !== null);
  const activeOffsets = computed(() => [
    0,
    ...virtualCatalogPageOffsets(visibleStart.value, visibleEnd.value).filter(
      (offset) => offset !== 0,
    ),
  ]);
  const pageRequests = computed(() =>
    activeOffsets.value.map((offset) => options.requestPage(offset)),
  );
  const pageResults = useQueries({
    queries: computed(() =>
      pageRequests.value.map((request) => ({
        queryKey: request.queryKey,
        queryFn: request.fetchPage,
        enabled: request.enabled && !usingOffline.value,
        retry: 2,
        staleTime: 30_000,
        gcTime: 60_000,
        meta: { persist: true },
      })),
    ),
  });

  watch(
    activeOffsets,
    (nextOffsets, previousOffsets = []) => {
      const retained = new Set(nextOffsets);
      for (const offset of previousOffsets) {
        if (offset === 0 || retained.has(offset)) continue;
        queryClient.removeQueries({
          queryKey: options.requestPage(offset).queryKey,
          exact: true,
        });
      }
    },
    { flush: "post" },
  );

  watch(
    () =>
      options.optionsKey === undefined ? null : toValue(options.optionsKey),
    () => {
      visibleStart.value = 0;
      visibleEnd.value = options.pageSize - 1;
    },
    { flush: "sync" },
  );

  const firstPageOffset = computed(() => activeOffsets.value.indexOf(0));
  const firstPageResult = computed(
    () => pageResults.value[firstPageOffset.value],
  );
  const firstPage = computed(() => firstPageResult.value?.data);
  const pageItems = computed(() =>
    activeOffsets.value.flatMap((offset, index) => {
      const page = pageResults.value[index]?.data;
      return page
        ? page.items.map((item, itemIndex) => ({
            item,
            index: offset + itemIndex,
          }))
        : [];
    }),
  );
  const totalCount = computed(
    () => offlineItems.value?.length ?? firstPage.value?.totalCount ?? 0,
  );
  const items = computed<T[]>(() => {
    if (offlineItems.value) return [...offlineItems.value];
    const sparse = new Array<T>(totalCount.value);
    for (const pageItem of pageItems.value) {
      sparse[pageItem.index] = pageItem.item;
    }
    return sparse;
  });
  const loadedCount = computed(() =>
    usingOffline.value ? totalCount.value : pageItems.value.length,
  );
  const loaded = computed(
    () => usingOffline.value || firstPage.value !== undefined,
  );
  const loading = computed(() =>
    usingOffline.value
      ? false
      : blockingQueryLoading(
          loaded.value,
          firstPageResult.value?.isPending ?? false,
        ),
  );
  const loadingMore = computed(
    () =>
      !usingOffline.value &&
      pageResults.value.some(
        (result, index) =>
          activeOffsets.value[index] !== 0 && result.isFetching,
      ),
  );
  const error = computed(() => {
    if (usingOffline.value) return null;
    const reason = pageResults.value
      .map((result) => result.error)
      .find((candidate) => candidate !== null);
    if (!reason || isAuthenticationRedirectError(reason)) return null;
    return errorMessage(reason, options.errorKey);
  });
  const hasMore = computed(() => loadedCount.value < totalCount.value);

  function setVisibleRange(startIndex: number, endIndex: number) {
    const maximum = Math.max(0, totalCount.value - 1);
    visibleStart.value = Math.max(0, Math.min(startIndex, maximum));
    visibleEnd.value = Math.max(
      visibleStart.value,
      Math.min(endIndex, maximum),
    );
  }

  async function load(force = false) {
    if (usingOffline.value) return;
    if (!force && firstPage.value !== undefined) return;
    await Promise.all(pageResults.value.map((result) => result.refetch()));
  }

  return {
    items,
    loading,
    loadingMore,
    loaded,
    error,
    totalCount,
    loadedCount,
    hasMore,
    load,
    setVisibleRange,
    reload: () => load(true),
  };
}

function useVirtualCardCatalog<T>(config: {
  options: () => CardListOptions;
  queryKey: (scope: PeridotQueryScope, options: CardListOptions) => QueryKey;
  fetchPage: (
    serverAddress: string,
    token: string,
    options: CardListOptions,
  ) => Promise<VirtualCatalogPage<T>>;
  offlineItems: (
    snapshot: OfflineCatalogSnapshot,
    options: CardListOptions,
  ) => T[];
}) {
  const { scope } = useQueryScope();
  const { token } = useSession();
  const { status } = useServerConnection();
  const { snapshot: offlineSnapshot } = useOfflineCatalog();
  const optionKey = computed(() => config.options());

  return useVirtualCatalogPages<T>({
    pageSize: VIRTUAL_CATALOG_PAGE_SIZE,
    optionsKey: optionKey,
    errorKey: "error.catalogLoad",
    requestPage: (offset) => {
      const pageOptions = {
        ...optionKey.value,
        offset,
        limit: VIRTUAL_CATALOG_PAGE_SIZE,
      } satisfies CardListOptions;
      return {
        queryKey: scope.value
          ? config.queryKey(scope.value, pageOptions)
          : [PERIDOT_QUERY_ROOT, "unscoped", "catalog", "cards", pageOptions],
        enabled: Boolean(scope.value && token.value),
        fetchPage: () => {
          const scopeValue = scope.value;
          const tokenValue = token.value;
          if (!scopeValue || !tokenValue) {
            throw new Error("Peridot query scope is unavailable.");
          }
          return config.fetchPage(
            scopeValue.serverAddress,
            tokenValue,
            pageOptions,
          );
        },
      };
    },
    offlineItems: () => {
      const snapshot = offlineSnapshot.value;
      if (status.value === "connected" || !snapshot) return null;
      return config.offlineItems(snapshot, optionKey.value);
    },
  });
}

export function useVirtualAlbums(options: () => CardListOptions = () => ({})) {
  return useVirtualCardCatalog<AlbumSummaryResponse>({
    options,
    queryKey: queryKeys.albums,
    fetchPage: listAlbums,
    offlineItems: offlineAlbums,
  });
}

export function useVirtualArtists(options: () => CardListOptions = () => ({})) {
  return useVirtualCardCatalog<ArtistSummaryResponse>({
    options,
    queryKey: queryKeys.artists,
    fetchPage: listArtists,
    offlineItems: offlineArtists,
  });
}

export function useVirtualAudiobooks(
  options: () => CardListOptions = () => ({}),
) {
  return useVirtualCardCatalog<AudiobookSummaryResponse>({
    options,
    queryKey: queryKeys.audiobooks,
    fetchPage: listAudiobooks,
    offlineItems: offlineAudiobooks,
  });
}

export function useVirtualPodcasts(
  options: () => CardListOptions = () => ({}),
) {
  return useVirtualCardCatalog<PodcastSummaryResponse>({
    options,
    queryKey: queryKeys.podcasts,
    fetchPage: listPodcasts,
    offlineItems: offlinePodcasts,
  });
}

export function useVirtualPlaylists(
  options: () => PlaylistListOptions = () => ({}),
) {
  const { scope } = useQueryScope();
  const { token } = useSession();
  const optionKey = computed(() => options());

  return useVirtualCatalogPages<PlaylistSummaryResponse>({
    pageSize: VIRTUAL_CATALOG_PAGE_SIZE,
    optionsKey: optionKey,
    errorKey: "error.playlistsLoad",
    requestPage: (offset) => {
      const pageOptions = {
        ...optionKey.value,
        offset,
        limit: VIRTUAL_CATALOG_PAGE_SIZE,
      } satisfies PlaylistListOptions;
      return {
        queryKey: scope.value
          ? queryKeys.playlists(scope.value, pageOptions)
          : [PERIDOT_QUERY_ROOT, "unscoped", "playlists", pageOptions],
        enabled: Boolean(scope.value && token.value),
        fetchPage: () => {
          const scopeValue = scope.value;
          const tokenValue = token.value;
          if (!scopeValue || !tokenValue) {
            throw new Error("Peridot query scope is unavailable.");
          }
          return listPlaylists(
            scopeValue.serverAddress,
            tokenValue,
            pageOptions,
          );
        },
      };
    },
    offlineItems: () => null,
  });
}
