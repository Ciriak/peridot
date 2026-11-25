import type { OverviewResponse } from "@peridot/contracts";
import { useQuery } from "@tanstack/vue-query";
import { computed } from "vue";
import {
  fetchOverview,
  isAuthenticationRedirectError,
} from "../lib/peridot-client";
import { queryKeys } from "../lib/query-keys";
import {
  blockingQueryLoading,
  visibleQueryError,
} from "../lib/query-view-state";
import { useLocalizedMessage } from "./use-localized-message";
import { useQueryScope } from "./use-query-scope";
import { useSession } from "./use-session";

const OVERVIEW_REFRESH_INTERVAL_MS = 60_000;

export function useOverviewQuery() {
  const { scope } = useQueryScope();
  const { token } = useSession();
  const { errorMessage } = useLocalizedMessage();
  const query = useQuery({
    queryKey: computed(() =>
      scope.value
        ? queryKeys.overview(scope.value)
        : ["peridot", "unscoped", "overview"],
    ),
    queryFn: () => {
      if (!scope.value || !token.value) {
        throw new Error("Peridot query scope is unavailable.");
      }
      return fetchOverview(scope.value.serverAddress, token.value);
    },
    enabled: computed(() => Boolean(scope.value && token.value)),
    refetchInterval: OVERVIEW_REFRESH_INTERVAL_MS,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
    retry: 1,
    staleTime: 15_000,
    meta: { persist: false },
  });
  const data = computed<OverviewResponse | undefined>(() => query.data.value);
  const loaded = computed(() => data.value !== undefined);
  const error = computed(() => {
    const reason = query.error.value;
    if (!reason || isAuthenticationRedirectError(reason)) return null;
    return visibleQueryError(
      loaded.value,
      errorMessage(reason, "settings.overview.loadError"),
    );
  });

  return {
    data,
    loading: computed(() =>
      blockingQueryLoading(loaded.value, query.isPending.value),
    ),
    refreshing: computed(() => query.isFetching.value),
    loaded,
    error,
    refresh: async () => {
      await query.refetch();
    },
  };
}
