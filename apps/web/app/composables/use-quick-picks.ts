import { useState } from "#imports";
import { useQuery } from "@tanstack/vue-query";
import { computed, watch } from "vue";
import {
  fetchQuickPicks,
  isAuthenticationRedirectError,
} from "../lib/peridot-client";
import { queryKeys } from "../lib/query-keys";
import { useLocalizedMessage } from "./use-localized-message";
import { useQueryScope } from "./use-query-scope";
import { useSession } from "./use-session";

export function useQuickPicks() {
  const { scope } = useQueryScope();
  const { token } = useSession();
  const { errorMessage } = useLocalizedMessage();
  const playHistoryVersion = useState("player-play-history-version", () => 0);
  const query = useQuery({
    queryKey: computed(() =>
      scope.value
        ? queryKeys.quickPicks(scope.value)
        : ["peridot", "unscoped", "quick-picks"],
    ),
    queryFn: () => {
      if (!scope.value || !token.value) {
        throw new Error("Peridot query scope is unavailable.");
      }
      return fetchQuickPicks(scope.value.serverAddress, token.value);
    },
    enabled: computed(() => Boolean(scope.value && token.value)),
    meta: { persist: true },
  });
  const items = computed(() => query.data.value?.items ?? []);
  const loading = computed(
    () => query.isPending.value || query.isFetching.value,
  );
  const loaded = computed(() => query.data.value !== undefined);
  const error = computed(() => {
    if (!query.error.value) return null;
    return isAuthenticationRedirectError(query.error.value)
      ? null
      : errorMessage(query.error.value, "error.quickPicksLoad");
  });

  async function load(force = false) {
    if (!scope.value || !token.value) return;
    if (force || !query.data.value) await query.refetch();
  }

  watch(playHistoryVersion, () => void load(true));

  return { items, loading, loaded, error, load };
}
