import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { createMemberSession, createTestContext } from "./helpers.js";

test("administrators can update and validate the source refresh schedule", async () => {
  const context = await createTestContext();
  try {
    const updated = await context.app.inject({
      method: "PUT",
      url: "/api/admin/server",
      headers: context.authorization,
      payload: {
        sourceRefresh: {
          enabled: false,
          cron: "15 4 * * *",
        },
      },
    });
    assert.equal(updated.statusCode, 200);
    assert.deepEqual(updated.json(), {
      trackCount: 0,
      availableTrackCount: 0,
      scanning: {
        workerCount: 3,
      },
      sourceRefresh: {
        enabled: false,
        cron: "15 4 * * *",
        nextRunAt: null,
      },
      fileLogging: {
        enabled: true,
        retentionDays: 5,
        path: path.join(context.root, "peridot.log"),
      },
    });

    const settings = await context.database.orm.ServerSetting.firstOrThrow({
      id: "server",
    });
    assert.equal(settings.sourceRefreshEnabled, 0);
    assert.equal(settings.sourceRefreshCron, "15 4 * * *");

    const invalid = await context.app.inject({
      method: "PUT",
      url: "/api/admin/server",
      headers: context.authorization,
      payload: {
        sourceRefresh: {
          enabled: true,
          cron: "not a cron",
        },
      },
    });
    assert.equal(invalid.statusCode, 400);
    assert.equal(invalid.json().error.code, "invalid_server_settings");
    assert.equal(
      invalid.json().error.messageDescriptor.key,
      "api.message.invalidSourceRefreshSettings",
    );
    assert.equal(
      (
        await context.database.orm.ServerSetting.firstOrThrow({
          id: "server",
        })
      ).sourceRefreshCron,
      "15 4 * * *",
    );
  } finally {
    await context.close();
  }
});

test("administrators can update and validate scan worker threads", async () => {
  const context = await createTestContext();
  try {
    const updated = await context.app.inject({
      method: "PUT",
      url: "/api/admin/server",
      headers: context.authorization,
      payload: {
        scanning: {
          workerCount: 5,
        },
      },
    });
    assert.equal(updated.statusCode, 200);
    assert.deepEqual(updated.json().scanning, { workerCount: 5 });
    assert.equal(
      (
        await context.database.orm.ServerSetting.firstOrThrow({
          id: "server",
        })
      ).scanWorkerCount,
      5,
    );

    for (const workerCount of [0, 1.5, 33]) {
      const invalid = await context.app.inject({
        method: "PUT",
        url: "/api/admin/server",
        headers: context.authorization,
        payload: {
          scanning: {
            workerCount,
          },
        },
      });
      assert.equal(invalid.statusCode, 400);
      assert.equal(invalid.json().error.code, "invalid_server_settings");
      assert.equal(
        invalid.json().error.messageDescriptor.key,
        "api.message.invalidScanWorkerSettings",
      );
    }
  } finally {
    await context.close();
  }
});

test("file logging is enabled by default and its retention can be configured", async () => {
  const context = await createTestContext();
  const logPath = path.join(context.root, "peridot.log");
  try {
    const initial = await context.app.inject({
      method: "GET",
      url: "/api/admin/server",
      headers: context.authorization,
    });
    assert.deepEqual(initial.json().fileLogging, {
      enabled: true,
      retentionDays: 5,
      path: logPath,
    });
    context.logBuffer.add("info", "enabled by default");
    let defaultContent = "";
    for (let attempt = 0; attempt < 50; attempt += 1) {
      defaultContent = await readFile(logPath, "utf8").catch(() => "");
      if (defaultContent.includes("enabled by default")) break;
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    assert.match(defaultContent, /enabled by default/);

    const configured = await context.app.inject({
      method: "PUT",
      url: "/api/admin/server",
      headers: context.authorization,
      payload: {
        fileLogging: {
          enabled: true,
          retentionDays: 14,
        },
      },
    });
    assert.equal(configured.statusCode, 200);
    assert.deepEqual(configured.json().fileLogging, {
      enabled: true,
      retentionDays: 14,
      path: logPath,
    });
    const stored = await context.database.orm.ServerSetting.firstOrThrow({
      id: "server",
    });
    assert.equal(stored.fileLoggingEnabled, 1);
    assert.equal(stored.fileLogRetentionDays, 14);

    context.logBuffer.add("info", "persisted test entry");
    let content = "";
    for (let attempt = 0; attempt < 50; attempt += 1) {
      content = await readFile(logPath, "utf8").catch(() => "");
      if (content.includes("persisted test entry")) break;
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    assert.match(content, /persisted test entry/);

    const disabled = await context.app.inject({
      method: "PUT",
      url: "/api/admin/server",
      headers: context.authorization,
      payload: {
        fileLogging: {
          enabled: false,
          retentionDays: 14,
        },
      },
    });
    assert.equal(disabled.statusCode, 200);
    assert.equal(disabled.json().fileLogging.enabled, false);
    context.logBuffer.add("info", "not persisted after disable");
    await new Promise((resolve) => setTimeout(resolve, 25));
    const finalContent = await readFile(logPath, "utf8");
    assert.match(finalContent, /persisted test entry/);
    assert.doesNotMatch(finalContent, /not persisted after disable/);

    for (const retentionDays of [0, 1.5, 3651]) {
      const invalid = await context.app.inject({
        method: "PUT",
        url: "/api/admin/server",
        headers: context.authorization,
        payload: {
          fileLogging: {
            enabled: true,
            retentionDays,
          },
        },
      });
      assert.equal(invalid.statusCode, 400);
      assert.equal(invalid.json().error.code, "invalid_server_settings");
    }
  } finally {
    await context.close();
  }
});

test("only administrators can update server settings", async () => {
  const context = await createTestContext();
  try {
    const member = await createMemberSession(context);
    const response = await context.app.inject({
      method: "PUT",
      url: "/api/admin/server",
      headers: { authorization: member.authorization },
      payload: {
        sourceRefresh: {
          enabled: true,
          cron: "0 3 * * *",
        },
      },
    });
    assert.equal(response.statusCode, 403);
  } finally {
    await context.close();
  }
});

test("only administrators can schedule a server restart", async () => {
  let restarts = 0;
  const context = await createTestContext({
    restartServer: () => {
      restarts += 1;
    },
  });
  try {
    const member = await createMemberSession(context);
    const denied = await context.app.inject({
      method: "POST",
      url: "/api/admin/server/restart",
      headers: { authorization: member.authorization },
    });
    assert.equal(denied.statusCode, 403);
    assert.equal(restarts, 0);

    const accepted = await context.app.inject({
      method: "POST",
      url: "/api/admin/server/restart",
      headers: context.authorization,
    });
    assert.equal(accepted.statusCode, 202);
    assert.deepEqual(accepted.json(), { status: "restarting" });
    assert.equal(restarts, 1);
  } finally {
    await context.close();
  }
});

test("the restart endpoint rejects runtimes without a restart hook", async () => {
  const context = await createTestContext();
  try {
    const response = await context.app.inject({
      method: "POST",
      url: "/api/admin/server/restart",
      headers: context.authorization,
    });
    assert.equal(response.statusCode, 503);
    assert.equal(response.json().error.code, "server_restart_unavailable");
    assert.equal(
      response.json().error.messageDescriptor.key,
      "api.message.serverRestartUnavailable",
    );
  } finally {
    await context.close();
  }
});
