import { computed } from "vue";
import { useQuery } from "@tanstack/vue-query";
import {
  isAuthenticationRedirectError,
  listPluginProviders,
} from "../lib/peridot-client";
import { queryKeys } from "../lib/query-keys";
import { useLocalizedMessage } from "./use-localized-message";
import { useQueryScope } from "./use-query-scope";
import { useSession } from "./use-session";

export function usePluginProviders() {
  const { scope } = useQueryScope();
  const { token } = useSession();
  const { errorMessage } = useLocalizedMessage();
  const query = useQuery({
    queryKey: computed(() =>
      scope.value
        ? queryKeys.pluginProviders(scope.value)
        : ["peridot", "unscoped", "plugin-providers"],
    ),
    queryFn: () => {
      if (!scope.value || !token.value) {
        throw new Error("Peridot query scope is unavailable.");
      }
      return listPluginProviders(scope.value.serverAddress, token.value);
    },
    enabled: computed(() => Boolean(scope.value && token.value)),
    staleTime: 60_000,
    meta: { persist: true },
  });
  return {
    items: computed(() => query.data.value?.items ?? []),
    loading: computed(() => query.isPending.value || query.isFetching.value),
    error: computed(() => {
      if (!query.error.value) return null;
      return isAuthenticationRedirectError(query.error.value)
        ? null
        : errorMessage(query.error.value, "error.pluginProvidersLoad");
    }),
    refresh: () => query.refetch(),
  };
}
