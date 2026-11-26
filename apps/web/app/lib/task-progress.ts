import {
  TASK_ACTIVE_METADATA_PROVIDER_DETAIL_KEY,
  TASK_RELEASE_IMPORT_STAGE_DETAIL_KEY,
  type MessageDescriptor,
  type TaskResponse,
  type TaskReleaseImportStage,
  type TaskStatus,
} from "@peridot/contracts";
import { message } from "./messages.ts";

const ACTIVE_STATUSES = new Set<TaskStatus>(["waiting", "queued", "running"]);
const MIN_ESTIMATE_ELAPSED_MS = 10_000;
const MIN_ESTIMATE_PROGRESS = 0.05;

export function isActiveTaskStatus(status: TaskStatus): boolean {
  return ACTIVE_STATUSES.has(status);
}

function createdAt(task: TaskResponse): number {
  const value = new Date(task.createdAt).getTime();
  return Number.isFinite(value) ? value : 0;
}

function taskKindPriority(task: TaskResponse): number {
  if (task.kind === "release_import") return -1;
  if (task.kind === "library_scan") return 0;
  if (task.kind === "metadata_enrichment") return 1;
  if (task.kind === "catalog_projection") return 2;
  if (task.kind === "artwork_fetch") return 3;
  return 1;
}

export function orderedActiveTasks(
  tasks: readonly TaskResponse[],
): TaskResponse[] {
  return tasks
    .filter((task) => isActiveTaskStatus(task.status))
    .sort((left, right) => {
      const rank = (status: TaskStatus) =>
        status === "running" ? 0 : status === "waiting" ? 1 : 2;
      if (left.status !== right.status)
        return rank(left.status) - rank(right.status);
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
    orderedActiveTasks(tasks).find((task) => task.connector?.id === sourceId) ??
    null
  );
}

export function activeMetadataProviderId(task: TaskResponse): string | null {
  if (task.kind !== "metadata_enrichment" || task.status !== "running")
    return null;
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
      (task) =>
        task.kind === "metadata_enrichment" && task.status === "running",
    ) ?? null
  );
}

export function hasRunningLibraryScan(tasks: readonly TaskResponse[]): boolean {
  return tasks.some(
    (task) => task.kind === "library_scan" && task.status === "running",
  );
}

export function activeTaskPercent(task: TaskResponse): number | null {
  if (task.status === "queued") return 0;
  if (task.status !== "running" && task.status !== "waiting") return null;
  if (task.progress.state !== "determinate") return null;
  if (task.progress.total === 0) return 100;

  const percent = (task.progress.completed / task.progress.total) * 100;
  return Math.min(100, Math.max(0, percent));
}

export function estimatedTaskRemainingMs(
  task: TaskResponse,
  now: Date,
): number | null {
  if (
    task.status !== "running" ||
    task.startedAt === null ||
    task.progress.state !== "determinate"
  ) {
    return null;
  }

  return estimatedRemainingMs(
    task.startedAt,
    task.progress.completed,
    task.progress.total,
    now,
  );
}

export function estimatedRemainingMs(
  startedAtValue: string | null,
  completed: number,
  total: number,
  now: Date,
): number | null {
  if (startedAtValue === null) return null;

  const startedAt = new Date(startedAtValue).getTime();
  const elapsed = now.getTime() - startedAt;
  if (
    !Number.isFinite(startedAt) ||
    !Number.isFinite(elapsed) ||
    elapsed < MIN_ESTIMATE_ELAPSED_MS ||
    total <= 0 ||
    completed <= 0 ||
    completed >= total ||
    completed / total < MIN_ESTIMATE_PROGRESS
  ) {
    return null;
  }

  const remaining = elapsed * ((total - completed) / completed);
  return Number.isFinite(remaining) && remaining > 0 ? remaining : null;
}

export function sourceTaskProgress(task: TaskResponse): number | null {
  return task.status === "queued" ? null : activeTaskPercent(task);
}

export function overallTaskProgress(
  tasks: readonly TaskResponse[],
): number | null {
  const active = orderedActiveTasks(tasks);
  if (!active.length) return null;
  if (
    !active.some(
      (task) => task.status === "running" || task.status === "waiting",
    )
  ) {
    return null;
  }

  let total = 0;
  for (const task of active) {
    const percent = activeTaskPercent(task);
    if (percent === null) return null;
    total += percent;
  }
  return total / active.length;
}

export function groupedTaskProgress(
  rows: readonly { progress: number | null; running: boolean }[],
): number | null {
  if (!rows.length) return null;
  if (!rows.some((row) => row.running)) return 0;
  if (rows.some((row) => row.progress === null)) return null;
  return (
    rows.reduce((total, row) => total + (row.progress ?? 0), 0) / rows.length
  );
}

export function taskStatusMessage(task: TaskResponse): MessageDescriptor {
  if (task.status === "completed" && task.failureMessage) {
    return message("settings.tasks.status.completedWithErrors");
  }
  switch (task.status) {
    case "waiting":
      return message("settings.tasks.status.waiting");
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

export function releaseImportStage(
  task: TaskResponse,
): TaskReleaseImportStage | null {
  if (task.kind !== "release_import") return null;
  const stage = task.details.find(
    (detail) => detail.key === TASK_RELEASE_IMPORT_STAGE_DETAIL_KEY,
  )?.value;
  return stage === "downloading" || stage === "addingToLibrary" ? stage : null;
}

export function taskProgressMessage(task: TaskResponse): MessageDescriptor {
  if (task.status === "queued") {
    return message("settings.tasks.progressWaiting");
  }
  const percent = activeTaskPercent(task);
  if (percent === null) {
    return message("settings.tasks.progressIndeterminate");
  }
  if (
    task.progress.state === "determinate" &&
    task.progress.total > 0 &&
    releaseImportStage(task) !== "downloading"
  ) {
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
