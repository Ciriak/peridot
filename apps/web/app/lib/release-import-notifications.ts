import type { TaskReleaseImportStage, TaskResponse } from "@peridot/contracts";
import { releaseImportStage } from "./task-progress.ts";

export function unseenReleaseImportStage(
  task: TaskResponse,
  userId: string | undefined,
  startedAt: number,
  notified: Set<string>,
): TaskReleaseImportStage | null {
  if (
    task.kind !== "release_import" ||
    !userId ||
    task.ownerUserId !== userId ||
    new Date(task.updatedAt).getTime() < startedAt
  ) {
    return null;
  }
  const stage = releaseImportStage(task);
  if (!stage) return null;
  const key = `${task.id}:${stage}`;
  if (notified.has(key)) return null;
  notified.add(key);
  return stage;
}
