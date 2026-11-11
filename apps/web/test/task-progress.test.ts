import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import type { TaskResponse } from "@peridot/contracts";
import {
  activeTaskPercent,
  orderedActiveTasks,
  overallTaskProgress,
  taskProgressLabel,
  taskStatusLabel,
} from "../app/lib/task-progress.ts";

function task(overrides: Partial<TaskResponse> = {}): TaskResponse {
  return {
    id: "task-1",
    kind: "library_scan",
    status: "running",
    title: "Library scan",
    parentTaskId: null,
    source: null,
    progress: { state: "determinate", completed: 8, total: 12 },
    details: [],
    failureSummary: null,
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
    taskProgressLabel(task({ status: "queued" })),
    "Waiting to start",
  );
  assert.equal(taskStatusLabel(task({ status: "completed" })), "Completed");
  assert.equal(taskStatusLabel(task({ status: "failed" })), "Failed");
  assert.equal(taskStatusLabel(task({ status: "interrupted" })), "Interrupted");
  assert.equal(taskProgressLabel(task()), "67% (8 of 12)");
  assert.equal(
    taskProgressLabel(
      task({
        progress: { state: "indeterminate", completed: null, total: null },
      }),
    ),
    "In progress",
  );
});

test("the topbar prioritizes lost connections and exposes active tasks through a focusable tooltip", async () => {
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
  assert.match(
    indicator,
    /topbarStatus\(connectionStatus\.value, hasActiveTasks\.value\)/,
  );
  assert.match(indicator, /v-if="status === 'connection-lost'"/);
  assert.match(indicator, /v-else-if="status === 'task-progress'"/);
  assert.match(indicator, /:icon="icons\.cloudOff"/);
  assert.match(indicator, /text-destructive/);
  assert.match(indicator, /motion-safe:animate-pulse/);
  assert.match(indicator, /aria-label="Server connection lost"/);
  assert.match(indicator, /<TooltipTrigger as-child>/);
  assert.match(indicator, /<NuxtLink\s+to="\/settings\/tasks"/);
  assert.match(indicator, /aria-label="Open task activity"/);
  assert.match(indicator, /:value="overallProgress"/);
  assert.match(indicator, /overallTaskProgress\(taskRows\.value\)/);
  assert.match(indicator, /orderedActiveTasks\(activeTasks\.value\)/);
  assert.match(indicator, /taskStatusLabel\(task\)/);
  assert.match(indicator, /taskProgressLabel\(task\)/);
  assert.match(indicator, /max-h-64[\s\S]*?overflow-y-auto/);
});
