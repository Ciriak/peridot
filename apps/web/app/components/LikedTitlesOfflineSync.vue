<script setup lang="ts">
import { loadCollectionTracks } from "../lib/catalog-collections";
import {
  loadAllLikedAlbums,
  loadAllLikedTracks,
  saveLikedAlbumsOffline,
  saveLikedTracksOffline,
} from "../lib/liked-offline";
import { listAlbums, listTracks } from "../lib/peridot-client";
import type { PeridotQueryScope } from "../lib/query-keys";
import { onBeforeUnmount, onMounted, watch } from "vue";
import { useLikes } from "../composables/use-likes";
import { useLibrarySettings } from "../composables/use-library-settings";
import { useOfflineTracks } from "../composables/use-offline-tracks";
import { useQueryScope } from "../composables/use-query-scope";
import { useServerConnection } from "../composables/use-server-connection";
import { useSession } from "../composables/use-session";

const { likesRevision } = useLikes();
const { likedTitlesOffline } = useLibrarySettings();
const { refresh, isSaved, save, saveAlbum } = useOfflineTracks();
const { scope } = useQueryScope();
const { token } = useSession();
const { status } = useServerConnection();

let timer: ReturnType<typeof setTimeout> | undefined;
let running = false;
let dirty = false;

function sameScope(
  left: PeridotQueryScope | null,
  right: PeridotQueryScope | null,
): boolean {
  return (
    left?.serverAddress === right?.serverAddress &&
    left?.userId === right?.userId
  );
}

function synchronizationActive(
  currentScope: PeridotQueryScope,
  currentToken: string,
): boolean {
  return (
    likedTitlesOffline.value &&
    status.value === "connected" &&
    sameScope(scope.value, currentScope) &&
    token.value === currentToken
  );
}

async function synchronize() {
  if (running) {
    dirty = true;
    return;
  }

  const currentScope = scope.value;
  const currentToken = token.value;
  if (
    !likedTitlesOffline.value ||
    status.value !== "connected" ||
    !currentScope ||
    !currentToken
  ) {
    return;
  }

  running = true;
  try {
    await refresh();
    const [trackPageResult, albumPageResult] = await Promise.allSettled([
      loadAllLikedTracks((cursor) =>
        listTracks(currentScope.serverAddress, currentToken, {
          cursor,
          limit: 100,
          liked: true,
        }),
      ),
      loadAllLikedAlbums((cursor) =>
        listAlbums(currentScope.serverAddress, currentToken, {
          cursor,
          limit: 100,
          liked: true,
        }),
      ),
    ]);
    if (!synchronizationActive(currentScope, currentToken)) return;

    if (trackPageResult.status === "fulfilled") {
      const trackResult = await saveLikedTracksOffline(trackPageResult.value, {
        isSaved,
        save,
        shouldContinue: () => synchronizationActive(currentScope, currentToken),
      });
      if (trackResult.stopped) return;
    }

    if (albumPageResult.status === "fulfilled") {
      await saveLikedAlbumsOffline(albumPageResult.value, {
        loadTracks: (album) =>
          loadCollectionTracks(currentScope.serverAddress, currentToken, {
            albumId: album.id,
          }),
        save: (album, albumTracks) => saveAlbum(album.id, albumTracks),
        shouldContinue: () => synchronizationActive(currentScope, currentToken),
      });
    }
  } catch {
    // A later connection, setting, or likes change retries the synchronization.
  } finally {
    running = false;
    if (dirty) {
      dirty = false;
      schedule();
    }
  }
}

function schedule(delay = 150) {
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => {
    timer = undefined;
    void synchronize();
  }, delay);
}

watch(
  [likesRevision, likedTitlesOffline, status, scope, token],
  () => {
    if (status.value === "connected") schedule();
  },
  { immediate: true },
);

onMounted(() => schedule(0));
onBeforeUnmount(() => {
  if (timer) clearTimeout(timer);
});
</script>

<template>
  <span hidden aria-hidden="true" />
</template>
