import {
  TASK_ACTIVE_METADATA_PROVIDER_DETAIL_KEY,
  type MessageDescriptor,
  type TaskResponse,
  type TaskStatus,
} from "@peridot/contracts";
import { message } from "./messages.ts";

const ACTIVE_STATUSES = new Set<TaskStatus>(["queued", "running"]);

export function isActiveTaskStatus(status: TaskStatus): boolean {
  return ACTIVE_STATUSES.has(status);
}

function createdAt(task: TaskResponse): number {
  const value = new Date(task.createdAt).getTime();
  return Number.isFinite(value) ? value : 0;
}

function taskKindPriority(task: TaskResponse): number {
  if (task.kind === "library_scan") return 0;
  if (task.kind === "metadata_fetch") return 1;
  if (task.kind === "catalog_fetch") return 2;
  if (task.kind === "artwork_fetch") return 3;
  return 1;
}

export function orderedActiveTasks(
  tasks: readonly TaskResponse[],
): TaskResponse[] {
  return tasks
    .filter((task) => isActiveTaskStatus(task.status))
    .sort((left, right) => {
      if (left.status !== right.status) {
        return left.status === "running" ? -1 : 1;
      }
      const priority = taskKindPriority(left) - taskKindPriority(right);
      if (priority !== 0) return priority;
      return createdAt(left) - createdAt(right);
    });
}

export function activeTaskForSource(
  tasks: readonly TaskResponse[],
  sourceId: string,
): TaskResponse | null {
  return (
    orderedActiveTasks(tasks).find((task) => task.source?.id === sourceId) ??
    null
  );
}

export function activeMetadataProviderId(task: TaskResponse): string | null {
  if (task.kind !== "metadata_fetch" || task.status !== "running") return null;
  return (
    task.details.find(
      (detail) => detail.key === TASK_ACTIVE_METADATA_PROVIDER_DETAIL_KEY,
    )?.value || null
  );
}

export function activeTaskForMetadataProvider(
  tasks: readonly TaskResponse[],
  providerId: string,
): TaskResponse | null {
  return (
    orderedActiveTasks(tasks).find(
      (task) => activeMetadataProviderId(task) === providerId,
    ) ?? null
  );
}

export function runningMetadataTask(
  tasks: readonly TaskResponse[],
): TaskResponse | null {
  return (
    orderedActiveTasks(tasks).find(
      (task) => task.kind === "metadata_fetch" && task.status === "running",
    ) ?? null
  );
}

export function activeTaskPercent(task: TaskResponse): number | null {
  if (task.status === "queued") return 0;
  if (task.status !== "running") return null;
  if (task.progress.state !== "determinate") return null;
  if (task.progress.total === 0) return 100;

  const percent = (task.progress.completed / task.progress.total) * 100;
  return Math.min(100, Math.max(0, percent));
}

export function sourceTaskProgress(task: TaskResponse): number | null {
  return task.status === "queued" ? null : activeTaskPercent(task);
}

export function overallTaskProgress(
  tasks: readonly TaskResponse[],
): number | null {
  const active = orderedActiveTasks(tasks);
  if (!active.length) return null;
  if (!active.some((task) => task.status === "running")) return null;

  let total = 0;
  for (const task of active) {
    const percent = activeTaskPercent(task);
    if (percent === null) return null;
    total += percent;
  }
  return total / active.length;
}

export function taskStatusMessage(task: TaskResponse): MessageDescriptor {
  switch (task.status) {
    case "running":
      return message("settings.tasks.status.running");
    case "queued":
      return message("settings.tasks.status.queued");
    case "completed":
      return message("settings.tasks.status.completed");
    case "failed":
      return message("settings.tasks.status.failed");
    case "interrupted":
      return message("settings.tasks.status.interrupted");
    case "stopped":
      return message("settings.tasks.status.stopped");
  }
}

export function taskProgressMessage(task: TaskResponse): MessageDescriptor {
  if (task.status === "queued") {
    return message("settings.tasks.progressWaiting");
  }
  const percent = activeTaskPercent(task);
  if (percent === null) {
    return message("settings.tasks.progressIndeterminate");
  }
  if (task.progress.state === "determinate" && task.progress.total > 0) {
    return message("settings.tasks.progress", {
      percent: Math.round(percent),
      completed: task.progress.completed,
      total: task.progress.total,
    });
  }
  return message("settings.tasks.percent", {
    percent: Math.round(percent),
  });
}
