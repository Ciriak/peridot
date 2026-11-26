import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  TASK_ACTIVE_METADATA_PROVIDER_DETAIL_KEY,
  TASK_RELEASE_IMPORT_STAGE_DETAIL_KEY,
  type TaskResponse,
} from "@peridot/contracts";
import {
  activeTaskForMetadataProvider,
  activeTaskForSource,
  activeTaskPercent,
  estimatedRemainingMs,
  estimatedTaskRemainingMs,
  groupedTaskProgress,
  hasRunningLibraryScan,
  orderedActiveTasks,
  overallTaskProgress,
  runningMetadataTask,
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
    connector: null,
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

test("queued artwork follows metadata matching", () => {
  const ordered = orderedActiveTasks([
    task({
      id: "artwork",
      kind: "artwork_fetch",
      status: "queued",
      createdAt: "2026-11-11T10:00:00.000Z",
    }),
    task({
      id: "metadata",
      kind: "metadata_enrichment",
      status: "queued",
      createdAt: "2026-11-11T10:05:00.000Z",
    }),
  ]);
  assert.deepEqual(
    ordered.map((item) => item.id),
    ["metadata", "artwork"],
  );
});

test("active source work prefers the running task for that source", () => {
  const tasks = [
    task({
      id: "queued-source-a",
      status: "queued",
      connector: { kind: null, id: "source-a", name: "A" },
      createdAt: "2026-11-11T10:00:00.000Z",
    }),
    task({
      id: "running-source-b",
      connector: { kind: null, id: "source-b", name: "B" },
      createdAt: "2026-11-11T10:02:00.000Z",
    }),
    task({
      id: "running-source-a",
      connector: { kind: null, id: "source-a", name: "A" },
      createdAt: "2026-11-11T10:03:00.000Z",
    }),
    task({
      id: "completed-source-a",
      status: "completed",
      connector: { kind: null, id: "source-a", name: "A" },
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

test("remaining time requires stable, determinate running progress", () => {
  const now = new Date("2026-11-11T10:00:10.000Z");

  assert.equal(
    estimatedTaskRemainingMs(
      task({
        startedAt: "2026-11-11T10:00:00.000Z",
        progress: { state: "determinate", completed: 5, total: 100 },
      }),
      now,
    ),
    190_000,
  );
  assert.equal(
    estimatedRemainingMs("2026-11-11T10:00:00.000Z", 5, 100, now),
    190_000,
  );
  assert.equal(
    estimatedTaskRemainingMs(
      task({
        status: "queued",
        startedAt: "2026-11-11T10:00:00.000Z",
        progress: { state: "determinate", completed: 5, total: 100 },
      }),
      now,
    ),
    null,
  );
  assert.equal(
    estimatedTaskRemainingMs(
      task({
        startedAt: "2026-11-11T10:00:00.000Z",
        progress: { state: "indeterminate", completed: null, total: null },
      }),
      now,
    ),
    null,
  );
  assert.equal(
    estimatedTaskRemainingMs(
      task({
        startedAt: null,
        progress: { state: "determinate", completed: 5, total: 100 },
      }),
      now,
    ),
    null,
  );
  assert.equal(
    estimatedTaskRemainingMs(
      task({
        startedAt: "2026-11-11T10:00:01.000Z",
        progress: { state: "determinate", completed: 5, total: 100 },
      }),
      now,
    ),
    null,
  );
  assert.equal(
    estimatedTaskRemainingMs(
      task({
        startedAt: "2026-11-11T10:00:00.000Z",
        progress: { state: "determinate", completed: 4, total: 100 },
      }),
      now,
    ),
    null,
  );
  assert.equal(
    estimatedTaskRemainingMs(
      task({
        startedAt: "2026-11-11T10:00:00.000Z",
        progress: { state: "determinate", completed: 100, total: 100 },
      }),
      now,
    ),
    null,
  );
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
      kind: "metadata_enrichment",
      details: providerDetails,
    }),
    task({
      id: "metadata-queued",
      kind: "metadata_enrichment",
      status: "queued",
      details: providerDetails,
    }),
    task({
      id: "metadata-completed",
      kind: "metadata_enrichment",
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

test("running metadata work is represented by one shared task", () => {
  const tasks = [
    task({
      id: "metadata-queued",
      kind: "metadata_enrichment",
      status: "queued",
    }),
    task({
      id: "metadata-running",
      kind: "metadata_enrichment",
      status: "running",
    }),
  ];

  assert.equal(runningMetadataTask(tasks)?.id, "metadata-running");
  assert.equal(runningMetadataTask([tasks[0]!]), null);
  assert.equal(runningMetadataTask([]), null);
});

test("only a running library scan marks catalog results as updating", () => {
  assert.equal(hasRunningLibraryScan([task()]), true);
  assert.equal(
    hasRunningLibraryScan([
      task({ status: "queued" }),
      task({ id: "metadata", kind: "metadata_enrichment" }),
      task({ id: "completed", status: "completed" }),
    ]),
    false,
  );
  assert.equal(hasRunningLibraryScan([]), false);
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
    taskStatusMessage(task({ status: "waiting" })).key,
    "settings.tasks.status.waiting",
  );
  assert.equal(activeTaskPercent(task({ status: "waiting" })), (8 / 12) * 100);
  assert.equal(
    taskStatusMessage(
      task({
        status: "completed",
        failureMessage: { key: "api.message.taskCompletedWithErrors" },
      }),
    ).key,
    "settings.tasks.status.completedWithErrors",
  );
  assert.equal(
    taskStatusMessage(task({ status: "failed" })).key,
    "settings.tasks.status.failed",
  );
  assert.equal(
    taskStatusMessage(task({ status: "interrupted" })).key,
    "settings.tasks.status.interrupted",
  );
  assert.equal(
    taskStatusMessage(task({ status: "stopped" })).key,
    "settings.tasks.status.stopped",
  );
  assert.deepEqual(taskProgressMessage(task()), {
    key: "settings.tasks.progress",
    params: { percent: 67, completed: 8, total: 12 },
  });
  assert.deepEqual(
    taskProgressMessage(
      task({
        kind: "release_import",
        status: "waiting",
        details: [
          {
            key: TASK_RELEASE_IMPORT_STAGE_DETAIL_KEY,
            value: "downloading",
            labelMessage: { key: "task.detail.releaseStage" },
            valueMessage: { key: "task.releaseStage.downloading" },
          },
        ],
      }),
    ),
    {
      key: "settings.tasks.percent",
      params: { percent: 67 },
    },
  );
  assert.deepEqual(
    taskProgressMessage(
      task({
        kind: "release_import",
        status: "waiting",
        details: [
          {
            key: TASK_RELEASE_IMPORT_STAGE_DETAIL_KEY,
            value: "addingToLibrary",
            labelMessage: { key: "task.detail.releaseStage" },
            valueMessage: { key: "task.releaseStage.addingToLibrary" },
          },
        ],
      }),
    ),
    {
      key: "settings.tasks.progress",
      params: { percent: 67, completed: 8, total: 12 },
    },
  );
  assert.deepEqual(
    taskProgressMessage(
      task({
        progress: { state: "indeterminate", completed: null, total: null },
      }),
    ),
    { key: "settings.tasks.progressIndeterminate" },
  );
});

test("waiting release imports are active determinate work", () => {
  const waiting = task({
    id: "release",
    kind: "release_import",
    status: "waiting",
    ownerUserId: "user",
  });
  assert.deepEqual(
    orderedActiveTasks([
      task({ id: "queued", status: "queued" }),
      waiting,
      task({ id: "running", status: "running" }),
    ]).map((entry) => entry.id),
    ["running", "release", "queued"],
  );
  assert.equal(activeTaskPercent(waiting), (8 / 12) * 100);
  assert.equal(overallTaskProgress([waiting]), (8 / 12) * 100);
});

test("task history renders partial completion with a completed warning", async () => {
  const page = await readFile(
    new URL("../app/pages/settings/tasks.vue", import.meta.url),
    "utf8",
  );

  assert.match(
    page,
    /task\.status === "completed" && task\.failureMessage[\s\S]*?"completed_with_errors"/,
  );
  assert.match(page, /taskFailureMessageClass\(row\)/);
  assert.match(page, /:class="taskFailureMessageClass\(row\)"/);
});

test("queued-only task groups render empty instead of spinning", () => {
  assert.equal(
    groupedTaskProgress([
      { progress: 0, running: false },
      { progress: 0, running: false },
    ]),
    0,
  );
  assert.equal(groupedTaskProgress([]), null);
  assert.equal(
    groupedTaskProgress([
      { progress: 50, running: true },
      { progress: 0, running: false },
    ]),
    25,
  );
  assert.equal(
    groupedTaskProgress([
      { progress: 50, running: true },
      { progress: null, running: true },
    ]),
    null,
  );
});

test("task progress returns to the desktop application top bar", async () => {
  const [layout, settingsLayout, indicator, connectionIndicator] =
    await Promise.all([
      readFile(new URL("../app/layouts/default.vue", import.meta.url), "utf8"),
      readFile(new URL("../app/layouts/settings.vue", import.meta.url), "utf8"),
      readFile(
        new URL("../app/components/TaskProgressIndicator.vue", import.meta.url),
        "utf8",
      ),
      readFile(
        new URL(
          "../app/components/ServerConnectionIndicator.vue",
          import.meta.url,
        ),
        "utf8",
      ),
    ]);
  const header = layout.slice(
    layout.indexOf("<header"),
    layout.indexOf("</header>"),
  );
  const settingsHeader = settingsLayout.slice(
    settingsLayout.indexOf("<header"),
    settingsLayout.indexOf("</header>"),
  );

  assert.match(
    header,
    /class="hidden md:flex"\s*>\s*<TaskProgressIndicator \/>/,
    "The task spinner is limited to the desktop top bar",
  );
  assert.doesNotMatch(settingsLayout, /TaskProgressIndicator/);
  assert.match(header, /<ServerConnectionIndicator \/>/);
  assert.doesNotMatch(
    settingsHeader,
    /ProgressCircle|settings\/tasks#active-tasks/,
  );
  assert.match(settingsHeader, /<ServerConnectionIndicator \/>/);
  assert.match(indicator, /useTasks/);
  assert.match(indicator, /useOfflineDownloadTasks/);
  assert.match(indicator, /<ProgressCircle/);
  assert.match(
    indicator,
    /<NuxtLink[\s\S]*?to="\/settings\/tasks#active-tasks"/,
  );
  assert.match(indicator, /:value="overallProgress"/);
  assert.match(indicator, /orderedActiveTasks\(visibleServerTasks\.value\)/);
  assert.match(indicator, /task\.kind === "release_import"/);
  assert.match(indicator, /task\.ownerUserId === user\.value\?\.id/);
  assert.match(indicator, /downloadTasks\s*\.orderedTasks\(\)/);
  assert.doesNotMatch(
    indicator,
    /ServerConnectionIndicator|useServerConnection/,
  );
  assert.doesNotMatch(
    connectionIndicator,
    /ProgressCircle|useTasks|useOfflineDownloadTasks/,
  );
});
