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
  "queued",
  "running",
];

export const TERMINAL_TASK_STATUSES: readonly TaskStatus[] = [
  "completed",
  "failed",
  "interrupted",
];

const MAX_DETAILS = 16;
const MAX_DETAIL_KEY_LENGTH = 80;
const MAX_DETAIL_VALUE_LENGTH = 300;
const MAX_TITLE_LENGTH = 160;
const MAX_FAILURE_SUMMARY_LENGTH = 500;
const TERMINAL_TASK_LIMIT = 500;
const TERMINAL_TASK_AGE_MS = 30 * 24 * 60 * 60 * 1000;
const PLUGIN_TASK_KIND =
  /^plugin:[a-z0-9][a-z0-9._-]{0,63}:[a-z0-9][a-z0-9._-]{0,63}$/;

export interface EnqueueTaskInput {
  kind: TaskKind;
  title: string;
  titleMessage?: MessageDescriptor | null;
  parentTaskId?: string | null;
  sourceId?: string | null;
  sourceName?: string | null;
  details?: TaskDetailResponse[];
  forceRefresh?: boolean;
}

export interface TaskExecutionResult {
  details?: TaskDetailResponse[];
  failureSummary?: string | null;
}

export type TaskExecutor = (
  task: TaskRow,
  tasks: TaskService,
) => Promise<TaskExecutionResult | void>;

export type TaskChangePublisher = (task: TaskResponse) => void;

export class TaskExecutionError extends Error {
  constructor(
    message: string,
    readonly status: "failed" | "interrupted" = "failed",
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
      : task.kind === "metadata_fetch"
        ? task.sourceName
          ? message("task.title.sourceMetadataMatch", {
              source: task.sourceName,
            })
          : message("task.title.metadataMatch")
        : message("task.title.plugin", { task: task.title }));
  return {
    id: task.id,
    kind: task.kind as TaskKind,
    status: task.status as TaskStatus,
    titleMessage,
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
    value === "metadata_fetch" ||
    PLUGIN_TASK_KIND.test(value)
  );
}

function activeRank(status: string): number {
  if (status === "running") return 0;
  if (status === "queued") return 1;
  return 2;
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
  private admissionTail: Promise<unknown> = Promise.resolve();
  private drainPromise: Promise<void> | null = null;
  private stopping = false;
  private readonly eventTimers = new Map<
    string,
    ReturnType<typeof setTimeout>
  >();

  constructor(
    private readonly database: Database,
    private readonly publisher?: TaskChangePublisher,
  ) {}

  registerExecutor(kind: TaskKind, executor: TaskExecutor): void {
    if (!isTaskKind(kind)) {
      throw new Error(`Invalid task kind: ${kind}`);
    }
    this.executors.set(kind, executor);
  }

  async initialize(): Promise<void> {
    const now = new Date();
    await this.database.orm.Task.where({ status: "running" }).updateAndCount({
      status: "interrupted",
      completedAt: now,
      failureSummary: "The server stopped before this task completed.",
      failureMessage: serializeMessage(message("api.message.taskInterrupted")),
    });
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
      const queued = await this.database.orm.Task.where({
        kind: input.kind,
        status: "queued",
        forceRefresh,
      }).all();
      const duplicate = queued.find(
        (task) => task.sourceId === normalizedSourceId,
      );
      if (duplicate) return duplicate;

      const task = await this.database.orm.Task.create({
        kind: input.kind,
        status: "queued",
        title,
        titleMessage: serializeMessage(input.titleMessage),
        parentTaskId: input.parentTaskId ?? null,
        sourceId: normalizedSourceId,
        sourceName: input.sourceName
          ? boundedText(input.sourceName, MAX_TITLE_LENGTH)
          : null,
        details: JSON.stringify(normalizeTaskDetails(input.details)),
        forceRefresh,
      });
      this.kick();
      this.publishTask(task.id, true);
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
      if (status === "active") return activeRank(task.status) < 2;
      if (status === "terminal") return activeRank(task.status) === 2;
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
    await this.database.orm.Task.where({ id, status: "running" }).update(
      update,
    );
    this.publishTask(id);
  }

  async complete(id: string, result: TaskExecutionResult = {}): Promise<void> {
    const update: {
      status: string;
      completedAt: Date;
      failureSummary: string | null;
      failureMessage?: string | null;
      details?: string;
      progressCompleted?: number | null;
      progressTotal?: number | null;
    } = {
      status: "completed",
      completedAt: new Date(),
      failureSummary: result.failureSummary
        ? boundedText(result.failureSummary, MAX_FAILURE_SUMMARY_LENGTH)
        : null,
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
    this.publishTask(id, true);
  }

  async fail(
    id: string,
    failureSummary: string,
    status: "failed" | "interrupted" = "failed",
    messageDescriptor?: MessageDescriptor,
  ): Promise<void> {
    await this.database.orm.Task.where({ id }).update({
      status,
      completedAt: new Date(),
      failureSummary: boundedText(failureSummary, MAX_FAILURE_SUMMARY_LENGTH),
      failureMessage: serializeMessage(messageDescriptor),
    });
    this.publishTask(id, true);
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
    await this.admissionTail;
    await this.drainPromise;
  }

  private publishTask(id: string, immediate = false) {
    if (!this.publisher) return;
    if (immediate) {
      const timer = this.eventTimers.get(id);
      if (timer) clearTimeout(timer);
      this.eventTimers.delete(id);
      void this.emitTask(id);
      return;
    }
    if (this.eventTimers.has(id)) return;
    const timer = setTimeout(() => {
      this.eventTimers.delete(id);
      void this.emitTask(id);
    }, 250);
    timer.unref?.();
    this.eventTimers.set(id, timer);
  }

  private async emitTask(id: string) {
    if (!this.publisher) return;
    const task = await this.database.orm.Task.first({ id });
    if (task) this.publisher(toTaskResponse(task));
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
    const queued = await this.database.orm.Task.where({ status: "queued" })
      .orderBy((task) => task.createdAt.asc())
      .all();
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
      const queued = await this.database.orm.Task.where({ status: "queued" })
        .orderBy([(row) => row.createdAt.asc(), (row) => row.id.asc()])
        .all();
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
        if (parent.status === "failed" || parent.status === "interrupted") {
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

      try {
        const result = await executor(running, this);
        const current = await this.database.orm.Task.first({ id: running.id });
        if (current?.status === "running") {
          await this.complete(running.id, result ?? {});
        }
      } catch (error) {
        const current = await this.database.orm.Task.first({ id: running.id });
        if (current?.status === "running") {
          const failure =
            error instanceof TaskExecutionError
              ? error
              : new TaskExecutionError(
                  "The task could not be completed.",
                  "failed",
                  message("api.message.taskFailedGeneric"),
                );
          await this.fail(
            running.id,
            failure.message,
            failure.status,
            failure.messageDescriptor,
          );
        }
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

export function scanDetails(counts: {
  source: string;
  discovered: number;
  created: number;
  updated: number;
  unchanged: number;
  unavailable: number;
  errors: number;
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
): TaskDetailResponse[] {
  const details: TaskDetailResponse[] = [
    {
      key: "source",
      value: counts.source,
      labelMessage: message("task.detail.source"),
      valueMessage: null,
    },
    {
      key: "progress.total",
      value: String(counts.total),
      labelMessage: message("task.detail.tracks"),
      valueMessage: null,
    },
    {
      key: "progress.completed",
      value: String(counts.processed),
      labelMessage: message("task.detail.processed"),
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
