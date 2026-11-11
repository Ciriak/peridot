import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";
import type { TaskResponse } from "@peridot/contracts";
import { createMemberSession, createTestContext } from "./helpers.js";
import {
  normalizeTaskDetails,
  TaskService,
  toTaskResponse,
} from "../src/tasks.js";

function delay(milliseconds = 10): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function waitForStatus(
  tasks: TaskService,
  id: string,
  status: string,
): Promise<void> {
  for (let attempt = 0; attempt < 300; attempt += 1) {
    if ((await tasks.get(id))?.status === status) return;
    await delay();
  }
  throw new Error(`Task ${id} did not reach ${status}`);
}

test("tasks authenticate list access and reject invalid pagination", async () => {
  const context = await createTestContext();
  const member = await createMemberSession(context);
  try {
    const adminList = await context.app.inject({
      method: "GET",
      url: "/api/tasks?status=active&limit=25&offset=0",
      headers: context.authorization,
    });
    assert.equal(adminList.statusCode, 200);
    assert.deepEqual(adminList.json(), {
      items: [],
      activeCount: 0,
      queuedCount: 0,
    });

    const memberList = await context.app.inject({
      method: "GET",
      url: "/api/tasks",
      headers: member,
    });
    assert.equal(memberList.statusCode, 200);

    const anonymous = await context.app.inject({
      method: "GET",
      url: "/api/tasks",
    });
    assert.equal(anonymous.statusCode, 401);

    for (const url of [
      "/api/tasks?status=unknown",
      "/api/tasks?limit=0",
      "/api/tasks?limit=101",
      "/api/tasks?offset=-1",
    ]) {
      const response = await context.app.inject({
        method: "GET",
        url,
        headers: context.authorization,
      });
      assert.equal(response.statusCode, 400);
    }

    const genericCreate = await context.app.inject({
      method: "POST",
      url: "/api/tasks",
      headers: context.authorization,
      payload: {
        kind: "plugin:test:untrusted",
        title: "Should not be accepted",
      },
    });
    assert.equal(genericCreate.statusCode, 404);
  } finally {
    await context.close();
  }
});

test("task service runs FIFO, coalesces queued duplicates, and reports progress", async () => {
  const context = await createTestContext();
  await context.app.close();
  const tasks = new TaskService(context.database);
  const events: string[] = [];
  let releaseBlocker!: () => void;
  let releaseProgress!: () => void;
  const blocker = new Promise<void>((resolve) => {
    releaseBlocker = resolve;
  });
  const progress = new Promise<void>((resolve) => {
    releaseProgress = resolve;
  });
  let indeterminateSeen!: () => void;
  let determinateSeen!: () => void;
  const sawIndeterminate = new Promise<void>((resolve) => {
    indeterminateSeen = resolve;
  });
  const sawDeterminate = new Promise<void>((resolve) => {
    determinateSeen = resolve;
  });

  tasks.registerExecutor("plugin:test:blocker", async (task) => {
    events.push(`start:${task.id}`);
    await blocker;
    events.push(`finish:${task.id}`);
  });
  tasks.registerExecutor("plugin:test:coalesced", async (task) => {
    events.push(`start:${task.id}`);
    await delay();
    events.push(`finish:${task.id}`);
  });
  tasks.registerExecutor("plugin:test:progress", async (task, service) => {
    events.push(`start:${task.id}`);
    await service.updateProgress(task.id, null, null);
    indeterminateSeen();
    await progress;
    await service.updateProgress(task.id, 1, 2);
    determinateSeen();
    return {
      details: [
        { key: "plugin.item", label: "Item", value: "one" },
        { key: "progress.completed", label: "Processed", value: "1" },
        { key: "progress.total", label: "Total", value: "2" },
      ],
    };
  });
  await tasks.initialize();

  try {
    const blockerTask = await tasks.enqueue({
      kind: "plugin:test:blocker",
      title: "Blocking task",
    });
    await waitForStatus(tasks, blockerTask.id, "running");

    const [first, duplicate] = await Promise.all([
      tasks.enqueue({
        kind: "plugin:test:coalesced",
        title: "Coalesced task",
        sourceId: "source-1",
        sourceName: "Music",
      }),
      tasks.enqueue({
        kind: "plugin:test:coalesced",
        title: "Coalesced task",
        sourceId: "source-1",
        sourceName: "Music",
      }),
    ]);
    assert.equal(first.id, duplicate.id);

    const progressTask = await tasks.enqueue({
      kind: "plugin:test:progress",
      title: "Progress task",
    });
    const queuedList = await tasks.list("active");
    assert.equal(queuedList.items[0]?.id, blockerTask.id);
    assert.deepEqual(
      new Set(queuedList.items.map((task) => task.id)),
      new Set([blockerTask.id, first.id, progressTask.id]),
    );
    assert.equal(queuedList.activeCount, 3);
    assert.equal(queuedList.queuedCount, 2);

    releaseBlocker();
    await waitForStatus(tasks, progressTask.id, "running");
    await sawIndeterminate;
    const indeterminate = toTaskResponse((await tasks.get(progressTask.id))!);
    assert.deepEqual(indeterminate.progress, {
      state: "indeterminate",
      completed: null,
      total: null,
    });

    releaseProgress();
    await sawDeterminate;
    const determinate = toTaskResponse((await tasks.get(progressTask.id))!);
    assert.deepEqual(determinate.progress, {
      state: "determinate",
      completed: 1,
      total: 2,
    });

    await waitForStatus(tasks, progressTask.id, "completed");
    await waitForStatus(tasks, first.id, "completed");
    assert.deepEqual(events, [
      `start:${blockerTask.id}`,
      `finish:${blockerTask.id}`,
      `start:${first.id}`,
      `finish:${first.id}`,
      `start:${progressTask.id}`,
    ]);
    const completed = toTaskResponse((await tasks.get(progressTask.id))!);
    assert.equal(completed.kind, "plugin:test:progress");
    assert.equal(completed.details[0]?.value, "one");
  } finally {
    releaseBlocker();
    releaseProgress();
    await tasks.close();
    await context.close();
  }
});

test("terminal task history is bounded to thirty days and five hundred rows", async () => {
  const context = await createTestContext();
  await context.app.close();
  const tasks = new TaskService(context.database);
  try {
    const oldCompletedAt = new Date(Date.now() - 31 * 24 * 60 * 60 * 1000);
    const old = await context.database.orm.Task.create({
      kind: "plugin:test:history",
      status: "completed",
      title: "Old task",
      completedAt: oldCompletedAt,
    });
    for (let index = 0; index < 505; index += 1) {
      await context.database.orm.Task.create({
        kind: "plugin:test:history",
        status: "completed",
        title: `Task ${index}`,
        completedAt: new Date(),
      });
    }
    await tasks.prune();
    assert.equal(await tasks.get(old.id), null);
    const remaining = await context.database.orm.Task.where({
      status: "completed",
    }).all();
    assert.equal(remaining.length, 500);
  } finally {
    await tasks.close();
    await context.close();
  }
});

test("queued child tasks do not run after an interrupted parent", async () => {
  const context = await createTestContext();
  await context.app.close();
  const tasks = new TaskService(context.database);
  try {
    const parent = await context.database.orm.Task.create({
      kind: "library_scan",
      status: "interrupted",
      title: "Interrupted scan",
      completedAt: new Date(),
      failureSummary: "The server stopped before this task completed.",
    });
    const child = await context.database.orm.Task.create({
      kind: "metadata_fetch",
      status: "queued",
      title: "Blocked metadata",
      parentTaskId: parent.id,
    });
    await tasks.initialize();
    await waitForStatus(tasks, child.id, "interrupted");
    assert.equal(
      (await tasks.get(child.id))?.failureSummary,
      "The parent task did not complete successfully.",
    );
  } finally {
    await tasks.close();
    await context.close();
  }
});

test("plugin task details have fixed count and field bounds", () => {
  const details = normalizeTaskDetails(
    Array.from({ length: 20 }, (_, index) => ({
      key: `plugin.detail.${index}`,
      label: `Label ${index}`,
      value: "x".repeat(400),
    })),
  );
  assert.equal(details.length, 16);
  assert.equal(details[0]?.value.length, 300);
});

test("plugin task details are bounded and source paths are not exposed", async () => {
  const context = await createTestContext();
  try {
    const privatePath = path.join(context.root, "private-source");
    await mkdir(privatePath);
    const created = await context.app.inject({
      method: "POST",
      url: "/api/admin/sources",
      headers: context.authorization,
      payload: {
        kind: "path",
        path: privatePath,
      },
    });
    assert.equal(created.statusCode, 201);
    const task = created.json<{ task: TaskResponse }>().task;
    assert.equal(task.kind, "library_scan");
    assert.equal(task.status, "queued");
    assert.equal(task.source?.name, "private-source");
    assert.equal(JSON.stringify(task).includes(privatePath), false);
  } finally {
    await context.close();
  }
});
