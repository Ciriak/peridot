<script setup lang="ts">
import { useRoute } from "#imports";
import type { TaskStatus } from "@peridot/contracts";
import { onBeforeUnmount, onMounted, watch } from "vue";
import { useLibraryTracks } from "../composables/use-library-tracks";
import { useServer } from "../composables/use-server";
import { useServerConnection } from "../composables/use-server-connection";
import { useSession } from "../composables/use-session";
import { useTasks } from "../composables/use-tasks";
import { isPeridotServerReachable } from "../lib/server-connection";
import { isActiveTaskStatus } from "../lib/task-progress";

const ACTIVE_TASK_POLL_DELAY = 500;
const IDLE_TASK_POLL_DELAY = 5000;
const TASK_RETRY_DELAY = 2000;
const TASK_UNAVAILABLE_RETRY_DELAY = 10_000;
const TASK_FAILURE_LIMIT = 3;
const CONNECTION_POLL_DELAY = 10_000;
const CONNECTION_TIMEOUT = 4000;

const route = useRoute();
const { address } = useServer();
const { status: connectionState } = useServerConnection();
const { token } = useSession();
const { tasks, activeTasks, refresh } = useTasks();
const { reload: reloadLibrary } = useLibraryTracks();

let taskTimer: ReturnType<typeof setTimeout> | undefined;
let taskFailures = 0;
let refreshingTasks = false;
let connectionTimer: ReturnType<typeof setTimeout> | undefined;
let connectionController: AbortController | undefined;
let disposed = false;
let taskScope = "";
const previousStatuses = new Map<string, TaskStatus>();

function clearTaskTimer() {
  if (taskTimer) clearTimeout(taskTimer);
  taskTimer = undefined;
}

function currentScope(): string {
  return `${address.value ?? ""}\u0000${token.value ?? ""}`;
}

function scheduleTaskRefresh(delay: number) {
  clearTaskTimer();
  if (!address.value || !token.value || route.path === "/onboarding") return;
  taskTimer = setTimeout(() => void refreshTasks(), delay);
}

function reactToTaskChanges() {
  for (const task of tasks.value) {
    const previous = previousStatuses.get(task.id);
    if (
      previous &&
      isActiveTaskStatus(previous) &&
      !isActiveTaskStatus(task.status) &&
      (task.kind === "library_scan" || task.kind === "metadata_fetch")
    ) {
      void reloadLibrary();
    }
    previousStatuses.set(task.id, task.status);
  }
}

async function refreshTasks() {
  if (refreshingTasks || !address.value || !token.value) return;
  refreshingTasks = true;
  const requestedScope = currentScope();
  try {
    await refresh();
    if (requestedScope !== taskScope || disposed) return;
    taskFailures = 0;
    reactToTaskChanges();
  } catch {
    if (requestedScope !== taskScope || disposed) return;
    taskFailures += 1;
    if (taskFailures >= TASK_FAILURE_LIMIT) {
      scheduleTaskRefresh(TASK_UNAVAILABLE_RETRY_DELAY);
    } else {
      scheduleTaskRefresh(TASK_RETRY_DELAY);
    }
    return;
  } finally {
    refreshingTasks = false;
  }
  if (!disposed && !taskTimer) {
    scheduleTaskRefresh(
      activeTasks.value.length ? ACTIVE_TASK_POLL_DELAY : IDLE_TASK_POLL_DELAY,
    );
  }
}

function resetTaskTracking(nextScope: string) {
  taskScope = nextScope;
  taskFailures = 0;
  previousStatuses.clear();
  clearTaskTimer();
  if (!address.value || !token.value || route.path === "/onboarding") {
    return;
  }
  void refreshTasks();
}

function scheduleConnectionCheck() {
  if (connectionTimer) clearTimeout(connectionTimer);
  connectionTimer = setTimeout(
    () => void checkConnection(),
    CONNECTION_POLL_DELAY,
  );
}

async function checkConnection() {
  const serverAddress = address.value;
  if (!serverAddress || route.path === "/onboarding") {
    connectionState.value = "unknown";
    return;
  }

  connectionController?.abort();
  const controller = new AbortController();
  connectionController = controller;
  const timeout = setTimeout(() => controller.abort(), CONNECTION_TIMEOUT);
  const reachable = await isPeridotServerReachable(serverAddress, {
    signal: controller.signal,
  });
  clearTimeout(timeout);
  if (
    disposed ||
    (controller.signal.aborted && connectionController !== controller)
  ) {
    return;
  }

  if (reachable) {
    connectionState.value = "connected";
  } else {
    connectionState.value = "lost";
  }
  scheduleConnectionCheck();
}

watch(
  [address, token, () => route.path === "/onboarding"],
  () => resetTaskTracking(currentScope()),
  { immediate: true },
);

watch([() => address.value, () => route.path === "/onboarding"], () => {
  connectionState.value = "unknown";
  if (connectionTimer) clearTimeout(connectionTimer);
  void checkConnection();
});

onMounted(() => void checkConnection());
onBeforeUnmount(() => {
  disposed = true;
  clearTaskTimer();
  if (connectionTimer) clearTimeout(connectionTimer);
  connectionController?.abort();
});
</script>

<template>
  <span hidden aria-hidden="true" />
</template>
