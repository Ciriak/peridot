import type {
  AlbumSummaryResponse,
  MediaType,
  MessageDescriptor,
  TrackResponse,
} from "@peridot/contracts";
import { createStore, del, entries, set } from "idb-keyval";
import type { PeridotQueryScope } from "./query-keys";

export const DOWNLOAD_TASK_DATABASE = "peridot-web-download-tasks-v1";
export const DOWNLOAD_TASK_STORAGE_VERSION = 1;
export const DOWNLOAD_TASK_MAX_TERMINAL = 100;
export const DOWNLOAD_TASK_TERMINAL_AGE_MS = 30 * 24 * 60 * 60 * 1000;
const DOWNLOAD_TASK_STORE = "download-tasks";

export type DownloadTaskKind =
  "track" | "album" | "collection" | "playlist" | "liked_titles";

export type DownloadTaskStatus =
  | "queued"
  | "running"
  | "paused"
  | "completed"
  | "completed_with_errors"
  | "failed"
  | "cancelled";

export type DownloadTaskRequest =
  | { kind: "track"; track: TrackResponse }
  | { kind: "album"; album: AlbumSummaryResponse }
  | {
      kind: "collection";
      collectionId: string;
      mediaType: Exclude<MediaType, "music">;
      title: string;
    }
  | { kind: "playlist"; playlistId: string; title: string }
  | { kind: "liked_titles" };

export interface DownloadTaskProgress {
  completed: number;
  total: number | null;
  currentTrackPercent: number | null;
}

export interface DownloadTask {
  version: typeof DOWNLOAD_TASK_STORAGE_VERSION;
  id: string;
  scope: PeridotQueryScope;
  request: DownloadTaskRequest;
  kind: DownloadTaskKind;
  targetId: string;
  title: string;
  titleMessage: MessageDescriptor;
  status: DownloadTaskStatus;
  progress: DownloadTaskProgress;
  retryCount: number;
  failedItemCount: number;
  failureMessage: string | null;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
  updatedAt: string;
  notifyOnCompletion: boolean;
}

export interface CreateDownloadTaskInput {
  request: DownloadTaskRequest;
  title: string;
  titleMessage: MessageDescriptor;
  notifyOnCompletion?: boolean;
  now?: Date;
  id?: string;
}

const ACTIVE_STATUSES = new Set<DownloadTaskStatus>([
  "queued",
  "running",
  "paused",
]);

export const TERMINAL_DOWNLOAD_STATUSES = new Set<DownloadTaskStatus>([
  "completed",
  "completed_with_errors",
  "failed",
  "cancelled",
]);

function downloadTaskStore() {
  return createStore(DOWNLOAD_TASK_DATABASE, DOWNLOAD_TASK_STORE);
}

function scopePrefix(scope: PeridotQueryScope): string {
  return `${encodeURIComponent(scope.serverAddress)}:${encodeURIComponent(scope.userId)}:`;
}

export function downloadTaskStorageKey(
  scope: PeridotQueryScope,
  taskId: string,
): string {
  return `${scopePrefix(scope)}${encodeURIComponent(taskId)}`;
}

export function isActiveDownloadTask(task: DownloadTask): boolean {
  return ACTIVE_STATUSES.has(task.status);
}

export function isDownloadTaskTerminal(task: DownloadTask): boolean {
  return TERMINAL_DOWNLOAD_STATUSES.has(task.status);
}

export function downloadTaskTarget(kind: DownloadTaskKind): string {
  if (kind === "track") return "track";
  if (kind === "album") return "album";
  if (kind === "collection") return "collection";
  if (kind === "playlist") return "playlist";
  return "liked";
}

export function sameDownloadTaskTarget(
  left: DownloadTask,
  request: DownloadTaskRequest,
): boolean {
  if (left.request.kind !== request.kind) return false;
  if (request.kind === "track") {
    return left.request.kind === "track"
      ? left.request.track.id === request.track.id
      : false;
  }
  if (request.kind === "album") {
    return left.request.kind === "album"
      ? left.request.album.id === request.album.id
      : false;
  }
  if (request.kind === "collection") {
    return left.request.kind === "collection"
      ? left.request.collectionId === request.collectionId &&
          left.request.mediaType === request.mediaType
      : false;
  }
  if (request.kind === "playlist") {
    return left.request.kind === "playlist"
      ? left.request.playlistId === request.playlistId
      : false;
  }
  return left.request.kind === "liked_titles";
}

export function downloadTaskProgressPercent(task: DownloadTask): number | null {
  if (task.status === "queued" || task.status === "paused") return 0;
  if (task.status === "completed") return 100;
  if (TERMINAL_DOWNLOAD_STATUSES.has(task.status)) return null;
  const total = task.progress.total;
  if (total === null || total <= 0) {
    return task.progress.currentTrackPercent;
  }
  const current = (task.progress.currentTrackPercent ?? 0) / 100;
  return Math.min(
    100,
    Math.max(
      0,
      Math.round(((task.progress.completed + current) / total) * 100),
    ),
  );
}

export function createDownloadTask(
  scope: PeridotQueryScope,
  input: CreateDownloadTaskInput,
): DownloadTask {
  const now = (input.now ?? new Date()).toISOString();
  const id =
    input.id ??
    (typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`);
  return {
    version: DOWNLOAD_TASK_STORAGE_VERSION,
    id,
    scope,
    request: input.request,
    kind: input.request.kind,
    targetId:
      input.request.kind === "track"
        ? input.request.track.id
        : input.request.kind === "album"
          ? input.request.album.id
          : input.request.kind === "collection"
            ? input.request.collectionId
            : input.request.kind === "playlist"
              ? input.request.playlistId
              : "liked-titles",
    title: input.title,
    titleMessage: input.titleMessage,
    status: "queued",
    progress: {
      completed: 0,
      total: null,
      currentTrackPercent: null,
    },
    retryCount: 0,
    failedItemCount: 0,
    failureMessage: null,
    createdAt: now,
    startedAt: null,
    completedAt: null,
    updatedAt: now,
    notifyOnCompletion: input.notifyOnCompletion ?? true,
  };
}

function normalizeTask(
  task: DownloadTask,
  scope: PeridotQueryScope,
): DownloadTask | null {
  if (
    task?.version !== DOWNLOAD_TASK_STORAGE_VERSION ||
    task.scope?.serverAddress !== scope.serverAddress ||
    task.scope?.userId !== scope.userId
  ) {
    return null;
  }
  return {
    ...task,
    status: task.status === "running" ? "queued" : task.status,
    progress: task.progress ?? {
      completed: 0,
      total: null,
      currentTrackPercent: null,
    },
    retryCount: task.retryCount ?? 0,
    failedItemCount: task.failedItemCount ?? 0,
    failureMessage: task.failureMessage ?? null,
    notifyOnCompletion: task.notifyOnCompletion ?? true,
  };
}

export async function readDownloadTasks(
  scope: PeridotQueryScope,
): Promise<DownloadTask[]> {
  if (typeof indexedDB === "undefined") return [];
  const prefix = scopePrefix(scope);
  const values = await entries<string, DownloadTask>(downloadTaskStore());
  return values
    .filter(([key]) => key.startsWith(prefix))
    .flatMap(([, value]) => {
      const task = normalizeTask(value, scope);
      return task ? [task] : [];
    })
    .sort(
      (left, right) =>
        new Date(left.createdAt).getTime() -
        new Date(right.createdAt).getTime(),
    );
}

export async function writeDownloadTask(task: DownloadTask): Promise<void> {
  if (typeof indexedDB === "undefined") return;
  await set(
    downloadTaskStorageKey(task.scope, task.id),
    JSON.parse(JSON.stringify(task)) as DownloadTask,
    downloadTaskStore(),
  );
}

export async function deleteDownloadTask(task: DownloadTask): Promise<void> {
  if (typeof indexedDB === "undefined") return;
  await del(downloadTaskStorageKey(task.scope, task.id), downloadTaskStore());
}

export async function clearDownloadTasks(
  scope?: PeridotQueryScope,
): Promise<void> {
  if (typeof indexedDB === "undefined") return;
  const store = downloadTaskStore();
  const values = await entries<string, DownloadTask>(store);
  const prefix = scope ? scopePrefix(scope) : null;
  await Promise.all(
    values
      .filter(([key]) => !prefix || key.startsWith(prefix))
      .map(([key]) => del(key, store)),
  );
}

export function pruneDownloadTasks(
  tasks: DownloadTask[],
  now = new Date(),
): DownloadTask[] {
  const cutoff = now.getTime() - DOWNLOAD_TASK_TERMINAL_AGE_MS;
  const active = tasks.filter(isActiveDownloadTask);
  const terminal = tasks
    .filter(
      (task) =>
        isDownloadTaskTerminal(task) &&
        new Date(task.completedAt ?? task.updatedAt).getTime() >= cutoff,
    )
    .sort(
      (left, right) =>
        new Date(right.completedAt ?? right.updatedAt).getTime() -
        new Date(left.completedAt ?? left.updatedAt).getTime(),
    )
    .slice(0, DOWNLOAD_TASK_MAX_TERMINAL);
  return [...active, ...terminal];
}

export function reconcileDownloadTasks(
  tasks: DownloadTask[],
  scope: PeridotQueryScope,
  now = new Date(),
): DownloadTask[] {
  return pruneDownloadTasks(
    tasks.flatMap((task) => {
      const normalized = normalizeTask(task, scope);
      return normalized ? [normalized] : [];
    }),
    now,
  );
}
