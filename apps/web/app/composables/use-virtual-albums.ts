import type { AlbumSummaryResponse } from "@peridot/contracts";
import { useQueries, useQueryClient, type QueryKey } from "@tanstack/vue-query";
import { computed, ref, watch } from "vue";
import { offlineAlbums } from "../lib/offline-catalog";
import {
  isAuthenticationRedirectError,
  listAlbums,
  type CardListOptions,
} from "../lib/peridot-client";
import { PERIDOT_QUERY_ROOT, queryKeys } from "../lib/query-keys";
import { blockingQueryLoading } from "../lib/query-view-state";
import {
  VIRTUAL_ALBUM_PAGE_SIZE,
  virtualAlbumPageOffsets,
} from "../lib/virtual-albums";
import { useLocalizedMessage } from "./use-localized-message";
import { useOfflineCatalog } from "./use-offline-catalog";
import { useQueryScope } from "./use-query-scope";
import { useServerConnection } from "./use-server-connection";
import { useSession } from "./use-session";

export function useVirtualAlbums(options: () => CardListOptions = () => ({})) {
  const { scope } = useQueryScope();
  const { token } = useSession();
  const { status } = useServerConnection();
  const { snapshot: offlineSnapshot } = useOfflineCatalog();
  const { errorMessage } = useLocalizedMessage();
  const queryClient = useQueryClient();
  const optionKey = computed(() => options());
  const visibleStart = ref(0);
  const visibleEnd = ref(VIRTUAL_ALBUM_PAGE_SIZE - 1);
  const usingOffline = computed(
    () => status.value !== "connected" && offlineSnapshot.value !== null,
  );

  function pageQueryKey(offset: number): QueryKey {
    const pageOptions = {
      ...optionKey.value,
      offset,
      limit: VIRTUAL_ALBUM_PAGE_SIZE,
    } satisfies CardListOptions;
    const scopeValue = scope.value;
    return scopeValue
      ? queryKeys.albums(scopeValue, pageOptions)
      : [PERIDOT_QUERY_ROOT, "unscoped", "catalog", "albums", pageOptions];
  }

  const activeOffsets = computed(() => {
    return [
      0,
      ...virtualAlbumPageOffsets(visibleStart.value, visibleEnd.value).filter(
        (offset) => offset !== 0,
      ),
    ];
  });

  const pageResults = useQueries({
    queries: computed(() =>
      activeOffsets.value.map((offset) => ({
        queryKey: pageQueryKey(offset),
        queryFn: () => {
          const scopeValue = scope.value;
          const tokenValue = token.value;
          if (!scopeValue || !tokenValue) {
            throw new Error("Peridot query scope is unavailable.");
          }
          return listAlbums(scopeValue.serverAddress, tokenValue, {
            ...optionKey.value,
            offset,
            limit: VIRTUAL_ALBUM_PAGE_SIZE,
          });
        },
        enabled: Boolean(scope.value && token.value && !usingOffline.value),
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
          queryKey: pageQueryKey(offset),
          exact: true,
        });
      }
    },
    { flush: "post" },
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
    () =>
      (usingOffline.value && offlineSnapshot.value
        ? offlineAlbums(offlineSnapshot.value, optionKey.value).length
        : firstPage.value?.totalCount) ?? 0,
  );
  const items = computed<AlbumSummaryResponse[]>(() => {
    if (usingOffline.value && offlineSnapshot.value) {
      return offlineAlbums(offlineSnapshot.value, optionKey.value);
    }
    const sparse = new Array<AlbumSummaryResponse>(totalCount.value);
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
    return errorMessage(reason, "error.catalogLoad");
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
