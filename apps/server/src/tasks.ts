import {
  TASK_ACTIVE_METADATA_PROVIDER_DETAIL_KEY,
  type MessageDescriptor,
  type TaskDetailResponse,
  type TaskKind,
  type TaskListResponse,
  type TaskProgressResponse,
  type TaskResponse,
  type TaskStatus,
} from "@peridot/contracts";
import type { Database } from "./database.js";
import {
  message,
  normalizeMessageDescriptor,
  parseStoredMessage,
  serializeMessage,
} from "./messages.js";
import type { TaskRow } from "./prisma/models.js";

export const ACTIVE_TASK_STATUSES: readonly TaskStatus[] = [
  "waiting",
  "queued",
  "running",
];

export const TERMINAL_TASK_STATUSES: readonly TaskStatus[] = [
  "completed",
  "failed",
  "interrupted",
  "stopped",
];

const MAX_DETAILS = 16;
const MAX_DETAIL_KEY_LENGTH = 80;
const MAX_DETAIL_VALUE_LENGTH = 300;
const MAX_TITLE_LENGTH = 160;
const MAX_FAILURE_SUMMARY_LENGTH = 500;
const TERMINAL_TASK_LIMIT = 500;
const TERMINAL_TASK_AGE_MS = 30 * 24 * 60 * 60 * 1000;
export const MAX_TASK_RETRIES = 2;
const MAX_TASK_PAYLOAD_ITEMS = 100_000;
const MAX_TASK_PAYLOAD_ITEM_LENGTH = 4_096;

export interface EnqueueTaskInput {
  kind: TaskKind;
  title: string;
  titleMessage?: MessageDescriptor | null;
  initialStatus?: "waiting" | "queued";
  dedupe?: boolean;
  publish?: boolean;
  ownerUserId?: string | null;
  parentTaskId?: string | null;
  sourceId?: string | null;
  sourceName?: string | null;
  details?: TaskDetailResponse[];
  payload?: readonly string[] | null;
  forceRefresh?: boolean;
}

export interface TaskExecutionResult {
  details?: TaskDetailResponse[];
  failureSummary?: string | null;
}

export type TaskExecutor = (
  task: TaskRow,
  tasks: TaskService,
  signal: AbortSignal,
) => Promise<TaskExecutionResult | void>;

export type TaskChangePublisher = (task: TaskResponse) => void;
export type TaskLogLevel = "warn" | "error";
export type TaskLogPublisher = (level: TaskLogLevel, message: string) => void;

export class TaskExecutionError extends Error {
  constructor(
    message: string,
    readonly status: "failed" | "interrupted" | "stopped" = "failed",
    readonly messageDescriptor?: MessageDescriptor,
  ) {
    super(message);
    this.name = "TaskExecutionError";
  }
}

function boundedText(value: string, length: number): string {
  return value.trim().slice(0, length);
}

export function normalizeTaskDetails(
  details: readonly TaskDetailResponse[] = [],
): TaskDetailResponse[] {
  return details.slice(0, MAX_DETAILS).flatMap((detail) => {
    if (
      !detail ||
      typeof detail.key !== "string" ||
      typeof detail.value !== "string"
    ) {
      return [];
    }
    const key = boundedText(detail.key, MAX_DETAIL_KEY_LENGTH);
    const value = boundedText(detail.value, MAX_DETAIL_VALUE_LENGTH);
    const labelMessage = normalizeMessageDescriptor(detail.labelMessage);
    const valueMessage = normalizeMessageDescriptor(detail.valueMessage);
    return key && labelMessage
      ? [
          {
            key,
            value,
            labelMessage,
            valueMessage,
          },
        ]
      : [];
  });
}

function parseStoredDetails(value: string): TaskDetailResponse[] {
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed)
      ? normalizeTaskDetails(parsed as TaskDetailResponse[])
      : [];
  } catch {
    return [];
  }
}

function normalizeTaskPayload(
  payload: readonly string[] | null | undefined,
): string | null {
  if (payload === null || payload === undefined) return null;
  return JSON.stringify(
    [...new Set(payload)]
      .filter(
        (item) =>
          typeof item === "string" &&
          item.length > 0 &&
          item.length <= MAX_TASK_PAYLOAD_ITEM_LENGTH,
      )
      .slice(0, MAX_TASK_PAYLOAD_ITEMS),
  );
}

export function readTaskPayload(
  task: Pick<TaskRow, "payload">,
): string[] | null {
  if (task.payload === null) return null;
  try {
    const parsed = JSON.parse(task.payload) as unknown;
    return Array.isArray(parsed)
      ? parsed.filter(
          (item): item is string => typeof item === "string" && item.length > 0,
        )
      : [];
  } catch {
    return [];
  }
}

function progressFor(task: TaskRow): TaskProgressResponse {
  const total = task.progressTotal;
  const completed = task.progressCompleted;
  if (
    total === null ||
    !Number.isSafeInteger(total) ||
    total < 0 ||
    completed === null ||
    !Number.isSafeInteger(completed) ||
    completed < 0
  ) {
    return {
      state: "indeterminate",
      completed: null,
      total: null,
    };
  }
  return {
    state: "determinate",
    completed: Math.min(completed, total),
    total,
  };
}

export function toTaskResponse(task: TaskRow): TaskResponse {
  const titleMessage =
    parseStoredMessage(task.titleMessage) ??
    (task.kind === "library_scan"
      ? task.sourceName
        ? message("task.title.sourceScan", { source: task.sourceName })
        : message("task.title.libraryScan")
      : task.kind === "catalog_fetch"
        ? task.sourceName
          ? message("task.title.sourceCatalogProjection", {
              source: task.sourceName,
            })
          : message("task.title.catalogProjection")
        : task.kind === "metadata_fetch"
          ? task.sourceName
            ? message("task.title.sourceMetadataMatch", {
                source: task.sourceName,
              })
            : message("task.title.metadataMatch")
          : task.kind === "artwork_fetch"
            ? task.sourceName
              ? message("task.title.sourceArtworkFetch", {
                  source: task.sourceName,
                })
              : message("task.title.artworkFetch")
            : task.kind === "duplicate_detection"
              ? message("task.title.duplicateDetection")
              : message("task.title.custom", { task: task.title }));
  return {
    id: task.id,
    kind: task.kind as TaskKind,
    status: task.status as TaskStatus,
    titleMessage,
    ownerUserId: task.ownerUserId,
    parentTaskId: task.parentTaskId,
    source: task.sourceName
      ? {
          id: task.sourceId,
          name: task.sourceName,
        }
      : null,
    progress: progressFor(task),
    details: parseStoredDetails(task.details),
    failureMessage:
      parseStoredMessage(task.failureMessage) ??
      (task.failureSummary
        ? message(
            task.status === "interrupted"
              ? "api.message.taskInterrupted"
              : task.status === "stopped"
                ? "api.message.taskStopped"
                : task.status === "completed"
                  ? "api.message.taskCompletedWithErrors"
                  : "api.message.taskFailedGeneric",
          )
        : null),
    createdAt: task.createdAt.toISOString(),
    startedAt: task.startedAt?.toISOString() ?? null,
    completedAt: task.completedAt?.toISOString() ?? null,
    updatedAt: task.updatedAt.toISOString(),
  };
}

function isTaskKind(value: string): value is TaskKind {
  return (
    value === "library_scan" ||
    value === "release_import" ||
    value === "catalog_fetch" ||
    value === "metadata_fetch" ||
    value === "artwork_fetch" ||
    value === "duplicate_detection"
  );
}

function queuedTaskPriority(kind: string): number {
  if (kind === "release_import") return -1;
  if (kind === "library_scan") return 0;
  if (kind === "metadata_fetch") return 1;
  if (kind === "duplicate_detection") return 2;
  if (kind === "catalog_fetch") return 3;
  if (kind === "artwork_fetch") return 4;
  return 1;
}

function compareQueuedTasks(left: TaskRow, right: TaskRow): number {
  const priority =
    queuedTaskPriority(left.kind) - queuedTaskPriority(right.kind);
  if (priority !== 0) return priority;
  const created = left.createdAt.getTime() - right.createdAt.getTime();
  if (created !== 0) return created;
  return left.id.localeCompare(right.id);
}

function activeRank(status: string): number {
  if (status === "running") return 0;
  if (status === "waiting") return 1;
  if (status === "queued") return 2;
  return 3;
}

interface RunningTaskControl {
  controller: AbortController;
  completion: Promise<void>;
  finish(): void;
}

function detailNumber(
  details: readonly TaskDetailResponse[],
  key: string,
): number {
  const value = details.find((detail) => detail.key === key)?.value ?? "0";
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : 0;
}

export class TaskService {
  private readonly executors = new Map<string, TaskExecutor>();
  private readonly runningTasks = new Map<string, RunningTaskControl>();
  private admissionTail: Promise<unknown> = Promise.resolve();
  private drainPromise: Promise<void> | null = null;
  private stopping = false;
  private readonly pendingEmits = new Set<Promise<void>>();
  private readonly eventTimers = new Map<
    string,
    ReturnType<typeof setTimeout>
  >();

  constructor(
    private readonly database: Database,
    private readonly publisher?: TaskChangePublisher,
    private readonly logPublisher?: TaskLogPublisher,
  ) {}

  registerExecutor(kind: TaskKind, executor: TaskExecutor): void {
    if (!isTaskKind(kind)) {
      throw new Error(`Invalid task kind: ${kind}`);
    }
    this.executors.set(kind, executor);
  }

  async initialize(): Promise<void> {
    const now = new Date();
    const interrupted = await this.database.orm.Task.where({
      status: "running",
    }).updateAndCount({
      status: "interrupted",
      completedAt: now,
      failureSummary: "The server stopped before this task completed.",
      failureMessage: serializeMessage(message("api.message.taskInterrupted")),
    });
    if (interrupted > 0) {
      this.logPublisher?.(
        "warn",
        `Interrupted ${interrupted} running task${interrupted === 1 ? "" : "s"} because the server restarted.`,
      );
    }
    await this.prune();
    this.kick();
  }

  async enqueue(input: EnqueueTaskInput): Promise<TaskRow> {
    if (!isTaskKind(input.kind)) {
      throw new Error(`Invalid task kind: ${input.kind}`);
    }
    const title = boundedText(input.title, MAX_TITLE_LENGTH);
    if (!title) throw new Error("Task title is required");

    return this.serializeAdmission(async () => {
      const normalizedSourceId = input.sourceId ?? null;
      const forceRefresh = input.forceRefresh ? 1 : 0;
      const initialStatus = input.initialStatus ?? "queued";
      const queued =
        initialStatus === "queued" && input.dedupe !== false
          ? await this.database.orm.Task.where({
              kind: input.kind,
              status: "queued",
              forceRefresh,
            }).all()
          : [];
      const duplicate = queued.find(
        (task) => task.sourceId === normalizedSourceId,
      );
      if (duplicate) return duplicate;

      const task = await this.database.orm.Task.create({
        kind: input.kind,
        status: initialStatus,
        title,
        titleMessage: serializeMessage(input.titleMessage),
        ownerUserId: input.ownerUserId ?? null,
        parentTaskId: input.parentTaskId ?? null,
        sourceId: normalizedSourceId,
        sourceName: input.sourceName
          ? boundedText(input.sourceName, MAX_TITLE_LENGTH)
          : null,
        details: JSON.stringify(normalizeTaskDetails(input.details)),
        payload: normalizeTaskPayload(input.payload),
        forceRefresh,
      });
      if (input.publish !== false) {
        this.kick();
        this.publishTask(task.id, true);
      }
      return task;
    });
  }

  async hasActiveWork(): Promise<boolean> {
    return (
      (
        await this.database.orm.Task.where((task) =>
          task.status.in([...ACTIVE_TASK_STATUSES]),
        ).aggregate((aggregate) => ({ count: aggregate.count() }))
      ).count > 0
    );
  }

  async list(status: "all" | "active" | "terminal"): Promise<TaskListResponse> {
    const [tasks, activeCount, queuedCount] = await Promise.all([
      this.database.orm.Task.all(),
      this.database.orm.Task.where((task) =>
        task.status.in([...ACTIVE_TASK_STATUSES]),
      ).aggregate((aggregate) => ({ count: aggregate.count() })),
      this.database.orm.Task.where({ status: "queued" }).aggregate(
        (aggregate) => ({ count: aggregate.count() }),
      ),
    ]);
    const filtered = tasks.filter((task) => {
      if (status === "active") return activeRank(task.status) < 3;
      if (status === "terminal") return activeRank(task.status) === 3;
      return true;
    });
    filtered.sort((left, right) => {
      const rank = activeRank(left.status) - activeRank(right.status);
      if (rank !== 0) return rank;
      return right.createdAt.getTime() - left.createdAt.getTime();
    });
    return {
      items: filtered.map(toTaskResponse),
      activeCount: activeCount.count,
      queuedCount: queuedCount.count,
    };
  }

  async get(id: string): Promise<TaskRow | null> {
    return this.database.orm.Task.first({ id });
  }

  async updateProgress(
    id: string,
    completed: number | null,
    total: number | null,
    details?: readonly TaskDetailResponse[],
  ): Promise<void> {
    const update: {
      progressCompleted: number | null;
      progressTotal: number | null;
      details?: string;
    } = {
      progressCompleted:
        completed !== null && Number.isFinite(completed)
          ? Math.max(0, Math.floor(completed))
          : null,
      progressTotal:
        total !== null && Number.isFinite(total)
          ? Math.max(0, Math.floor(total))
          : null,
    };
    if (details) {
      update.details = JSON.stringify(normalizeTaskDetails(details));
    }
    await this.database.orm.Task.where((task) =>
      task.status.in(["waiting", "running"]),
    )
      .where({ id })
      .update(update);
    this.publishTask(id);
  }

  async promoteWaiting(
    id: string,
    details?: readonly TaskDetailResponse[],
    payload?: readonly string[] | null,
  ): Promise<void> {
    const promoted = await this.database.orm.Task.where({
      id,
      status: "waiting",
    }).updateAndCount({
      status: "queued",
      startedAt: null,
      completedAt: null,
      ...(details
        ? { details: JSON.stringify(normalizeTaskDetails(details)) }
        : {}),
      ...(payload !== undefined
        ? { payload: normalizeTaskPayload(payload) }
        : {}),
    });
    if (promoted === 0) return;
    this.publishTask(id, true);
    this.kick();
  }

  async discardWaiting(id: string): Promise<void> {
    await this.database.orm.Task.where({ id, status: "waiting" }).delete();
  }

  async complete(id: string, result: TaskExecutionResult = {}): Promise<void> {
    const failureSummary = result.failureSummary
      ? boundedText(result.failureSummary, MAX_FAILURE_SUMMARY_LENGTH)
      : null;
    const task = failureSummary
      ? await this.database.orm.Task.first({ id })
      : null;
    const update: {
      status: string;
      completedAt: Date;
      failureSummary: string | null;
      failureMessage: string | null;
      details?: string;
      progressCompleted?: number | null;
      progressTotal?: number | null;
    } = {
      status: "completed",
      completedAt: new Date(),
      failureSummary,
      failureMessage: serializeMessage(
        failureSummary ? message("api.message.taskCompletedWithErrors") : null,
      ),
    };
    if (result.details) {
      update.details = JSON.stringify(normalizeTaskDetails(result.details));
      if (
        result.details.some((detail) => detail.key === "progress.completed")
      ) {
        update.progressCompleted = detailNumber(
          result.details,
          "progress.completed",
        );
      }
      if (result.details.some((detail) => detail.key === "progress.total")) {
        update.progressTotal = detailNumber(result.details, "progress.total");
      }
    }
    await this.database.orm.Task.where({ id }).update(update);
    if (failureSummary) {
      this.logPublisher?.(
        "warn",
        `Task completed with errors: ${task?.title ?? id}. ${failureSummary}`,
      );
    }
    this.publishTask(id, true);
  }

  async fail(
    id: string,
    failureSummary: string,
    status: "failed" | "interrupted" | "stopped" = "failed",
    messageDescriptor?: MessageDescriptor,
  ): Promise<void> {
    const task = await this.database.orm.Task.first({ id });
    const summary = boundedText(failureSummary, MAX_FAILURE_SUMMARY_LENGTH);
    await this.database.orm.Task.where({ id }).update({
      status,
      completedAt: new Date(),
      failureSummary: summary,
      failureMessage: serializeMessage(messageDescriptor),
    });
    this.logPublisher?.(
      status === "interrupted" ? "warn" : "error",
      `Task ${status}: ${task?.title ?? id}. ${summary}`,
    );
    this.publishTask(id, true);
  }

  private async retryOrFail(
    id: string,
    failure: TaskExecutionError,
  ): Promise<void> {
    const task = await this.database.orm.Task.first({ id });
    if (task?.status !== "running") return;
    if (failure.status === "failed" && task.retryCount < MAX_TASK_RETRIES) {
      const retryCount = task.retryCount + 1;
      const retried = await this.database.orm.Task.where({
        id,
        status: "running",
      }).updateAndCount({
        status: "queued",
        retryCount,
        startedAt: null,
        completedAt: null,
        failureSummary: null,
        failureMessage: null,
        progressCompleted: null,
        progressTotal: null,
        details: "[]",
      });
      if (retried > 0) {
        this.logPublisher?.(
          "warn",
          `Task retry ${retryCount}/${MAX_TASK_RETRIES}: ${
            task.title
          }. ${failure.message}`,
        );
        this.publishTask(id, true);
        this.kick();
        return;
      }
    }
    const summary = boundedText(failure.message, MAX_FAILURE_SUMMARY_LENGTH);
    const failed = await this.database.orm.Task.where({
      id,
      status: "running",
    }).updateAndCount({
      status: failure.status,
      completedAt: new Date(),
      failureSummary: summary,
      failureMessage: serializeMessage(failure.messageDescriptor),
    });
    if (failed === 0) return;
    this.logPublisher?.(
      failure.status === "interrupted" ? "warn" : "error",
      `Task ${failure.status}: ${task.title}. ${summary}`,
    );
    this.publishTask(id, true);
  }

  async stop(id: string): Promise<TaskRow | null> {
    await this.stopTasks([id]);
    return this.get(id);
  }

  async cancel(id: string): Promise<TaskRow | null> {
    const task = await this.get(id);
    if (!task) return null;
    if (task.status === "queued") {
      const removed = await this.database.orm.Task.where({
        id,
        status: "queued",
      }).deleteAndCount();
      if (removed > 0) return task;
    }
    await this.stopTasks([id]);
    return this.get(id);
  }

  async stopForSource(sourceId: string): Promise<TaskRow[]> {
    const active = await this.database.orm.Task.where((task) =>
      task.status.in([...ACTIVE_TASK_STATUSES]),
    ).all();
    const ids = active
      .filter((task) => task.sourceId === null || task.sourceId === sourceId)
      .map((task) => task.id);
    return this.stopTasks(ids);
  }

  async prune(): Promise<void> {
    const cutoff = new Date(Date.now() - TERMINAL_TASK_AGE_MS);
    const expired = await this.database.orm.Task.where((task) =>
      task.status.in([...TERMINAL_TASK_STATUSES]),
    )
      .where((task) => task.completedAt.lt(cutoff))
      .select("id")
      .all();
    const excess = await this.database.orm.Task.where((task) =>
      task.status.in([...TERMINAL_TASK_STATUSES]),
    )
      .orderBy([(task) => task.completedAt.desc(), (task) => task.id.desc()])
      .offset(TERMINAL_TASK_LIMIT)
      .select("id")
      .all();
    const ids = [...new Set([...expired, ...excess].map((task) => task.id))];
    if (ids.length) {
      await this.database.orm.Task.where((task) =>
        task.id.in(ids),
      ).deleteAndCount();
    }
  }

  async close(): Promise<void> {
    this.stopping = true;
    for (const timer of this.eventTimers.values()) clearTimeout(timer);
    this.eventTimers.clear();
    for (const control of this.runningTasks.values()) {
      control.controller.abort();
    }
    await this.admissionTail;
    await this.drainPromise;
    await Promise.allSettled([...this.pendingEmits]);
  }

  private async stopTasks(ids: readonly string[]): Promise<TaskRow[]> {
    const uniqueIds = [...new Set(ids)];
    if (!uniqueIds.length) return [];
    const active = await this.database.orm.Task.where((task) =>
      task.id.in(uniqueIds),
    )
      .where((task) => task.status.in([...ACTIVE_TASK_STATUSES]))
      .all();
    if (!active.length) {
      return this.database.orm.Task.where((task) =>
        task.id.in(uniqueIds),
      ).all();
    }

    const now = new Date();
    const failureSummary = "Stopped by an administrator.";
    const failureMessage = serializeMessage(message("api.message.taskStopped"));
    await this.database.transaction(async (transaction) => {
      for (const task of active) {
        await transaction.orm.Task.where({
          id: task.id,
          status: task.status,
        }).update({
          status: "stopped",
          completedAt: now,
          failureSummary,
          failureMessage,
        });
      }
    });

    const completions: Array<Promise<void>> = [];
    for (const task of active) {
      const control = this.runningTasks.get(task.id);
      if (control) {
        control.controller.abort();
        completions.push(control.completion);
      }
      this.publishTask(task.id, true);
    }
    this.kick();
    await Promise.all(completions);
    return this.database.orm.Task.where((task) => task.id.in(uniqueIds)).all();
  }

  private publishTask(id: string, immediate = false) {
    if (!this.publisher) return;
    if (immediate) {
      const timer = this.eventTimers.get(id);
      if (timer) clearTimeout(timer);
      this.eventTimers.delete(id);
      this.queueEmit(id);
      return;
    }
    if (this.eventTimers.has(id)) return;
    const timer = setTimeout(() => {
      this.eventTimers.delete(id);
      this.queueEmit(id);
    }, 250);
    timer.unref?.();
    this.eventTimers.set(id, timer);
  }

  private async emitTask(id: string) {
    if (!this.publisher) return;
    const task = await this.database.orm.Task.first({ id });
    if (task) this.publisher(toTaskResponse(task));
  }

  private queueEmit(id: string): void {
    const pending = this.emitTask(id)
      .catch(() => undefined)
      .finally(() => {
        this.pendingEmits.delete(pending);
      });
    this.pendingEmits.add(pending);
  }

  private serializeAdmission<T>(operation: () => Promise<T>): Promise<T> {
    const next = this.admissionTail.then(operation, operation);
    this.admissionTail = next.catch(() => undefined);
    return next;
  }

  private kick(): void {
    if (this.stopping || this.drainPromise) return;
    this.drainPromise = new Promise<void>((resolve) => setImmediate(resolve))
      .then(() => this.drain())
      .catch(() => undefined)
      .finally(() => {
        this.drainPromise = null;
        if (!this.stopping) {
          void this.hasRunnableTask().then((runnable) => {
            if (runnable) this.kick();
          });
        }
      });
  }

  private async hasRunnableTask(): Promise<boolean> {
    const queued = (
      await this.database.orm.Task.where({ status: "queued" }).all()
    ).sort(compareQueuedTasks);
    for (const task of queued) {
      if (!task.parentTaskId) return true;
      const parent = await this.database.orm.Task.first({
        id: task.parentTaskId,
      });
      if (
        !parent ||
        (parent.status !== "queued" && parent.status !== "running")
      ) {
        return true;
      }
    }
    return false;
  }

  private async drain(): Promise<void> {
    while (!this.stopping) {
      const queued = (
        await this.database.orm.Task.where({ status: "queued" }).all()
      ).sort(compareQueuedTasks);
      let task: TaskRow | null = null;
      for (const candidate of queued) {
        if (!candidate.parentTaskId) {
          task = candidate;
          break;
        }
        const parent = await this.database.orm.Task.first({
          id: candidate.parentTaskId,
        });
        if (!parent) {
          await this.fail(
            candidate.id,
            "The parent task is no longer available.",
            "failed",
            message("api.message.parentTaskUnavailable"),
          );
          continue;
        }
        if (
          parent.status === "failed" ||
          parent.status === "interrupted" ||
          parent.status === "stopped"
        ) {
          await this.fail(
            candidate.id,
            "The parent task did not complete successfully.",
            "interrupted",
            message("api.message.parentTaskFailed"),
          );
          continue;
        }
        if (parent.status === "completed") {
          task = candidate;
          break;
        }
      }
      if (!task) return;

      await this.database.orm.Task.where({
        id: task.id,
        status: "queued",
      }).update({
        status: "running",
        startedAt: new Date(),
        progressCompleted: null,
        progressTotal: null,
      });
      this.publishTask(task.id, true);
      const running = await this.database.orm.Task.first({ id: task.id });
      if (!running || running.status !== "running") continue;

      const executor = this.executors.get(running.kind);
      if (!executor) {
        await this.fail(
          running.id,
          `No executor is available for ${running.kind}.`,
          "failed",
          message("api.message.taskNotFoundExecutor", {
            task: running.kind,
          }),
        );
        continue;
      }

      const controller = new AbortController();
      let finish!: () => void;
      const completion = new Promise<void>((resolve) => {
        finish = resolve;
      });
      this.runningTasks.set(running.id, {
        controller,
        completion,
        finish,
      });
      try {
        const result = await executor(running, this, controller.signal);
        const current = await this.database.orm.Task.first({ id: running.id });
        if (current?.status === "running" && !this.stopping) {
          await this.complete(running.id, result ?? {});
        }
      } catch (error) {
        const current = await this.database.orm.Task.first({ id: running.id });
        if (current?.status === "running" && !this.stopping) {
          const failure =
            error instanceof TaskExecutionError
              ? error
              : new TaskExecutionError(
                  "The task could not be completed.",
                  "failed",
                  message("api.message.taskFailedGeneric"),
                );
          await this.retryOrFail(running.id, failure);
        }
      } finally {
        this.runningTasks.delete(running.id);
        finish();
      }
      await this.prune();
    }
  }
}

export function queueLibraryScan(
  tasks: TaskService,
  source?: { id: string; name: string },
): Promise<TaskRow> {
  return tasks.enqueue({
    kind: "library_scan",
    title: source ? `${source.name} scan` : "Library scan",
    titleMessage: source
      ? message("task.title.sourceScan", { source: source.name })
      : message("task.title.libraryScan"),
    sourceId: source?.id ?? null,
    sourceName: source?.name ?? null,
    details: [
      {
        key: "source",
        value: source?.name ?? "All sources",
        labelMessage: message("task.detail.source"),
        valueMessage: source ? null : message("common.allSources"),
      },
    ],
  });
}

export function queueMetadataFetch(
  tasks: TaskService,
  options: {
    source?: { id: string; name: string } | null;
    parentTaskId?: string | null;
    force?: boolean;
    trackIds?: readonly string[] | null;
  } = {},
): Promise<TaskRow> {
  return tasks.enqueue({
    kind: "metadata_fetch",
    title: options.source
      ? `${options.source.name} metadata matching`
      : "Library metadata matching",
    titleMessage: options.source
      ? message("task.title.sourceMetadataMatch", {
          source: options.source.name,
        })
      : message("task.title.metadataMatch"),
    parentTaskId: options.parentTaskId ?? null,
    sourceId: options.source?.id ?? null,
    sourceName: options.source?.name ?? null,
    forceRefresh: options.force ?? false,
    payload: options.trackIds ?? null,
    details: [
      {
        key: "source",
        value: options.source?.name ?? "All sources",
        labelMessage: message("task.detail.source"),
        valueMessage: options.source ? null : message("common.allSources"),
      },
    ],
  });
}

export function queueDuplicateDetection(
  tasks: TaskService,
  parentTaskId: string | null = null,
): Promise<TaskRow> {
  return tasks.enqueue({
    kind: "duplicate_detection",
    title: "Duplicate track detection",
    titleMessage: message("task.title.duplicateDetection"),
    parentTaskId,
    details: [],
  });
}

export function queueCatalogFetch(
  tasks: TaskService,
  options: {
    source?: { id: string; name: string } | null;
    parentTaskId?: string | null;
  } = {},
): Promise<TaskRow> {
  return tasks.enqueue({
    kind: "catalog_fetch",
    title: options.source
      ? `${options.source.name} catalog projection`
      : "Library catalog projection",
    titleMessage: options.source
      ? message("task.title.sourceCatalogProjection", {
          source: options.source.name,
        })
      : message("task.title.catalogProjection"),
    parentTaskId: options.parentTaskId ?? null,
    sourceId: options.source?.id ?? null,
    sourceName: options.source?.name ?? null,
    details: [
      {
        key: "source",
        value: options.source?.name ?? "All sources",
        labelMessage: message("task.detail.source"),
        valueMessage: options.source ? null : message("common.allSources"),
      },
    ],
  });
}

export function queueArtworkFetch(
  tasks: TaskService,
  options: {
    source?: { id: string; name: string } | null;
    parentTaskId?: string | null;
  } = {},
): Promise<TaskRow> {
  return tasks.enqueue({
    kind: "artwork_fetch",
    title: options.source
      ? `${options.source.name} artwork retrieval`
      : "Library artwork retrieval",
    titleMessage: options.source
      ? message("task.title.sourceArtworkFetch", {
          source: options.source.name,
        })
      : message("task.title.artworkFetch"),
    parentTaskId: options.parentTaskId ?? null,
    sourceId: options.source?.id ?? null,
    sourceName: options.source?.name ?? null,
    details: [
      {
        key: "source",
        value: options.source?.name ?? "All sources",
        labelMessage: message("task.detail.source"),
        valueMessage: options.source ? null : message("common.allSources"),
      },
    ],
  });
}

export interface ScanTimingMs {
  discoveryMs: number;
  artworkMs: number;
  databaseMs: number;
  catalogMs: number;
}

export function scanDetails(counts: {
  source: string;
  discovered: number;
  created: number;
  updated: number;
  unchanged: number;
  unavailable: number;
  errors: number;
  timingMs?: ScanTimingMs;
}): TaskDetailResponse[] {
  return [
    {
      key: "source",
      value: counts.source,
      labelMessage: message("task.detail.source"),
      valueMessage: null,
    },
    {
      key: "progress.total",
      value: String(counts.discovered),
      labelMessage: message("task.detail.files"),
      valueMessage: null,
    },
    {
      key: "progress.completed",
      value: String(
        counts.created + counts.updated + counts.unchanged + counts.errors,
      ),
      labelMessage: message("task.detail.processed"),
      valueMessage: null,
    },
    {
      key: "files.created",
      value: String(counts.created),
      labelMessage: message("task.detail.added"),
      valueMessage: null,
    },
    {
      key: "files.updated",
      value: String(counts.updated),
      labelMessage: message("task.detail.updated"),
      valueMessage: null,
    },
    {
      key: "files.unchanged",
      value: String(counts.unchanged),
      labelMessage: message("task.detail.unchanged"),
      valueMessage: null,
    },
    {
      key: "files.unavailable",
      value: String(counts.unavailable),
      labelMessage: message("task.detail.unavailable"),
      valueMessage: null,
    },
    {
      key: "files.failed",
      value: String(counts.errors),
      labelMessage: message("task.detail.filesFailed"),
      valueMessage: null,
    },
    {
      key: "scan.discoveryMs",
      value: String(Math.round(counts.timingMs?.discoveryMs ?? 0)),
      labelMessage: message("task.detail.discoveryMs"),
      valueMessage: null,
    },
    {
      key: "scan.artworkMs",
      value: String(Math.round(counts.timingMs?.artworkMs ?? 0)),
      labelMessage: message("task.detail.artworkMs"),
      valueMessage: null,
    },
    {
      key: "scan.databaseMs",
      value: String(Math.round(counts.timingMs?.databaseMs ?? 0)),
      labelMessage: message("task.detail.databaseMs"),
      valueMessage: null,
    },
    {
      key: "scan.catalogMs",
      value: String(Math.round(counts.timingMs?.catalogMs ?? 0)),
      labelMessage: message("task.detail.catalogMs"),
      valueMessage: null,
    },
  ];
}

export function artworkDetails(counts: {
  source: string;
  total: number;
  retrieved: number;
  missing: number;
  failed: number;
}): TaskDetailResponse[] {
  return [
    {
      key: "source",
      value: counts.source,
      labelMessage: message("task.detail.source"),
      valueMessage: null,
    },
    {
      key: "progress.total",
      value: String(counts.total),
      labelMessage: message("task.detail.artworkItems"),
      valueMessage: null,
    },
    {
      key: "progress.completed",
      value: String(counts.retrieved + counts.missing + counts.failed),
      labelMessage: message("task.detail.processed"),
      valueMessage: null,
    },
    {
      key: "artwork.retrieved",
      value: String(counts.retrieved),
      labelMessage: message("task.detail.artworkRetrieved"),
      valueMessage: null,
    },
    {
      key: "artwork.missing",
      value: String(counts.missing),
      labelMessage: message("task.detail.artworkMissing"),
      valueMessage: null,
    },
    {
      key: "artwork.failed",
      value: String(counts.failed),
      labelMessage: message("task.detail.artworkFailed"),
      valueMessage: null,
    },
  ];
}

export function metadataDetails(
  counts: {
    source: string;
    total: number;
    processed: number;
    matched: number;
    unmatched: number;
    errors: number;
  },
  activeProviderId: string | null = null,
  artistCounts: {
    total: number;
    processed: number;
    matched: number;
    unmatched: number;
    errors: number;
  } | null = null,
): TaskDetailResponse[] {
  const processed = counts.processed + (artistCounts?.processed ?? 0);
  const total = counts.total + (artistCounts?.total ?? 0);
  const details: TaskDetailResponse[] = [
    {
      key: "source",
      value: counts.source,
      labelMessage: message("task.detail.source"),
      valueMessage: null,
    },
    {
      key: "progress.total",
      value: String(total),
      labelMessage: message("task.detail.metadataItems"),
      valueMessage: null,
    },
    {
      key: "progress.completed",
      value: String(processed),
      labelMessage: message("task.detail.processed"),
      valueMessage: null,
    },
    {
      key: "metadata.tracks",
      value: String(counts.total),
      labelMessage: message("task.detail.tracks"),
      valueMessage: null,
    },
    {
      key: "metadata.tracks.processed",
      value: String(counts.processed),
      labelMessage: message("task.detail.tracksProcessed"),
      valueMessage: null,
    },
    {
      key: "metadata.matched",
      value: String(counts.matched),
      labelMessage: message("task.detail.matched"),
      valueMessage: null,
    },
    {
      key: "metadata.unmatched",
      value: String(counts.unmatched),
      labelMessage: message("task.detail.unmatched"),
      valueMessage: null,
    },
    {
      key: "metadata.failed",
      value: String(counts.errors),
      labelMessage: message("task.detail.tracksFailed"),
      valueMessage: null,
    },
  ];
  if (artistCounts) {
    details.push(
      {
        key: "metadata.artists.total",
        value: String(artistCounts.total),
        labelMessage: message("task.detail.artists"),
        valueMessage: null,
      },
      {
        key: "metadata.artists.matched",
        value: String(artistCounts.matched),
        labelMessage: message("task.detail.artistsMatched"),
        valueMessage: null,
      },
      {
        key: "metadata.artists.unmatched",
        value: String(artistCounts.unmatched),
        labelMessage: message("task.detail.artistsUnmatched"),
        valueMessage: null,
      },
      {
        key: "metadata.artists.failed",
        value: String(artistCounts.errors),
        labelMessage: message("task.detail.artistsFailed"),
        valueMessage: null,
      },
    );
  }
  if (activeProviderId) {
    details.push({
      key: TASK_ACTIVE_METADATA_PROVIDER_DETAIL_KEY,
      value: activeProviderId,
      labelMessage: message("task.detail.provider"),
      valueMessage: null,
    });
  }
  return details;
}
