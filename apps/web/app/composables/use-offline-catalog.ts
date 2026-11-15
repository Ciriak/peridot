import { shallowRef } from "vue";
import { watch } from "vue";
import {
  readOfflineCatalog,
  type OfflineCatalogSnapshot,
} from "../lib/offline-catalog";
import { useQueryScope } from "./use-query-scope";
import { useServerConnection } from "./use-server-connection";

const snapshot = shallowRef<OfflineCatalogSnapshot | null>(null);
const loading = shallowRef(false);
const loaded = shallowRef(false);
let requestVersion = 0;

export function setOfflineCatalogSnapshot(next: OfflineCatalogSnapshot | null) {
  snapshot.value = next;
  loaded.value = true;
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
        return;
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

  return { snapshot, loading, loaded, reload };
}
