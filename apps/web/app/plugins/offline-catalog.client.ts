import { defineNuxtPlugin, useState } from "#imports";
import { onBeforeUnmount, watch } from "vue";
import type { PeridotQueryScope } from "../lib/query-keys";
import {
  clearOfflineCatalog,
  OFFLINE_CATALOG_QUIET_INTERVAL_MS,
  readOfflineCatalogSyncState,
  recordOfflineCatalogAttempt,
  shouldSyncOfflineCatalog,
  syncOfflineCatalog,
} from "../lib/offline-catalog";
import {
  setOfflineCatalogSnapshot,
  setOfflineCatalogSyncStatus,
} from "../composables/use-offline-catalog";
import { useQueryScope } from "../composables/use-query-scope";
import { useServerConnection } from "../composables/use-server-connection";
import { useSession } from "../composables/use-session";

function sameScope(
  left: PeridotQueryScope | null,
  right: PeridotQueryScope | null,
): boolean {
  return (
    left?.serverAddress === right?.serverAddress &&
    left?.userId === right?.userId
  );
}

export default defineNuxtPlugin(() => {
  const { scope } = useQueryScope();
  const { token } = useSession();
  const { status } = useServerConnection();
  const revision = useState("catalog-revision", () => 0);
  let running = false;
  let dirty = false;
  let timer: ReturnType<typeof setTimeout> | undefined;

  async function synchronize() {
    if (running) {
      dirty = true;
      return;
    }
    const currentScope = scope.value;
    const currentToken = token.value;
    if (status.value !== "connected" || !currentScope || !currentToken) return;

    running = true;
    try {
      const syncState = await readOfflineCatalogSyncState(currentScope);
      if (!shouldSyncOfflineCatalog(syncState)) {
        setOfflineCatalogSyncStatus(
          syncState?.tooLargeUntil &&
            new Date(syncState.tooLargeUntil).getTime() > Date.now()
            ? "too-large"
            : "idle",
          currentScope,
        );
        return;
      }
      setOfflineCatalogSyncStatus("syncing", currentScope);
      await recordOfflineCatalogAttempt(currentScope);
      if (navigator.storage?.persist) {
        await navigator.storage.persist().catch(() => false);
      }
      const result = await syncOfflineCatalog(currentScope, currentToken);
      if (
        !sameScope(scope.value, currentScope) ||
        token.value !== currentToken
      ) {
        await clearOfflineCatalog();
        setOfflineCatalogSnapshot(null);
        setOfflineCatalogSyncStatus("idle", currentScope);
        return;
      }
      if (result.status === "too-large") {
        setOfflineCatalogSnapshot(null);
        setOfflineCatalogSyncStatus("too-large", currentScope);
        return;
      }
      setOfflineCatalogSnapshot(result.snapshot);
      setOfflineCatalogSyncStatus("idle", currentScope);
    } catch {
      // Keep the last complete snapshot when a refresh is interrupted.
      setOfflineCatalogSyncStatus("idle", currentScope);
    } finally {
      running = false;
      if (dirty) {
        dirty = false;
        schedule();
      }
    }
  }

  function schedule() {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = undefined;
      void synchronize();
    }, OFFLINE_CATALOG_QUIET_INTERVAL_MS);
  }

  watch(
    [scope, token, status, revision],
    () => {
      if (status.value === "connected") {
        schedule();
      } else if (timer) {
        clearTimeout(timer);
        timer = undefined;
      }
    },
    { immediate: true },
  );
  onBeforeUnmount(() => {
    if (timer) clearTimeout(timer);
  });
});
