import type {
  LogEntryResponse,
  LogListResponse,
  ServerSettingsResponse,
  TaskListResponse,
  UpdateServerSettingsRequest,
  UpdateStatusResponse,
} from "@peridot/contracts";
import {
  useInfiniteQuery,
  useQuery,
  useQueryClient,
  type InfiniteData,
} from "@tanstack/vue-query";
import { computed } from "vue";
import {
  checkForUpdates,
  fetchLogs,
  fetchServerSettings,
  fetchUpdateStatus,
  isAuthenticationRedirectError,
  listDirectories,
  listMetadataProviderDefinitions,
  listMetadataProviders,
  listPlugins,
  listSources,
  listTasks,
  listUsers,
  updateServerSettings,
} from "../lib/peridot-client";
import { removeSourceFromQueryCache } from "../lib/optimistic-source-removal";
import { queryKeys } from "../lib/query-keys";
import {
  blockingQueryLoading,
  visibleQueryError,
} from "../lib/query-view-state";
import { useLocalizedMessage } from "./use-localized-message";
import { useQueryScope } from "./use-query-scope";
import { useSession } from "./use-session";
import { useUser } from "./use-user";

function localizedQueryError(
  reason: unknown,
  errorMessage: (reason: unknown, fallbackKey: string) => string | null,
  fallbackKey: string,
) {
  return isAuthenticationRedirectError(reason)
    ? null
    : errorMessage(reason, fallbackKey);
}

export function useServerSettingsQuery() {
  const { scope } = useQueryScope();
  const { token } = useSession();
  const { user } = useUser();
  const { errorMessage } = useLocalizedMessage();
  const queryClient = useQueryClient();
  const enabled = computed(() =>
    Boolean(scope.value && token.value && user.value?.role === "admin"),
  );
  const query = useQuery({
    queryKey: computed(() =>
      scope.value
        ? queryKeys.serverSettings(scope.value)
        : ["peridot", "unscoped", "admin", "server"],
    ),
    queryFn: () => {
      if (!scope.value || !token.value) {
        throw new Error("Peridot query scope is unavailable.");
      }
      return fetchServerSettings(scope.value.serverAddress, token.value);
    },
    enabled,
    meta: { persist: true },
  });
  const settings = computed(() => query.data.value);
  const loaded = computed(() => settings.value !== undefined);
  return {
    settings,
    loading: computed(() =>
      blockingQueryLoading(loaded.value, query.isPending.value),
    ),
    loaded,
    error: computed(() =>
      visibleQueryError(
        loaded.value,
        query.error.value
          ? localizedQueryError(
              query.error.value,
              errorMessage,
              "settings.server.settingsLoadError",
            )
          : null,
      ),
    ),
    load: async (force = false) => {
      if (force || !settings.value) await query.refetch();
    },
    save: async (input: UpdateServerSettingsRequest) => {
      if (!scope.value || !token.value) {
        throw new Error("Peridot query scope is unavailable.");
      }
      const result: ServerSettingsResponse = await updateServerSettings(
        scope.value.serverAddress,
        token.value,
        input,
      );
      queryClient.setQueryData(queryKeys.serverSettings(scope.value), result);
      return result;
    },
  };
}

export function useUpdatesQuery() {
  const { scope } = useQueryScope();
  const { token } = useSession();
  const { user } = useUser();
  const { errorMessage } = useLocalizedMessage();
  const queryClient = useQueryClient();
  const enabled = computed(() =>
    Boolean(scope.value && token.value && user.value?.role === "admin"),
  );
  const query = useQuery({
    queryKey: computed(() =>
      scope.value
        ? queryKeys.updates(scope.value)
        : ["peridot", "unscoped", "admin", "updates"],
    ),
    queryFn: () => {
      if (!scope.value || !token.value) {
        throw new Error("Peridot query scope is unavailable.");
      }
      return fetchUpdateStatus(scope.value.serverAddress, token.value);
    },
    enabled,
    meta: { persist: false },
  });
  const status = computed(() => query.data.value);
  const loaded = computed(() => status.value !== undefined);
  function scopeCredentials() {
    if (!scope.value || !token.value) {
      throw new Error("Peridot query scope is unavailable.");
    }
    return {
      serverAddress: scope.value.serverAddress,
      userId: scope.value.userId,
      token: token.value,
    };
  }
  return {
    status,
    loading: computed(() =>
      blockingQueryLoading(loaded.value, query.isPending.value),
    ),
    loaded,
    checking: computed(() => query.isFetching.value),
    error: computed(() =>
      visibleQueryError(
        loaded.value,
        query.error.value
          ? localizedQueryError(
              query.error.value,
              errorMessage,
              "settings.server.updatesLoadError",
            )
          : null,
      ),
    ),
    load: async (force = false) => {
      if (force || !status.value) await query.refetch();
    },
    check: async () => {
      const credentials = scopeCredentials();
      const result: UpdateStatusResponse = await checkForUpdates(
        credentials.serverAddress,
        credentials.token,
      );
      queryClient.setQueryData(
        queryKeys.updates({
          serverAddress: credentials.serverAddress,
          userId: credentials.userId,
        }),
        result,
      );
      return result;
    },
  };
}

export function useAdminSourcesQuery() {
  const { scope } = useQueryScope();
  const { token } = useSession();
  const { user } = useUser();
  const { errorMessage } = useLocalizedMessage();
  const queryClient = useQueryClient();
  const enabled = computed(() =>
    Boolean(scope.value && token.value && user.value?.role === "admin"),
  );
  const query = useQuery({
    queryKey: computed(() =>
      scope.value
        ? queryKeys.sources(scope.value)
        : ["peridot", "unscoped", "admin", "sources"],
    ),
    queryFn: () => {
      if (!scope.value || !token.value) {
        throw new Error("Peridot query scope is unavailable.");
      }
      return listSources(scope.value.serverAddress, token.value);
    },
    enabled,
    meta: { persist: true },
  });
  const items = computed(() => query.data.value?.items ?? []);
  const loaded = computed(() => query.data.value !== undefined);
  return {
    items,
    loading: computed(() =>
      blockingQueryLoading(loaded.value, query.isPending.value),
    ),
    loaded,
    error: computed(() =>
      visibleQueryError(
        loaded.value,
        query.error.value
          ? localizedQueryError(
              query.error.value,
              errorMessage,
              "settings.sources.loadError",
            )
          : null,
      ),
    ),
    load: async (force = false) => {
      if (force || !query.data.value) await query.refetch();
    },
    removeOptimistically: (sourceId: string) => {
      if (!scope.value) return null;
      return removeSourceFromQueryCache(
        queryClient,
        queryKeys.sources(scope.value),
        sourceId,
      );
    },
  };
}

export function usePluginsQuery() {
  const { scope } = useQueryScope();
  const { token } = useSession();
  const { user } = useUser();
  const { errorMessage } = useLocalizedMessage();
  const query = useQuery({
    queryKey: computed(() =>
      scope.value
        ? queryKeys.plugins(scope.value)
        : ["peridot", "unscoped", "admin", "plugins"],
    ),
    queryFn: () => {
      if (!scope.value || !token.value) {
        throw new Error("Peridot query scope is unavailable.");
      }
      return listPlugins(scope.value.serverAddress, token.value);
    },
    enabled: computed(() =>
      Boolean(scope.value && token.value && user.value?.role === "admin"),
    ),
    meta: { persist: true },
  });
  const items = computed(() => query.data.value?.items ?? []);
  const loaded = computed(() => query.data.value !== undefined);
  return {
    items,
    loading: computed(() =>
      blockingQueryLoading(loaded.value, query.isPending.value),
    ),
    loaded,
    error: computed(() =>
      visibleQueryError(
        loaded.value,
        query.error.value
          ? localizedQueryError(
              query.error.value,
              errorMessage,
              "settings.plugins.loadError",
            )
          : null,
      ),
    ),
    load: async (force = false) => {
      if (force || !query.data.value) await query.refetch();
    },
    refresh: async () => {
      await query.refetch();
    },
  };
}

export function useAdminUsersQuery() {
  const { scope } = useQueryScope();
  const { token } = useSession();
  const { errorMessage } = useLocalizedMessage();
  const query = useQuery({
    queryKey: computed(() =>
      scope.value
        ? queryKeys.users(scope.value)
        : ["peridot", "unscoped", "admin", "users"],
    ),
    queryFn: () => {
      if (!scope.value || !token.value) {
        throw new Error("Peridot query scope is unavailable.");
      }
      return listUsers(scope.value.serverAddress, token.value);
    },
    enabled: computed(() => Boolean(scope.value && token.value)),
    meta: { persist: true },
  });
  const items = computed(() => query.data.value?.items ?? []);
  const loaded = computed(() => query.data.value !== undefined);
  return {
    items,
    loading: computed(() =>
      blockingQueryLoading(loaded.value, query.isPending.value),
    ),
    loaded,
    error: computed(() =>
      visibleQueryError(
        loaded.value,
        query.error.value
          ? localizedQueryError(
              query.error.value,
              errorMessage,
              "settings.users.loadError",
            )
          : null,
      ),
    ),
    load: async (force = false) => {
      if (force || !query.data.value) await query.refetch();
    },
  };
}

export function useMetadataProvidersQuery() {
  const { scope } = useQueryScope();
  const { token } = useSession();
  const { errorMessage } = useLocalizedMessage();
  const enabled = computed(() => Boolean(scope.value && token.value));
  const providers = useQuery({
    queryKey: computed(() =>
      scope.value
        ? queryKeys.metadataProviders(scope.value)
        : ["peridot", "unscoped", "admin", "metadata-providers"],
    ),
    queryFn: () => {
      if (!scope.value || !token.value) {
        throw new Error("Peridot query scope is unavailable.");
      }
      return listMetadataProviders(scope.value.serverAddress, token.value);
    },
    enabled,
    meta: { persist: true },
  });
  const definitions = useQuery({
    queryKey: computed(() =>
      scope.value
        ? queryKeys.metadataProviderDefinitions(scope.value)
        : ["peridot", "unscoped", "admin", "metadata-provider-definitions"],
    ),
    queryFn: () => {
      if (!scope.value || !token.value) {
        throw new Error("Peridot query scope is unavailable.");
      }
      return listMetadataProviderDefinitions(
        scope.value.serverAddress,
        token.value,
      );
    },
    enabled,
    meta: { persist: true },
  });
  const reason = computed(
    () => providers.error.value ?? definitions.error.value,
  );
  const loaded = computed(
    () =>
      providers.data.value !== undefined &&
      definitions.data.value !== undefined,
  );
  return {
    providers: computed(() => providers.data.value?.items ?? []),
    definitions: computed(() => definitions.data.value?.items ?? []),
    loading: computed(
      () =>
        !loaded.value &&
        (providers.isPending.value || definitions.isPending.value),
    ),
    loaded,
    error: computed(() =>
      visibleQueryError(
        loaded.value,
        reason.value
          ? localizedQueryError(
              reason.value,
              errorMessage,
              "settings.metadata.loadError",
            )
          : null,
      ),
    ),
    load: async (force = false) => {
      if (force || !providers.data.value || !definitions.data.value) {
        await Promise.all([providers.refetch(), definitions.refetch()]);
      }
    },
  };
}

const HISTORY_PAGE_SIZE = 50;

export function useTaskHistoryQuery() {
  const { scope } = useQueryScope();
  const { token } = useSession();
  const { errorMessage } = useLocalizedMessage();
  const options = {
    status: "terminal",
    limit: HISTORY_PAGE_SIZE,
  } as const;
  const query = useInfiniteQuery<
    TaskListResponse,
    Error,
    InfiniteData<TaskListResponse, number>,
    readonly unknown[],
    number
  >({
    queryKey: computed(() =>
      scope.value
        ? queryKeys.tasks(scope.value, options)
        : ["peridot", "unscoped", "tasks-history"],
    ),
    queryFn: ({ pageParam }) => {
      if (!scope.value || !token.value) {
        throw new Error("Peridot query scope is unavailable.");
      }
      return listTasks(scope.value.serverAddress, token.value, {
        ...options,
        offset: pageParam,
      });
    },
    initialPageParam: 0,
    getNextPageParam: (lastPage, pages) =>
      lastPage.items.length === HISTORY_PAGE_SIZE
        ? pages.length * HISTORY_PAGE_SIZE
        : undefined,
    enabled: computed(() => Boolean(scope.value && token.value)),
    meta: { persist: true },
  });
  const items = computed(() =>
    (query.data.value?.pages ?? []).flatMap((page) => page.items),
  );
  const loaded = computed(() => query.data.value !== undefined);
  return {
    items,
    loading: computed(() =>
      blockingQueryLoading(loaded.value, query.isPending.value),
    ),
    loadingMore: computed(() => query.isFetchingNextPage.value),
    loaded,
    hasMore: computed(() => query.hasNextPage.value),
    error: computed(() =>
      visibleQueryError(
        loaded.value,
        query.error.value
          ? localizedQueryError(
              query.error.value,
              errorMessage,
              "settings.tasks.historyError",
            )
          : null,
      ),
    ),
    refresh: async () => {
      await query.refetch();
    },
    loadMore: async () => {
      if (query.hasNextPage.value) await query.fetchNextPage();
    },
  };
}

export function useServerLogsQuery() {
  const { scope } = useQueryScope();
  const { token } = useSession();
  const queryClient = useQueryClient();
  const key = computed(() =>
    scope.value
      ? queryKeys.logs(scope.value)
      : ["peridot", "unscoped", "admin", "logs"],
  );
  const query = useQuery({
    queryKey: key,
    queryFn: () => {
      if (!scope.value || !token.value) {
        throw new Error("Peridot query scope is unavailable.");
      }
      return fetchLogs(scope.value.serverAddress, token.value);
    },
    enabled: computed(() => Boolean(scope.value && token.value)),
    meta: { persist: true },
  });
  const items = computed(() =>
    [...(query.data.value?.items ?? [])].reverse().slice(0, 500),
  );
  const loaded = computed(() => query.data.value !== undefined);
  return {
    items,
    loading: computed(() =>
      blockingQueryLoading(loaded.value, query.isPending.value),
    ),
    loaded,
    error: computed(() =>
      visibleQueryError(loaded.value, query.error.value?.message ?? ""),
    ),
    refresh: async () => {
      await query.refetch();
    },
    append(entry: LogEntryResponse) {
      const current = queryClient.getQueryData<LogListResponse>(key.value);
      if (!current) return;
      queryClient.setQueryData(key.value, {
        items: [...current.items, entry].slice(-500),
      });
    },
  };
}

export function useDirectoriesQuery(parent: () => string | undefined) {
  const { scope } = useQueryScope();
  const { token } = useSession();
  return useQuery({
    queryKey: computed(() =>
      scope.value
        ? queryKeys.directories(scope.value, parent())
        : ["peridot", "unscoped", "directories", parent()],
    ),
    queryFn: () => {
      if (!scope.value || !token.value) {
        throw new Error("Peridot query scope is unavailable.");
      }
      return listDirectories(scope.value.serverAddress, token.value, parent());
    },
    enabled: computed(() => Boolean(scope.value && token.value)),
    meta: { persist: false },
  });
}
