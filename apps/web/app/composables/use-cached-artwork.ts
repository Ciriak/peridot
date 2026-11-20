import { computed, onBeforeUnmount, ref, toValue, watch } from "vue";
import type { MaybeRefOrGetter } from "vue";
import { loadArtworkCacheFirst } from "../lib/artwork-loading";
import { cachedArtworkBlob, loadArtworkBlob } from "../lib/offline-artwork";
import { useQueryScope } from "./use-query-scope";
import { useServerConnection } from "./use-server-connection";

export function useCachedArtwork(source: MaybeRefOrGetter<string | null>) {
  const { scope } = useQueryScope();
  const { status } = useServerConnection();
  const resolvedSource = computed(() => toValue(source));
  const artworkUrl = ref<string | null>(null);
  const failed = ref(false);
  const fromCache = ref(false);
  let objectUrl: string | null = null;
  let requestVersion = 0;

  function releaseObjectUrl() {
    if (objectUrl) URL.revokeObjectURL(objectUrl);
    objectUrl = null;
  }

  async function resolveArtwork() {
    const version = ++requestVersion;
    const sourceValue = resolvedSource.value;
    releaseObjectUrl();
    artworkUrl.value = null;
    failed.value = false;
    fromCache.value = false;
    if (!sourceValue) return;

    try {
      const currentScope = scope.value;
      const { blob, fromCache: resolvedFromCache } =
        await loadArtworkCacheFirst(
          () =>
            currentScope
              ? cachedArtworkBlob(currentScope, sourceValue)
              : Promise.resolve(null),
          () =>
            currentScope && status.value !== "lost"
              ? loadArtworkBlob(currentScope, sourceValue)
              : Promise.resolve(null),
        );
      if (version !== requestVersion) return;
      fromCache.value = resolvedFromCache;
      if (blob) {
        objectUrl = URL.createObjectURL(blob);
        artworkUrl.value = objectUrl;
        return;
      }
      if (status.value !== "lost") artworkUrl.value = sourceValue;
      else failed.value = true;
    } catch {
      if (version !== requestVersion) return;
      if (status.value !== "lost") artworkUrl.value = sourceValue;
      else failed.value = true;
    }
  }

  watch([resolvedSource, scope, status], () => void resolveArtwork(), {
    immediate: true,
  });
  onBeforeUnmount(() => {
    requestVersion += 1;
    releaseObjectUrl();
  });

  return { artworkUrl, failed, fromCache };
}
