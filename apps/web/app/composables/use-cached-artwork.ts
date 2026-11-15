import { computed, onBeforeUnmount, ref, toValue, watch } from "vue";
import type { MaybeRefOrGetter } from "vue";
import { cachedArtworkBlob, loadArtworkBlob } from "../lib/offline-artwork";
import { useQueryScope } from "./use-query-scope";
import { useServerConnection } from "./use-server-connection";

export function useCachedArtwork(source: MaybeRefOrGetter<string | null>) {
  const { scope } = useQueryScope();
  const { status } = useServerConnection();
  const resolvedSource = computed(() => toValue(source));
  const artworkUrl = ref<string | null>(null);
  const failed = ref(false);
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
    if (!sourceValue) return;

    try {
      const currentScope = scope.value;
      const blob = currentScope
        ? ((await cachedArtworkBlob(currentScope, sourceValue)) ??
          (status.value === "lost"
            ? null
            : await loadArtworkBlob(currentScope, sourceValue)))
        : null;
      if (version !== requestVersion) return;
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

  return { artworkUrl, failed };
}
