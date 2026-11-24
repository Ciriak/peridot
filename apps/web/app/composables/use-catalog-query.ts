import { useState } from "#imports";
import type {
  AlbumSummaryResponse,
  ArtistSummaryResponse,
  AudiobookSummaryResponse,
  PodcastSummaryResponse,
  RealtimeCatalogChangedEvent,
  MediaResponse,
} from "@peridot/contracts";
import {
  useInfiniteQuery,
  useQueryClient,
  type InfiniteData,
  type QueryKey,
} from "@tanstack/vue-query";
import { computed, ref, watch } from "vue";
import {
  catalogCursorSettler,
  isStaleCatalogCursor,
  recoverStaleCatalogCursor,
} from "../lib/catalog-cursor-recovery";
import {
  isAuthenticationRedirectError,
  listAlbums,
  listArtists,
  listAudiobooks,
  listPodcasts,
  listTracks,
  type CardListOptions,
  type TrackListOptions,
} from "../lib/peridot-client";
import { removesOfflineCatalogSnapshot } from "../lib/catalog-revision-policy";
import { clearOfflineCatalog } from "../lib/offline-catalog";
import {
  offlineAlbums,
  offlineArtists,
  offlineAudiobooks,
  offlinePodcasts,
  offlineTracks,
  type OfflineCatalogSnapshot,
} from "../lib/offline-catalog";
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
import {
  setOfflineCatalogSnapshot,
  setOfflineCatalogSyncStatus,
} from "./use-offline-catalog";
import { useOfflineCatalog } from "./use-offline-catalog";
import { useQueryScope } from "./use-query-scope";
import { useServerConnection } from "./use-server-connection";
import { useSession } from "./use-session";

export const CATALOG_INVALIDATION_THROTTLE_MS = 10_000;
let pendingCatalogInvalidation: (() => void) | null = null;
let catalogInvalidationTimer: ReturnType<typeof setTimeout> | undefined;
let lastCatalogInvalidationAt = 0;

export function useCatalogRevision() {
  const revision = useState("catalog-revision", () => 0);
  const resyncVersion = useState("catalog-resync-version", () => 0);
  const queryClient = useQueryClient();
  const { scope } = useQueryScope();

  function invalidateNow() {
    revision.value += 1;
    if (!scope.value) return;
    void queryClient.invalidateQueries({
      queryKey: [...peridotScopeKey(scope.value), "catalog"],
    });
    void queryClient.invalidateQueries({
      queryKey: queryKeys.playlistsRoot(scope.value),
    });
  }

  function invalidate() {
    if (catalogInvalidationTimer) {
      clearTimeout(catalogInvalidationTimer);
      catalogInvalidationTimer = undefined;
    }
    pendingCatalogInvalidation = null;
    lastCatalogInvalidationAt = Date.now();
    invalidateNow();
  }

  function scheduleInvalidation() {
    pendingCatalogInvalidation = invalidateNow;
    if (catalogInvalidationTimer) return;
    const remaining =
      CATALOG_INVALIDATION_THROTTLE_MS -
      (Date.now() - lastCatalogInvalidationAt);
    catalogInvalidationTimer = setTimeout(
      () => {
        catalogInvalidationTimer = undefined;
        const callback = pendingCatalogInvalidation;
        pendingCatalogInvalidation = null;
        if (!callback) return;
        lastCatalogInvalidationAt = Date.now();
        callback();
      },
      Math.max(0, remaining),
    );
  }

  async function resetOfflineCatalog() {
    await clearOfflineCatalog().catch(() => undefined);
    setOfflineCatalogSnapshot(null);
    setOfflineCatalogSyncStatus("idle", scope.value);
  }

  function applyRevision(
    value: number,
    reason: RealtimeCatalogChangedEvent["reason"],
  ) {
    catalogCursorSettler.markChanged();
    revision.value = Math.max(revision.value, value);
    if (removesOfflineCatalogSnapshot(reason)) {
      void resetOfflineCatalog();
      invalidate();
    } else {
      scheduleInvalidation();
    }
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
    resetOfflineCatalog,
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

interface CatalogPage<T> {
  items: T[];
  nextCursor: string | null;
  totalCount?: number;
  catalogRevision: number;
}

function useCatalogInfiniteQuery<T>(options: {
  queryKey: () => QueryKey;
  fetchPage: (
    cursor: string | null,
    scope: PeridotQueryScope,
    token: string,
  ) => Promise<CatalogPage<T>>;
  itemKey: (item: T) => string;
  offlineItems: (snapshot: OfflineCatalogSnapshot) => T[];
}) {
  const { scope } = useQueryScope();
  const { token } = useSession();
  const { status } = useServerConnection();
  const { snapshot: offlineSnapshot } = useOfflineCatalog();
  const { errorMessage } = useLocalizedMessage();
  const queryClient = useQueryClient();
  function fetchPage(pageParam: string | null) {
    if (!scope.value || !token.value) {
      throw new Error("Peridot query scope is unavailable.");
    }
    return options.fetchPage(pageParam, scope.value, token.value);
  }
  const query = useInfiniteQuery<
    CatalogPage<T>,
    Error,
    InfiniteData<CatalogPage<T>, string | null>,
    QueryKey,
    string | null
  >({
    queryKey: computed(() => options.queryKey()),
    queryFn: ({ pageParam }) => fetchPage(pageParam),
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    enabled: computed(() => Boolean(scope.value && token.value)),
    retry: (failureCount, error) =>
      !isStaleCatalogCursor(error) && failureCount < 3,
    meta: { persist: true },
  });
  const recoveringStaleCursor = ref(false);
  let staleRecoveryPromise: Promise<boolean> | null = null;

  function queryFingerprint() {
    return JSON.stringify(options.queryKey());
  }

  function recoverStaleCursor(): Promise<boolean> {
    if (staleRecoveryPromise) return staleRecoveryPromise;
    const recoveryFingerprint = queryFingerprint();
    recoveringStaleCursor.value = true;
    staleRecoveryPromise = recoverStaleCatalogCursor({
      waitForQuiet: catalogCursorSettler.waitForQuiet,
      refetch: async () => {
        if (queryFingerprint() !== recoveryFingerprint) {
          return { error: null };
        }
        try {
          await queryClient.infiniteQuery<
            CatalogPage<T>,
            Error,
            InfiniteData<CatalogPage<T>, string | null>,
            QueryKey,
            string | null
          >({
            queryKey: options.queryKey(),
            queryFn: ({ pageParam }) => fetchPage(pageParam),
            initialPageParam: null,
            getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
            pages: Math.max(1, query.data.value?.pages.length ?? 1),
            staleTime: 0,
            retry: false,
            meta: { persist: true },
          });
          return { error: null };
        } catch (reason) {
          return { error: reason };
        }
      },
    }).finally(() => {
      recoveringStaleCursor.value = false;
      staleRecoveryPromise = null;
    });
    return staleRecoveryPromise;
  }

  watch(
    () => query.error.value,
    (reason) => {
      if (isStaleCatalogCursor(reason)) void recoverStaleCursor();
    },
  );

  const serverItems = computed(() => {
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
  const usingOffline = computed(
    () => status.value !== "connected" && offlineSnapshot.value !== null,
  );
  const items = computed(() =>
    usingOffline.value && offlineSnapshot.value
      ? options.offlineItems(offlineSnapshot.value)
      : serverItems.value,
  );
  const loaded = computed(
    () => usingOffline.value || query.data.value !== undefined,
  );
  const loading = computed(() =>
    usingOffline.value
      ? false
      : blockingQueryLoading(loaded.value, query.isPending.value),
  );
  const loadingMore = computed(
    () =>
      !usingOffline.value &&
      (query.isFetchingNextPage.value || recoveringStaleCursor.value),
  );
  const error = computed(() =>
    usingOffline.value
      ? null
      : isStaleCatalogCursor(query.error.value)
        ? null
        : visibleQueryError(
            loaded.value,
            query.error.value
              ? catalogErrorMessage(query.error.value, errorMessage)
              : null,
          ),
  );
  const nextCursor = computed(
    () => query.data.value?.pages.at(-1)?.nextCursor ?? null,
  );
  const hasMore = computed(
    () => !usingOffline.value && query.hasNextPage.value,
  );
  const totalCount = computed(
    () => query.data.value?.pages[0]?.totalCount ?? items.value.length,
  );

  async function load(force = false) {
    if (!scope.value || !token.value || usingOffline.value) return;
    if (force || !query.data.value) await query.refetch();
  }

  async function loadMore() {
    if (
      usingOffline.value ||
      !query.hasNextPage.value ||
      query.isFetchingNextPage.value
    ) {
      return;
    }
    const result = await query.fetchNextPage();
    if (isStaleCatalogCursor(result.error)) await recoverStaleCursor();
  }

  return {
    items,
    loading,
    loadingMore,
    loaded,
    error,
    nextCursor,
    hasMore,
    totalCount,
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
  const query = useCatalogInfiniteQuery<MediaResponse>({
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
    offlineItems: (snapshot) => offlineTracks(snapshot, optionKey.value),
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
  ) => Promise<CatalogPage<T>>;
  options: () => CardListOptions;
  offlineItems: (
    snapshot: OfflineCatalogSnapshot,
    options: CardListOptions,
  ) => T[];
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
    offlineItems: (snapshot) => config.offlineItems(snapshot, optionKey.value),
  });
}

export function useCatalogAlbumQuery(
  options: () => CardListOptions = () => ({}),
) {
  return useCatalogCardQuery<AlbumSummaryResponse>({
    queryKey: queryKeys.albums,
    fetchPage: listAlbums,
    options,
    offlineItems: offlineAlbums,
  });
}

export function useCatalogArtistQuery(
  options: () => CardListOptions = () => ({}),
) {
  return useCatalogCardQuery<ArtistSummaryResponse>({
    queryKey: queryKeys.artists,
    fetchPage: listArtists,
    options,
    offlineItems: offlineArtists,
  });
}

export function useCatalogAudiobookQuery(
  options: () => CardListOptions = () => ({}),
) {
  return useCatalogCardQuery<AudiobookSummaryResponse>({
    queryKey: queryKeys.audiobooks,
    fetchPage: listAudiobooks,
    options,
    offlineItems: offlineAudiobooks,
  });
}

export function useCatalogPodcastQuery(
  options: () => CardListOptions = () => ({}),
) {
  return useCatalogCardQuery<PodcastSummaryResponse>({
    queryKey: queryKeys.podcasts,
    fetchPage: listPodcasts,
    options,
    offlineItems: offlinePodcasts,
  });
}
