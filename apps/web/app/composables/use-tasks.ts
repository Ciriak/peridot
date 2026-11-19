import type { TaskListResponse, TaskResponse } from "@peridot/contracts";
import { useMutation, useQuery, useQueryClient } from "@tanstack/vue-query";
import { computed, ref } from "vue";
import {
  cancelTask as requestCancelTask,
  listTasks,
  refreshMetadata,
  rescanSource,
  startLibraryScan,
} from "../lib/peridot-client";
import { persistQueryKey } from "../lib/query-persister";
import { queryKeys } from "../lib/query-keys";
import { useQueryScope } from "./use-query-scope";
import { useServerConnection } from "./use-server-connection";
import { useSession } from "./use-session";

const ACTIVE_STATUSES = new Set(["queued", "running"]);
const TASKS_QUERY_OPTIONS = { status: "all", limit: 50 } as const;
const EMPTY_TASKS: TaskListResponse = {
  items: [],
  activeCount: 0,
  queuedCount: 0,
};

function taskOrder(left: TaskResponse, right: TaskResponse): number {
  const rank = (task: TaskResponse) =>
    task.status === "running" ? 0 : task.status === "queued" ? 1 : 2;
  const statusRank = rank(left) - rank(right);
  if (statusRank !== 0) return statusRank;
  return (
    new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime()
  );
}

function taskList(items: TaskResponse[]): TaskListResponse {
  const ordered = [...items].sort(taskOrder);
  return {
    items: ordered,
    activeCount: ordered.filter((task) => ACTIVE_STATUSES.has(task.status))
      .length,
    queuedCount: ordered.filter((task) => task.status === "queued").length,
  };
}

export function useTasks() {
  const { scope } = useQueryScope();
  const { token } = useSession();
  const { status } = useServerConnection();
  const queryClient = useQueryClient();
  const cancellingTaskIds = ref<Set<string>>(new Set());
  const queryKey = computed(() =>
    scope.value ? queryKeys.tasks(scope.value, TASKS_QUERY_OPTIONS) : null,
  );
  const query = useQuery({
    queryKey: computed(
      () => queryKey.value ?? ["peridot", "unscoped", "tasks"],
    ),
    queryFn: () => {
      if (!scope.value || !token.value) {
        throw new Error("Peridot query scope is unavailable.");
      }
      return listTasks(
        scope.value.serverAddress,
        token.value,
        TASKS_QUERY_OPTIONS,
      );
    },
    enabled: computed(() => Boolean(scope.value && token.value)),
    meta: { persist: true },
  });
  const taskListValue = computed(() => query.data.value ?? EMPTY_TASKS);
  const tasks = computed(() => taskListValue.value.items);
  const loaded = computed(() => query.data.value !== undefined);
  const loading = computed(
    () => query.isPending.value || query.isFetching.value,
  );
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

  function track(nextTask: TaskResponse): TaskResponse {
    if (!queryKey.value) return nextTask;
    const current =
      queryClient.getQueryData<TaskListResponse>(queryKey.value) ?? EMPTY_TASKS;
    const next = taskList([
      nextTask,
      ...current.items.filter((task) => task.id !== nextTask.id),
    ]);
    queryClient.setQueryData(queryKey.value, next);
    void persistQueryKey(queryKey.value);
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

  function remove(taskId: string): void {
    if (!queryKey.value) return;
    const current =
      queryClient.getQueryData<TaskListResponse>(queryKey.value) ?? EMPTY_TASKS;
    queryClient.setQueryData(
      queryKey.value,
      taskList(current.items.filter((task) => task.id !== taskId)),
    );
    void persistQueryKey(queryKey.value);
  }

  async function refresh() {
    if (!scope.value || !token.value) return tasks.value;
    await query.refetch();
    return tasks.value;
  }

  const queueMutation = useMutation({
    mutationFn: async (
      action:
        | { kind: "library" }
        | { kind: "source"; sourceId: string }
        | { kind: "metadata" },
    ) => {
      if (!scope.value || !token.value) {
        throw new Error("Peridot query scope is unavailable.");
      }
      if (action.kind === "source") {
        return rescanSource(
          scope.value.serverAddress,
          token.value,
          action.sourceId,
        );
      }
      if (action.kind === "metadata") {
        return refreshMetadata(scope.value.serverAddress, token.value);
      }
      return startLibraryScan(scope.value.serverAddress, token.value);
    },
    onSuccess(task) {
      track(task);
    },
  });
  const starting = computed(
    () => queueMutation.isPending.value || status.value === "lost",
  );

  async function queueLibraryScan() {
    if (starting.value) return activeTask.value;
    return queueMutation.mutateAsync({ kind: "library" });
  }

  async function queueSourceScan(sourceId: string) {
    if (starting.value) return activeTask.value;
    return queueMutation.mutateAsync({ kind: "source", sourceId });
  }

  async function queueMetadataRefresh() {
    if (starting.value) return activeTask.value;
    return queueMutation.mutateAsync({ kind: "metadata" });
  }

  function isCancellingTask(taskId: string): boolean {
    return cancellingTaskIds.value.has(taskId);
  }

  async function cancelTask(taskId: string) {
    if (!scope.value || !token.value) {
      throw new Error("Peridot query scope is unavailable.");
    }
    cancellingTaskIds.value = new Set([...cancellingTaskIds.value, taskId]);
    try {
      const cancelled = await requestCancelTask(
        scope.value.serverAddress,
        token.value,
        taskId,
      );
      if (cancelled.status === "queued") {
        remove(taskId);
      } else {
        track(cancelled);
      }
      return cancelled;
    } finally {
      cancellingTaskIds.value = new Set(
        [...cancellingTaskIds.value].filter((id) => id !== taskId),
      );
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
    isCancellingTask,
    cancelTask,
  };
}
