import assert from "node:assert/strict";
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
      sourceRefresh: {
        enabled: false,
        cron: "15 4 * * *",
        nextRunAt: null,
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
