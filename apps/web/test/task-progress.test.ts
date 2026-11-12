import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  TASK_ACTIVE_METADATA_PROVIDER_DETAIL_KEY,
  type TaskResponse,
} from "@peridot/contracts";
import {
  activeTaskForMetadataProvider,
  activeTaskForSource,
  activeTaskPercent,
  orderedActiveTasks,
  overallTaskProgress,
  sourceTaskProgress,
  taskProgressMessage,
  taskStatusMessage,
} from "../app/lib/task-progress.ts";

function task(overrides: Partial<TaskResponse> = {}): TaskResponse {
  return {
    id: "task-1",
    kind: "library_scan",
    status: "running",
    titleMessage: { key: "task.title.libraryScan" },
    parentTaskId: null,
    source: null,
    progress: { state: "determinate", completed: 8, total: 12 },
    details: [],
    failureMessage: null,
    createdAt: "2026-11-11T10:00:00.000Z",
    startedAt: "2026-11-11T10:00:01.000Z",
    completedAt: null,
    ...overrides,
  };
}

test("active tasks put running work first and queued work in FIFO order", () => {
  const ordered = orderedActiveTasks([
    task({
      id: "queued-newer",
      status: "queued",
      createdAt: "2026-11-11T10:03:00.000Z",
    }),
    task({
      id: "completed",
      status: "completed",
      createdAt: "2026-11-11T09:00:00.000Z",
    }),
    task({
      id: "running",
      createdAt: "2026-11-11T10:04:00.000Z",
    }),
    task({
      id: "queued-older",
      status: "queued",
      createdAt: "2026-11-11T10:01:00.000Z",
    }),
  ]);

  assert.deepEqual(
    ordered.map((item) => item.id),
    ["running", "queued-older", "queued-newer"],
  );
});

test("active source work prefers the running task for that source", () => {
  const tasks = [
    task({
      id: "queued-source-a",
      status: "queued",
      source: { id: "source-a", name: "A" },
      createdAt: "2026-11-11T10:00:00.000Z",
    }),
    task({
      id: "running-source-b",
      source: { id: "source-b", name: "B" },
      createdAt: "2026-11-11T10:02:00.000Z",
    }),
    task({
      id: "running-source-a",
      source: { id: "source-a", name: "A" },
      createdAt: "2026-11-11T10:03:00.000Z",
    }),
    task({
      id: "completed-source-a",
      status: "completed",
      source: { id: "source-a", name: "A" },
      createdAt: "2026-11-11T10:04:00.000Z",
    }),
  ];

  assert.equal(activeTaskForSource(tasks, "source-a")?.id, "running-source-a");
  assert.equal(activeTaskForSource(tasks, "source-b")?.id, "running-source-b");
  assert.equal(activeTaskForSource(tasks, "missing"), null);
});

test("queued source work renders as indeterminate progress", () => {
  assert.equal(sourceTaskProgress(task({ status: "queued" })), null);
  assert.equal(sourceTaskProgress(task()), 66.66666666666666);
});

test("metadata progress is attached only to the provider being fetched", () => {
  const providerDetails = [
    {
      key: TASK_ACTIVE_METADATA_PROVIDER_DETAIL_KEY,
      value: "provider-a",
      labelMessage: { key: "task.detail.provider" },
      valueMessage: null,
    },
  ];
  const tasks = [
    task({
      id: "metadata-running",
      kind: "metadata_fetch",
      details: providerDetails,
    }),
    task({
      id: "metadata-queued",
      kind: "metadata_fetch",
      status: "queued",
      details: providerDetails,
    }),
    task({
      id: "metadata-completed",
      kind: "metadata_fetch",
      status: "completed",
      details: providerDetails,
    }),
  ];

  assert.equal(
    activeTaskForMetadataProvider(tasks, "provider-a")?.id,
    "metadata-running",
  );
  assert.equal(activeTaskForMetadataProvider(tasks, "provider-b"), null);
});

test("overall progress averages the running percentage with queued tasks at zero", () => {
  const tasks = [
    task(),
    task({ id: "queued-1", status: "queued" }),
    task({ id: "queued-2", status: "queued" }),
  ];

  const progress = overallTaskProgress(tasks);
  assert.ok(progress !== null);
  assert.ok(Math.abs(progress - 22.222_222_222_222_22) < 0.000_001);
});

test("queued-only work is indeterminate and a zero-total running task is complete", () => {
  assert.equal(
    overallTaskProgress([
      task({ id: "queued-1", status: "queued" }),
      task({ id: "queued-2", status: "queued" }),
    ]),
    null,
  );
  assert.equal(
    overallTaskProgress([
      task({
        progress: { state: "determinate", completed: 0, total: 0 },
      }),
      task({ id: "queued", status: "queued" }),
    ]),
    50,
  );
});

test("indeterminate running work makes overall progress indeterminate", () => {
  const indeterminate = task({
    progress: { state: "indeterminate", completed: null, total: null },
  });
  assert.equal(activeTaskPercent(indeterminate), null);
  assert.equal(overallTaskProgress([indeterminate]), null);
  assert.equal(overallTaskProgress([]), null);
  assert.equal(
    overallTaskProgress([
      task({ id: "completed", status: "completed" }),
      task({ id: "failed", status: "failed" }),
    ]),
    null,
  );
});

test("task labels distinguish queued, determinate, and indeterminate work", () => {
  assert.equal(
    taskProgressMessage(task({ status: "queued" })).key,
    "settings.tasks.progressWaiting",
  );
  assert.equal(
    taskStatusMessage(task({ status: "completed" })).key,
    "settings.tasks.status.completed",
  );
  assert.equal(
    taskStatusMessage(task({ status: "failed" })).key,
    "settings.tasks.status.failed",
  );
  assert.equal(
    taskStatusMessage(task({ status: "interrupted" })).key,
    "settings.tasks.status.interrupted",
  );
  assert.deepEqual(taskProgressMessage(task()), {
    key: "settings.tasks.progress",
    params: { percent: 67, completed: 8, total: 12 },
  });
  assert.deepEqual(
    taskProgressMessage(
      task({
        progress: { state: "indeterminate", completed: null, total: null },
      }),
    ),
    { key: "settings.tasks.progressIndeterminate" },
  );
});

test("the topbar shares connection loss and exposes task progress to admins", async () => {
  const [layout, indicator] = await Promise.all([
    readFile(new URL("../app/layouts/default.vue", import.meta.url), "utf8"),
    readFile(
      new URL("../app/components/TaskProgressIndicator.vue", import.meta.url),
      "utf8",
    ),
  ]);

  assert.match(layout, /<TaskProgressIndicator \/>/);
  assert.doesNotMatch(layout, /Fetching metadata/);
  assert.match(indicator, /useServerConnection/);
  assert.match(indicator, /useUser/);
  assert.match(
    indicator,
    /canViewTaskProgress = computed\(\(\) => user\.value\?\.role === "admin"\)/,
  );
  assert.match(
    indicator,
    /topbarStatus\(connectionStatus\.value, hasActiveTasks\.value\)/,
  );
  assert.match(indicator, /v-if="status === 'connection-lost'"/);
  assert.match(
    indicator,
    /v-else-if="canViewTaskProgress && status === 'task-progress'"/,
  );
  assert.match(indicator, /:icon="icons\.cloudOff"/);
  assert.match(indicator, /text-destructive/);
  assert.match(indicator, /motion-safe:animate-pulse/);
  assert.match(indicator, /t\('components\.taskProgress\.connectionLost'\)/);
  assert.match(indicator, /<TooltipTrigger as-child>/);
  assert.match(indicator, /<NuxtLink\s+to="\/settings\/tasks"/);
  assert.match(indicator, /t\('components\.taskProgress\.open'\)/);
  assert.match(indicator, /:value="overallProgress"/);
  assert.match(indicator, /overallTaskProgress\(taskRows\.value\)/);
  assert.match(indicator, /orderedActiveTasks\(activeTasks\.value\)/);
  assert.match(indicator, /taskStatusMessage\(task\)/);
  assert.match(indicator, /taskProgressMessage\(task\)/);
  assert.match(indicator, /max-h-64[\s\S]*?overflow-y-auto/);
});
