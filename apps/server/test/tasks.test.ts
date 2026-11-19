import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";
import {
  TASK_ACTIVE_METADATA_PROVIDER_DETAIL_KEY,
  type TaskResponse,
} from "@peridot/contracts";
import { createMemberSession, createTestContext } from "./helpers.js";
import {
  MAX_TASK_RETRIES,
  metadataDetails,
  normalizeTaskDetails,
  TaskService,
  toTaskResponse,
} from "../src/tasks.js";
import { message } from "../src/messages.js";

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
        kind: "unsupported_task",
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

  tasks.registerExecutor("catalog_fetch", async (task) => {
    events.push(`start:${task.id}`);
    await blocker;
    events.push(`finish:${task.id}`);
  });
  tasks.registerExecutor("metadata_fetch", async (task) => {
    events.push(`start:${task.id}`);
    await delay();
    events.push(`finish:${task.id}`);
  });
  tasks.registerExecutor("artwork_fetch", async (task, service) => {
    events.push(`start:${task.id}`);
    await service.updateProgress(task.id, null, null);
    indeterminateSeen();
    await progress;
    await service.updateProgress(task.id, 1, 2);
    determinateSeen();
    return {
      details: [
        {
          key: "source.item",
          value: "one",
          labelMessage: message("task.detail.added"),
          valueMessage: null,
        },
        {
          key: "progress.completed",
          value: "1",
          labelMessage: message("task.detail.processed"),
          valueMessage: null,
        },
        {
          key: "progress.total",
          value: "2",
          labelMessage: message("task.detail.files"),
          valueMessage: null,
        },
      ],
    };
  });
  await tasks.initialize();

  try {
    const blockerTask = await tasks.enqueue({
      kind: "catalog_fetch",
      title: "Blocking task",
    });
    await waitForStatus(tasks, blockerTask.id, "running");

    const [first, duplicate] = await Promise.all([
      tasks.enqueue({
        kind: "metadata_fetch",
        title: "Coalesced task",
        sourceId: "source-1",
        sourceName: "Music",
      }),
      tasks.enqueue({
        kind: "metadata_fetch",
        title: "Coalesced task",
        sourceId: "source-1",
        sourceName: "Music",
      }),
    ]);
    assert.equal(first.id, duplicate.id);

    const progressTask = await tasks.enqueue({
      kind: "artwork_fetch",
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
    assert.equal(completed.kind, "artwork_fetch");
    assert.equal(completed.details[0]?.value, "one");
  } finally {
    releaseBlocker();
    releaseProgress();
    await tasks.close();
    await context.close();
  }
});

test("scans, metadata, and catalog projection run before artwork retrieval", async () => {
  const context = await createTestContext();
  await context.app.close();
  const tasks = new TaskService(context.database);
  const events: string[] = [];
  let releaseScan!: () => void;
  const scanGate = new Promise<void>((resolve) => {
    releaseScan = resolve;
  });
  tasks.registerExecutor("library_scan", async (task) => {
    events.push(`start:${task.kind}`);
    await scanGate;
    events.push(`finish:${task.kind}`);
  });
  tasks.registerExecutor("metadata_fetch", async (task) => {
    events.push(`start:${task.kind}`);
    events.push(`finish:${task.kind}`);
  });
  tasks.registerExecutor("catalog_fetch", async (task) => {
    events.push(`start:${task.kind}`);
    events.push(`finish:${task.kind}`);
  });
  tasks.registerExecutor("artwork_fetch", async (task) => {
    events.push(`start:${task.kind}`);
    events.push(`finish:${task.kind}`);
  });
  await tasks.initialize();

  try {
    const scan = await tasks.enqueue({
      kind: "library_scan",
      title: "Scan",
    });
    await waitForStatus(tasks, scan.id, "running");
    const artwork = await tasks.enqueue({
      kind: "artwork_fetch",
      title: "Artwork",
    });
    const metadata = await tasks.enqueue({
      kind: "metadata_fetch",
      title: "Metadata",
    });
    const catalog = await tasks.enqueue({
      kind: "catalog_fetch",
      title: "Catalog",
    });

    releaseScan();
    await waitForStatus(tasks, metadata.id, "completed");
    await waitForStatus(tasks, catalog.id, "completed");
    await waitForStatus(tasks, artwork.id, "completed");
    assert.deepEqual(events, [
      "start:library_scan",
      "finish:library_scan",
      "start:metadata_fetch",
      "finish:metadata_fetch",
      "start:catalog_fetch",
      "finish:catalog_fetch",
      "start:artwork_fetch",
      "finish:artwork_fetch",
    ]);
  } finally {
    releaseScan();
    await tasks.close();
    await context.close();
  }
});

test("queued tasks are removed and running tasks are stopped", async () => {
  const context = await createTestContext();
  await context.app.close();
  const tasks = new TaskService(context.database);
  const events: string[] = [];
  let started!: () => void;
  let aborted!: () => void;
  const sawStart = new Promise<void>((resolve) => {
    started = resolve;
  });
  const sawAbort = new Promise<void>((resolve) => {
    aborted = resolve;
  });
  tasks.registerExecutor("library_scan", async (task, _service, signal) => {
    events.push(`start:${task.id}`);
    started();
    await new Promise<void>((_, reject) => {
      signal.addEventListener(
        "abort",
        () => {
          aborted();
          reject(signal.reason);
        },
        { once: true },
      );
    });
  });
  await tasks.initialize();

  try {
    const running = await tasks.enqueue({
      kind: "library_scan",
      title: "Running work",
      sourceId: "source-a",
      sourceName: "Source A",
    });
    await sawStart;
    const queued = await tasks.enqueue({
      kind: "library_scan",
      title: "Queued work",
      sourceId: "source-b",
      sourceName: "Source B",
    });

    const removedQueued = await tasks.cancel(queued.id);
    const stoppedRunning = await tasks.cancel(running.id);
    await sawAbort;

    const cancelledQueued = await tasks.get(queued.id);
    assert.equal(removedQueued?.status, "queued");
    assert.equal(cancelledQueued, null);
    assert.equal(stoppedRunning?.status, "stopped");
    assert.equal(
      stoppedRunning?.failureMessage,
      JSON.stringify(message("api.message.taskStopped")),
    );
    assert.deepEqual(events, [`start:${running.id}`]);
  } finally {
    await tasks.close();
    await context.close();
  }
});

test("administrators cancel queued and running tasks", async () => {
  const context = await createTestContext();
  const member = await createMemberSession(context);
  try {
    const running = await context.database.orm.Task.create({
      kind: "library_scan",
      status: "running",
      title: "Running scan",
      startedAt: new Date(),
    });
    const queued = await context.database.orm.Task.create({
      kind: "library_scan",
      status: "queued",
      title: "Queued scan",
    });
    const memberCancel = await context.app.inject({
      method: "POST",
      url: `/api/admin/tasks/${queued.id}/cancel`,
      headers: member,
    });
    assert.equal(memberCancel.statusCode, 403);

    const removed = await context.app.inject({
      method: "POST",
      url: `/api/admin/tasks/${queued.id}/cancel`,
      headers: context.authorization,
    });
    assert.equal(removed.statusCode, 200);
    assert.equal(removed.json<TaskResponse>().status, "queued");
    assert.equal(
      await context.database.orm.Task.first({ id: queued.id }),
      null,
    );

    const stopped = await context.app.inject({
      method: "POST",
      url: `/api/admin/tasks/${running.id}/cancel`,
      headers: context.authorization,
    });
    assert.equal(stopped.statusCode, 200);
    assert.equal(stopped.json<TaskResponse>().status, "stopped");
    assert.deepEqual(
      stopped.json<TaskResponse>().failureMessage,
      message("api.message.taskStopped"),
    );

    const missing = await context.app.inject({
      method: "POST",
      url: "/api/admin/tasks/missing/cancel",
      headers: context.authorization,
    });
    assert.equal(missing.statusCode, 404);
  } finally {
    await context.close();
  }
});

test("deleting a source stops relevant work and preserves unrelated tasks", async () => {
  const context = await createTestContext();
  try {
    const source = await context.database.orm.Source.create({
      kind: "path",
      name: "Remove me",
      path: context.libraryRoot,
      position: 1,
    });
    const otherSource = await context.database.orm.Source.create({
      kind: "path",
      name: "Keep me",
      path: context.libraryRoot,
      position: 2,
    });
    const relevant = await context.database.orm.Task.create({
      kind: "library_scan",
      status: "running",
      title: "Source scan",
      sourceId: source.id,
      sourceName: source.name,
      startedAt: new Date(),
    });
    const allSources = await context.database.orm.Task.create({
      kind: "metadata_fetch",
      status: "queued",
      title: "Full library metadata",
    });
    const unrelated = await context.database.orm.Task.create({
      kind: "library_scan",
      status: "running",
      title: "Other source scan",
      sourceId: otherSource.id,
      sourceName: otherSource.name,
      startedAt: new Date(),
    });

    const removed = await context.app.inject({
      method: "DELETE",
      url: `/api/admin/sources/${source.id}`,
      headers: context.authorization,
    });
    assert.equal(removed.statusCode, 204);
    assert.equal(
      await context.database.orm.Source.first({ id: source.id }),
      null,
    );
    assert.equal(
      (await context.database.orm.Task.first({ id: relevant.id }))?.status,
      "stopped",
    );
    assert.equal(
      (await context.database.orm.Task.first({ id: allSources.id }))?.status,
      "stopped",
    );
    assert.equal(
      (await context.database.orm.Task.first({ id: unrelated.id }))?.status,
      "running",
    );
  } finally {
    await context.close();
  }
});

test("task failures and restart interruptions are visible in server logs", async () => {
  const context = await createTestContext();
  await context.app.close();
  const logs: Array<{ level: string; message: string }> = [];
  const tasks = new TaskService(context.database, undefined, (level, message) =>
    logs.push({ level, message }),
  );
  try {
    await context.database.orm.Task.create({
      kind: "library_scan",
      status: "running",
      title: "Interrupted library scan",
      startedAt: new Date(),
    });
    await tasks.initialize();
    assert.ok(
      logs.some(
        (entry) =>
          entry.level === "warn" &&
          entry.message.includes(
            "Interrupted 1 running task because the server restarted.",
          ),
      ),
    );

    tasks.registerExecutor("catalog_fetch", async () => {
      throw new Error("Jellyfin request failed");
    });
    const failed = await tasks.enqueue({
      kind: "catalog_fetch",
      title: "Broken Jellyfin sync",
      sourceName: "Media server",
    });
    await waitForStatus(tasks, failed.id, "failed");
    assert.ok(
      logs.some(
        (entry) =>
          entry.level === "error" &&
          entry.message.includes("Task failed: Broken Jellyfin sync."),
      ),
    );
  } finally {
    await tasks.close();
    await context.close();
  }
});

test("failed task executions are retried twice before terminal failure", async () => {
  const context = await createTestContext();
  await context.app.close();
  const tasks = new TaskService(context.database);
  const seenRetryCounts: number[] = [];
  tasks.registerExecutor("catalog_fetch", async (task) => {
    seenRetryCounts.push(task.retryCount);
    throw new Error("Catalog request failed");
  });
  await tasks.initialize();

  try {
    const queued = await tasks.enqueue({
      kind: "catalog_fetch",
      title: "Retry exhausted catalog task",
    });
    await waitForStatus(tasks, queued.id, "failed");

    const failed = await tasks.get(queued.id);
    assert.deepEqual(
      seenRetryCounts,
      Array.from({ length: MAX_TASK_RETRIES + 1 }, (_, index) => index),
    );
    assert.equal(failed?.status, "failed");
    assert.equal(failed?.retryCount, MAX_TASK_RETRIES);
    assert.equal(failed?.failureSummary, "The task could not be completed.");
    assert.ok(failed?.completedAt);
  } finally {
    await tasks.close();
    await context.close();
  }
});

test("a failed task completes when an automatic retry succeeds", async () => {
  const context = await createTestContext();
  await context.app.close();
  const tasks = new TaskService(context.database);
  let executions = 0;
  tasks.registerExecutor("catalog_fetch", async () => {
    executions += 1;
    if (executions <= MAX_TASK_RETRIES) {
      throw new Error("Temporary catalog failure");
    }
  });
  await tasks.initialize();

  try {
    const queued = await tasks.enqueue({
      kind: "catalog_fetch",
      title: "Eventually successful catalog task",
    });
    await waitForStatus(tasks, queued.id, "completed");

    const completed = await tasks.get(queued.id);
    assert.equal(executions, MAX_TASK_RETRIES + 1);
    assert.equal(completed?.status, "completed");
    assert.equal(completed?.retryCount, MAX_TASK_RETRIES);
    assert.equal(completed?.failureSummary, null);
  } finally {
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
      kind: "library_scan",
      status: "completed",
      title: "Old task",
      completedAt: oldCompletedAt,
    });
    for (let index = 0; index < 505; index += 1) {
      await context.database.orm.Task.create({
        kind: "library_scan",
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
      (await tasks.get(child.id))?.failureMessage,
      JSON.stringify(message("api.message.parentTaskFailed")),
    );
  } finally {
    await tasks.close();
    await context.close();
  }
});

test("background task details have fixed count and field bounds", () => {
  const details = normalizeTaskDetails(
    Array.from({ length: 20 }, (_, index) => ({
      key: `task.detail.${index}`,
      value: "x".repeat(400),
      labelMessage: message("task.detail.added"),
      valueMessage: null,
    })),
  );
  assert.equal(details.length, 16);
  assert.equal(details[0]?.value.length, 300);
});

test("metadata progress identifies the provider currently being fetched", () => {
  const counts = {
    source: "Music",
    total: 4,
    processed: 2,
    matched: 1,
    unmatched: 1,
    errors: 0,
  };
  const active = metadataDetails(counts, "provider-1");
  assert.equal(
    active.find(
      (detail) => detail.key === TASK_ACTIVE_METADATA_PROVIDER_DETAIL_KEY,
    )?.value,
    "provider-1",
  );
  assert.equal(
    metadataDetails(counts).some(
      (detail) => detail.key === TASK_ACTIVE_METADATA_PROVIDER_DETAIL_KEY,
    ),
    false,
  );
});

test("background task details are bounded and source paths are not exposed", async () => {
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
