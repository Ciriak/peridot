import { useState } from "#imports";
import type { TaskResponse } from "@peridot/contracts";
import { computed } from "vue";
import {
  listTasks,
  refreshMetadata,
  rescanSource,
  startLibraryScan,
} from "../lib/peridot-client";
import { useServer } from "./use-server";
import { useSession } from "./use-session";

const ACTIVE_STATUSES = new Set(["queued", "running"]);

function taskOrder(left: TaskResponse, right: TaskResponse): number {
  const rank = (task: TaskResponse) =>
    task.status === "running" ? 0 : task.status === "queued" ? 1 : 2;
  const statusRank = rank(left) - rank(right);
  if (statusRank !== 0) return statusRank;
  return (
    new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime()
  );
}

export function useTasks() {
  const { address } = useServer();
  const { token } = useSession();
  const tasks = useState<TaskResponse[]>("tasks", () => []);
  const loaded = useState("tasks-loaded", () => false);
  const loading = useState("tasks-loading", () => false);
  const starting = useState("tasks-starting", () => false);

  const activeTasks = computed(() =>
    tasks.value.filter((task) => ACTIVE_STATUSES.has(task.status)),
  );
  const activeTask = computed(
    () =>
      activeTasks.value.find((task) => task.status === "running") ??
      activeTasks.value[0] ??
      null,
  );
  const hasActiveTasks = computed(() => activeTasks.value.length > 0);
  const queuedCount = computed(
    () => activeTasks.value.filter((task) => task.status === "queued").length,
  );

  function ordered(items: TaskResponse[]): TaskResponse[] {
    return [...items].sort(taskOrder);
  }

  function track(nextTask: TaskResponse): TaskResponse {
    tasks.value = ordered([
      nextTask,
      ...tasks.value.filter((task) => task.id !== nextTask.id),
    ]);
    loaded.value = true;
    return nextTask;
  }

  function upsert(nextTask: TaskResponse): TaskResponse {
    const existing = tasks.value.find((task) => task.id === nextTask.id);
    if (
      existing &&
      new Date(existing.updatedAt).getTime() >
        new Date(nextTask.updatedAt).getTime()
    ) {
      return existing;
    }
    return track(nextTask);
  }

  async function refresh() {
    if (!address.value || !token.value) return tasks.value;
    const requestedAddress = address.value;
    const requestedToken = token.value;
    loading.value = true;
    try {
      const result = await listTasks(requestedAddress, requestedToken, {
        status: "all",
        limit: 50,
      });
      if (
        requestedAddress !== address.value ||
        requestedToken !== token.value
      ) {
        return tasks.value;
      }
      tasks.value = ordered(result.items);
      loaded.value = true;
      return tasks.value;
    } finally {
      loading.value = false;
    }
  }

  async function queueLibraryScan() {
    if (starting.value) return activeTask.value;
    starting.value = true;
    try {
      return track(
        await startLibraryScan(address.value ?? "", token.value ?? ""),
      );
    } finally {
      starting.value = false;
    }
  }

  async function queueSourceScan(sourceId: string) {
    if (starting.value) return activeTask.value;
    starting.value = true;
    try {
      return track(
        await rescanSource(address.value ?? "", token.value ?? "", sourceId),
      );
    } finally {
      starting.value = false;
    }
  }

  async function queueMetadataRefresh() {
    if (starting.value) return activeTask.value;
    starting.value = true;
    try {
      return track(
        await refreshMetadata(address.value ?? "", token.value ?? ""),
      );
    } finally {
      starting.value = false;
    }
  }

  return {
    tasks,
    loaded,
    loading,
    starting,
    activeTask,
    activeTasks,
    hasActiveTasks,
    queuedCount,
    refresh,
    track,
    upsert,
    queueLibraryScan,
    queueSourceScan,
    queueMetadataRefresh,
  };
}
