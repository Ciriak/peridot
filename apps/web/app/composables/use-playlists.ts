import { useI18n } from "#imports";
import type {
  AddPlaylistItemRequest,
  PlaylistDetailResponse,
  PlaylistListResponse,
} from "@peridot/contracts";
import {
  useInfiniteQuery,
  useQuery,
  useQueryClient,
} from "@tanstack/vue-query";
import type { QueryKey } from "@tanstack/vue-query";
import { computed, toValue, type MaybeRefOrGetter } from "vue";
import {
  addPlaylistItem,
  createPlaylist,
  deletePlaylist,
  fetchPlaylist,
  isAuthenticationRedirectError,
  listPlaylists,
  removePlaylistItem,
  reorderPlaylistItems,
  updatePlaylist,
} from "../lib/peridot-client";
import {
  persistQueryKey,
  removePersistedQueries,
} from "../lib/query-persister";
import { queryKeys } from "../lib/query-keys";
import {
  blockingQueryLoading,
  visibleQueryError,
} from "../lib/query-view-state";
import { useLocalizedMessage } from "./use-localized-message";
import { useQueryScope } from "./use-query-scope";
import { useSession } from "./use-session";

export function usePlaylistList(
  limit = 50,
  trackId?: MaybeRefOrGetter<string | null>,
) {
  const { scope } = useQueryScope();
  const { token } = useSession();
  const { errorMessage } = useLocalizedMessage();
  const targetTrackId = computed(() => toValue(trackId) || undefined);
  const queryKey = computed<QueryKey>(() =>
    scope.value
      ? queryKeys.playlists(scope.value, {
          limit,
          trackId: targetTrackId.value,
        })
      : [
          "peridot",
          "unscoped",
          "playlists",
          { limit, trackId: targetTrackId.value },
        ],
  );
  const query = useInfiniteQuery<
    PlaylistListResponse,
    Error,
    { pages: PlaylistListResponse[]; pageParams: number[] },
    QueryKey,
    number
  >({
    queryKey,
    queryFn: ({ pageParam }) => {
      if (!scope.value || !token.value) {
        throw new Error("Peridot query scope is unavailable.");
      }
      return listPlaylists(scope.value.serverAddress, token.value, {
        limit,
        offset: pageParam,
        trackId: targetTrackId.value,
      });
    },
    initialPageParam: 0,
    getNextPageParam: (lastPage) => lastPage.nextOffset ?? undefined,
    enabled: computed(() => Boolean(scope.value && token.value)),
    meta: { persist: true },
  });
  const pages = computed(() => query.data.value?.pages ?? []);
  const items = computed(() => pages.value.flatMap((page) => page.items));
  const totalCount = computed(
    () => pages.value[0]?.totalCount ?? items.value.length,
  );
  const loaded = computed(() => query.data.value !== undefined);
  const loading = computed(() =>
    blockingQueryLoading(loaded.value, query.isPending.value),
  );
  const loadingMore = computed(() => query.isFetchingNextPage.value);
  const hasMore = computed(() => Boolean(query.hasNextPage.value));
  const error = computed(() => {
    const reason = query.error.value;
    if (!reason || isAuthenticationRedirectError(reason)) return null;
    return visibleQueryError(
      loaded.value,
      errorMessage(reason, "error.playlistsLoad"),
    );
  });

  async function load(force = false) {
    if (force || !query.data.value) await query.refetch();
  }

  async function loadMore() {
    if (query.hasNextPage.value && !query.isFetchingNextPage.value) {
      await query.fetchNextPage();
    }
  }

  return {
    items,
    totalCount,
    loaded,
    loading,
    loadingMore,
    hasMore,
    error,
    queryKey,
    load,
    loadMore,
  };
}

export function usePlaylist(playlistId: MaybeRefOrGetter<string | null>) {
  const { scope } = useQueryScope();
  const { token } = useSession();
  const { errorMessage } = useLocalizedMessage();
  const id = computed(() => toValue(playlistId));
  const queryKey = computed<QueryKey>(() =>
    scope.value && id.value
      ? queryKeys.playlist(scope.value, id.value)
      : ["peridot", "unscoped", "playlists", "missing"],
  );
  const query = useQuery<PlaylistDetailResponse, Error>({
    queryKey,
    queryFn: () => {
      if (!scope.value || !token.value || !id.value) {
        throw new Error("Peridot query scope is unavailable.");
      }
      return fetchPlaylist(scope.value.serverAddress, token.value, id.value);
    },
    enabled: computed(() => Boolean(scope.value && token.value && id.value)),
    meta: { persist: true },
  });
  const playlist = computed(() => query.data.value ?? null);
  const loaded = computed(() => query.data.value !== undefined);
  const loading = computed(() =>
    blockingQueryLoading(loaded.value, query.isPending.value),
  );
  const error = computed(() => {
    const reason = query.error.value;
    if (!reason || isAuthenticationRedirectError(reason)) return null;
    return visibleQueryError(
      loaded.value,
      errorMessage(reason, "error.playlistLoad"),
    );
  });

  async function load(force = false) {
    if (!id.value) return;
    if (force || !query.data.value) await query.refetch();
  }

  return { playlist, loaded, loading, error, queryKey, load };
}

export function usePlaylistActions() {
  const { t } = useI18n();
  const { scope } = useQueryScope();
  const { token } = useSession();
  const { errorMessage } = useLocalizedMessage();
  const queryClient = useQueryClient();

  function requireConnection() {
    if (!scope.value || !token.value) {
      throw new Error(t("error.connectServer"));
    }
    return { scope: scope.value, token: token.value };
  }

  async function persistDetail(detail: PlaylistDetailResponse) {
    const current = requireConnection();
    const key = queryKeys.playlist(current.scope, detail.id);
    queryClient.setQueryData(key, detail);
    await persistQueryKey(key);
  }

  async function invalidateLists() {
    if (!scope.value) return;
    await queryClient.invalidateQueries({
      queryKey: queryKeys.playlistsRoot(scope.value),
    });
  }

  async function create(name: string) {
    const current = requireConnection();
    const detail = await createPlaylist(
      current.scope.serverAddress,
      current.token,
      { name },
    );
    await persistDetail(detail);
    await invalidateLists();
    return detail;
  }

  async function rename(playlistId: string, name: string) {
    const current = requireConnection();
    const detail = await updatePlaylist(
      current.scope.serverAddress,
      current.token,
      playlistId,
      { name },
    );
    await persistDetail(detail);
    await invalidateLists();
    return detail;
  }

  async function remove(playlistId: string) {
    const current = requireConnection();
    await deletePlaylist(
      current.scope.serverAddress,
      current.token,
      playlistId,
    );
    const detailKey = queryKeys.playlist(current.scope, playlistId);
    queryClient.removeQueries({ queryKey: detailKey });
    await removePersistedQueries(detailKey);
    await invalidateLists();
  }

  async function add(playlistId: string, request: AddPlaylistItemRequest) {
    const current = requireConnection();
    const result = await addPlaylistItem(
      current.scope.serverAddress,
      current.token,
      playlistId,
      request,
    );
    await persistDetail(result.playlist);
    await invalidateLists();
    return result;
  }

  async function removeItem(playlistId: string, itemId: string) {
    const current = requireConnection();
    await removePlaylistItem(
      current.scope.serverAddress,
      current.token,
      playlistId,
      itemId,
    );
    await queryClient.invalidateQueries({
      queryKey: queryKeys.playlist(current.scope, playlistId),
    });
    await invalidateLists();
  }

  async function reorder(playlistId: string, itemIds: string[]) {
    const current = requireConnection();
    const detail = await reorderPlaylistItems(
      current.scope.serverAddress,
      current.token,
      playlistId,
      { itemIds },
    );
    await persistDetail(detail);
    await invalidateLists();
    return detail;
  }

  function messageFor(reason: unknown, fallback: string) {
    return errorMessage(reason, fallback);
  }

  return {
    create,
    rename,
    remove,
    add,
    removeItem,
    reorder,
    messageFor,
    invalidateLists,
  };
}
