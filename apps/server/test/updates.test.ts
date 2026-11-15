import assert from "node:assert/strict";
import test from "node:test";
import { UpdateService, type UpdateConfig } from "../src/updates.js";
import { createMemberSession, createTestContext } from "./helpers.js";

const commit = "a".repeat(40);
const nextCommit = "b".repeat(40);

function updateConfig(overrides: Partial<UpdateConfig> = {}): UpdateConfig {
  return {
    channel: "dev",
    repository: "Ciriak/peridot",
    currentTag: null,
    currentCommit: commit,
    watchtowerUrl: "http://watchtower:8080",
    watchtowerToken: "private-token",
    ...overrides,
  };
}

test("development update checks report current and available commits", async () => {
  let remoteCommit = commit;
  const service = new UpdateService(updateConfig(), async () =>
    Response.json({ sha: remoteCommit }),
  );
  assert.equal(service.status().state, "unchecked");
  assert.equal(service.status().version, "0.0.1");

  const current = await service.check();
  assert.equal(current.state, "current");
  assert.equal(current.latestCommit, commit);
  assert.equal(current.installAvailable, false);

  remoteCommit = nextCommit;
  const available = await service.check();
  assert.equal(available.state, "available");
  assert.equal(available.latestCommit, nextCommit);
  assert.equal(available.installAvailable, true);
});

test("stable update checks use the highest non-prerelease version tag", async () => {
  const service = new UpdateService(
    updateConfig({
      channel: "stable",
      currentTag: "v0.0.1",
      currentCommit: commit,
    }),
    async () =>
      Response.json([
        { name: "v0.0.1", commit: { sha: commit } },
        { name: "v0.0.2", commit: { sha: nextCommit } },
        { name: "v0.1.0-beta.1", commit: { sha: "c".repeat(40) } },
      ]),
  );

  const result = await service.check();
  assert.equal(result.state, "available");
  assert.equal(result.latestTag, "v0.0.2");
  assert.equal(result.latestCommit, nextCommit);
});

test("administrator update endpoints reject members and trigger Watchtower privately", async () => {
  const requests: Array<{ url: string; authorization: string | null }> = [];
  const service = new UpdateService(updateConfig(), async (input, init) => {
    const url = String(input);
    requests.push({
      url,
      authorization: new Headers(init?.headers).get("authorization"),
    });
    if (url.endsWith("/v1/update")) return Response.json({ ok: true });
    return Response.json({ sha: nextCommit });
  });
  const context = await createTestContext({ updateService: service });
  try {
    const member = await createMemberSession(context);
    const denied = await context.app.inject({
      method: "POST",
      url: "/api/admin/updates/check",
      headers: { authorization: member.authorization },
    });
    assert.equal(denied.statusCode, 403);

    const checked = await context.app.inject({
      method: "POST",
      url: "/api/admin/updates/check",
      headers: context.authorization,
    });
    assert.equal(checked.statusCode, 200);
    assert.equal(checked.json().state, "available");
    assert.equal(checked.body.includes("private-token"), false);

    const installed = await context.app.inject({
      method: "POST",
      url: "/api/admin/updates/install",
      headers: context.authorization,
    });
    assert.equal(installed.statusCode, 202);
    assert.deepEqual(installed.json(), { status: "updating" });
    await new Promise((resolve) => setTimeout(resolve, 20));
    const watchtower = requests.find((request) =>
      request.url.endsWith("/v1/update"),
    );
    assert.equal(watchtower?.authorization, "Bearer private-token");
  } finally {
    await context.close();
  }
});

test("local builds cannot check for updates", async () => {
  const service = new UpdateService(
    updateConfig({ channel: "local", currentCommit: null }),
  );
  const context = await createTestContext({ updateService: service });
  try {
    const status = await context.app.inject({
      method: "GET",
      url: "/api/admin/updates",
      headers: context.authorization,
    });
    assert.equal(status.statusCode, 200);
    assert.equal(status.json().channel, "local");
    assert.equal(status.json().state, "unchecked");

    const checked = await context.app.inject({
      method: "POST",
      url: "/api/admin/updates/check",
      headers: context.authorization,
    });
    assert.equal(checked.statusCode, 400);
    assert.equal(checked.json().error.code, "update_channel_unavailable");
  } finally {
    await context.close();
  }
});
