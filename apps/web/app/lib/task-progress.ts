import type { TaskResponse, TaskStatus } from "@peridot/contracts";

const ACTIVE_STATUSES = new Set<TaskStatus>(["queued", "running"]);

export function isActiveTaskStatus(status: TaskStatus): boolean {
  return ACTIVE_STATUSES.has(status);
}

function createdAt(task: TaskResponse): number {
  const value = new Date(task.createdAt).getTime();
  return Number.isFinite(value) ? value : 0;
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
      return createdAt(left) - createdAt(right);
    });
}

export function activeTaskPercent(task: TaskResponse): number | null {
  if (task.status === "queued") return 0;
  if (task.status !== "running") return null;
  if (task.progress.state !== "determinate") return null;
  if (task.progress.total === 0) return 100;

  const percent = (task.progress.completed / task.progress.total) * 100;
  return Math.min(100, Math.max(0, percent));
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

export function taskStatusLabel(task: TaskResponse): string {
  switch (task.status) {
    case "running":
      return "Running";
    case "queued":
      return "Queued";
    case "completed":
      return "Completed";
    case "failed":
      return "Failed";
    case "interrupted":
      return "Interrupted";
  }
}

export function taskProgressLabel(task: TaskResponse): string {
  if (task.status === "queued") return "Waiting to start";
  const percent = activeTaskPercent(task);
  if (percent === null) return "In progress";
  if (task.progress.state === "determinate" && task.progress.total > 0) {
    return `${Math.round(percent)}% (${task.progress.completed} of ${task.progress.total})`;
  }
  return `${Math.round(percent)}%`;
}
