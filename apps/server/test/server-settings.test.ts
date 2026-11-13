import assert from "node:assert/strict";
import test from "node:test";
import { createMemberSession, createTestContext } from "./helpers.js";

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
