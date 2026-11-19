<script setup lang="ts">
import { computed, onMounted, watch } from "vue";
import { useLikes } from "../composables/use-likes";
import { useLibrarySettings } from "../composables/use-library-settings";
import { useOfflineTracks } from "../composables/use-offline-tracks";
import { useQueryScope } from "../composables/use-query-scope";
import { useServerConnection } from "../composables/use-server-connection";
import { useSession } from "../composables/use-session";
import { isActiveDownloadTask } from "../lib/download-tasks";

const { likesRevision } = useLikes();
const { likedTitlesOffline, verified } = useLibrarySettings();
const { downloadTasks, saveLikedTitles, startDownloadWorker } =
  useOfflineTracks();
const { scope } = useQueryScope();
const { token } = useSession();
const { status } = useServerConnection();
const activeLikedTask = computed(
  () =>
    downloadTasks.tasks.value.find(
      (task) =>
        task.request.kind === "liked_titles" && isActiveDownloadTask(task),
    ) ?? null,
);
let synchronizedRevision = -1;

async function synchronize() {
  if (
    !verified.value ||
    !likedTitlesOffline.value ||
    status.value !== "connected" ||
    !scope.value ||
    !token.value
  ) {
    if (verified.value && !likedTitlesOffline.value) {
      await downloadTasks.cancelLikedTitles();
    }
    return;
  }
  const activeTaskId = activeLikedTask.value?.id;
  const task = await saveLikedTitles();
  if (!activeTaskId || task?.id !== activeTaskId) {
    synchronizedRevision = likesRevision.value;
  }
}

watch(
  [verified, likedTitlesOffline, likesRevision, status, scope, token],
  () => void synchronize(),
  { immediate: true },
);
watch(
  () => activeLikedTask.value?.status ?? null,
  (next, previous) => {
    if (previous && !next && likesRevision.value !== synchronizedRevision) {
      void synchronize();
    }
  },
);

onMounted(() => void startDownloadWorker());
</script>

<template>
  <span hidden aria-hidden="true" />
</template>
