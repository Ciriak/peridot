import { shallowRef } from "vue";
import { watch } from "vue";
import {
  readOfflineCatalog,
  type OfflineCatalogSnapshot,
} from "../lib/offline-catalog";
import type { PeridotQueryScope } from "../lib/query-keys";
import { useQueryScope } from "./use-query-scope";
import { useServerConnection } from "./use-server-connection";

const snapshot = shallowRef<OfflineCatalogSnapshot | null>(null);
const loading = shallowRef(false);
const loaded = shallowRef(false);
const syncStatus = shallowRef<"idle" | "syncing" | "too-large">("idle");
const syncStatusScope = shallowRef<string | null>(null);
let requestVersion = 0;

function scopeKey(scope: PeridotQueryScope | null): string | null {
  return scope
    ? `${scope.serverAddress.trim().toLowerCase()}|${scope.userId}`
    : null;
}

export function setOfflineCatalogSnapshot(next: OfflineCatalogSnapshot | null) {
  snapshot.value = next;
  loaded.value = true;
}

export function setOfflineCatalogSyncStatus(
  next: "idle" | "syncing" | "too-large",
  scope: PeridotQueryScope | null,
) {
  syncStatus.value = next;
  syncStatusScope.value = scopeKey(scope);
}

export function useOfflineCatalog() {
  const { scope } = useQueryScope();
  const { status } = useServerConnection();

  async function reload() {
    const version = ++requestVersion;
    if (!scope.value) {
      snapshot.value = null;
      loaded.value = true;
      return;
    }
    loading.value = true;
    try {
      const next = await readOfflineCatalog(scope.value);
      if (version === requestVersion) {
        snapshot.value = next;
        loaded.value = true;
      }
    } finally {
      if (version === requestVersion) loading.value = false;
    }
  }

  watch(
    [scope, status],
    ([nextScope]) => {
      if (!nextScope) {
        requestVersion += 1;
        snapshot.value = null;
        loaded.value = true;
        loading.value = false;
        syncStatus.value = "idle";
        syncStatusScope.value = null;
        return;
      }
      if (scopeKey(nextScope) !== syncStatusScope.value) {
        syncStatus.value = "idle";
        syncStatusScope.value = null;
      }
      if (
        !snapshot.value ||
        snapshot.value.scope.serverAddress !== nextScope.serverAddress ||
        snapshot.value.scope.userId !== nextScope.userId
      ) {
        void reload();
      }
    },
    { immediate: true },
  );

  return { snapshot, loading, loaded, syncStatus, reload };
}
