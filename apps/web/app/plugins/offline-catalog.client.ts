import { defineNuxtPlugin, useState } from "#imports";
import { onBeforeUnmount, onMounted, watch } from "vue";
import type { PeridotQueryScope } from "../lib/query-keys";
import {
  clearOfflineCatalog,
  syncOfflineCatalog,
  type OfflineCatalogSnapshot,
} from "../lib/offline-catalog";
import { trackCoverUrl } from "../lib/library";
import { warmOfflineArtwork } from "../lib/offline-artwork";
import { setOfflineCatalogSnapshot } from "../composables/use-offline-catalog";
import { useQueryScope } from "../composables/use-query-scope";
import { useServerConnection } from "../composables/use-server-connection";
import { useSession } from "../composables/use-session";

function artworkUrls(snapshot: OfflineCatalogSnapshot): string[] {
  const urls = [
    ...snapshot.tracks.flatMap((track) =>
      track.coverUrl
        ? [trackCoverUrl(snapshot.scope.serverAddress, track.coverUrl)]
        : [],
    ),
    ...snapshot.albums.flatMap((album) =>
      album.coverUrl
        ? [trackCoverUrl(snapshot.scope.serverAddress, album.coverUrl)]
        : [],
    ),
    ...snapshot.artists.flatMap((artist) =>
      artist.imageUrl
        ? [trackCoverUrl(snapshot.scope.serverAddress, artist.imageUrl)]
        : [],
    ),
  ];
  return [...new Set(urls.filter((url): url is string => Boolean(url)))];
}

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
      if (navigator.storage?.persist) {
        await navigator.storage.persist().catch(() => false);
      }
      const snapshot = await syncOfflineCatalog(currentScope, currentToken);
      if (
        !sameScope(scope.value, currentScope) ||
        token.value !== currentToken
      ) {
        await clearOfflineCatalog();
        return;
      }
      setOfflineCatalogSnapshot(snapshot);
      await warmOfflineArtwork(currentScope, artworkUrls(snapshot));
    } catch {
      // Keep the last complete snapshot when a refresh is interrupted.
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
    }, 100);
  }

  onMounted(schedule);
  watch(
    [scope, token, status, revision],
    () => {
      if (status.value === "connected") schedule();
    },
    { immediate: true },
  );
  onBeforeUnmount(() => {
    if (timer) clearTimeout(timer);
  });
});
