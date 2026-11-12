import { useState } from "#imports";
import type { QuickPickItemResponse } from "@peridot/contracts";
import { onMounted, watch } from "vue";
import {
  fetchQuickPicks,
  isAuthenticationRedirectError,
} from "../lib/peridot-client";
import { useServer } from "./use-server";
import { useSession } from "./use-session";
import { useUser } from "./use-user";
import { useLocalizedMessage } from "./use-localized-message";

export function useQuickPicks() {
  const { address } = useServer();
  const { token } = useSession();
  const { user } = useUser();
  const { errorMessage } = useLocalizedMessage();
  const items = useState<QuickPickItemResponse[]>(
    "quick-picks-items",
    () => [],
  );
  const loading = useState("quick-picks-loading", () => false);
  const loaded = useState("quick-picks-loaded", () => false);
  const error = useState<string | null>("quick-picks-error", () => null);
  const playHistoryVersion = useState("player-play-history-version", () => 0);
  let queuedRefresh = false;

  async function load(force = false) {
    if (loading.value) {
      if (force) queuedRefresh = true;
      return;
    }
    if (!force && loaded.value) return;
    const serverAddress = address.value;
    const sessionToken = token.value;
    if (!serverAddress || !sessionToken) {
      items.value = [];
      loaded.value = false;
      loading.value = false;
      error.value = null;
      return;
    }

    loading.value = true;
    error.value = null;
    try {
      items.value = (await fetchQuickPicks(serverAddress, sessionToken)).items;
      loaded.value = true;
    } catch (reason) {
      if (isAuthenticationRedirectError(reason)) return;
      error.value = errorMessage(reason, "error.quickPicksLoad");
    } finally {
      loading.value = false;
      if (queuedRefresh) {
        queuedRefresh = false;
        void load(true);
      }
    }
  }

  watch([address, token, () => user.value?.id], () => {
    items.value = [];
    loaded.value = false;
    void load(true);
  });
  watch(playHistoryVersion, () => {
    void load(true);
  });
  onMounted(() => {
    void load();
  });

  return { items, loading, loaded, error, load };
}
