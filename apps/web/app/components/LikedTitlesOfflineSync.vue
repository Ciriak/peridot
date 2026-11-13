<script setup lang="ts">
import { listTracks } from "../lib/peridot-client";
import { loadAllLikedTracks } from "../lib/liked-offline";
import { saveOfflineCollection } from "../lib/offline-collection";
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
const { refresh, isSaved, save } = useOfflineTracks();
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
    const tracks = await loadAllLikedTracks((cursor) =>
      listTracks(currentScope.serverAddress, currentToken, {
        cursor,
        limit: 100,
        liked: true,
      }),
    );
    if (
      !likedTitlesOffline.value ||
      status.value !== "connected" ||
      !sameScope(scope.value, currentScope) ||
      token.value !== currentToken
    ) {
      return;
    }

    await saveOfflineCollection(tracks, {
      isSaved,
      save: async (track) => {
        if (
          !likedTitlesOffline.value ||
          !sameScope(scope.value, currentScope) ||
          token.value !== currentToken
        ) {
          throw new Error("Liked-title offline synchronization stopped.");
        }
        if (!(await save(track))) {
          throw new Error("A liked track could not be saved offline.");
        }
      },
    });
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
