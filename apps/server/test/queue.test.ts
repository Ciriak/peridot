import assert from "node:assert/strict";
import test from "node:test";
import type { QueueResponse } from "@peridot/contracts";
import { buildApp } from "../src/app.js";
import {
  createMemberSession,
  createTestContext,
  type TestContext,
} from "./helpers.js";

async function createTracks(context: TestContext, count = 3) {
  return Promise.all(
    Array.from({ length: count }, (_, index) =>
      context.database.track.create({
        data: {
          title: `Track ${index + 1}`,
          artist: "Queue Artist",
          album: "Queue Album",
          relativePath: `track-${index + 1}.mp3`,
          mimeType: "audio/mpeg",
          durationMs: 60_000,
          fileSizeBytes: 1n,
          fileModifiedAt: new Date(0),
          trackNumber: index + 1,
        },
      }),
    ),
  );
}

async function readQueue(
  context: TestContext,
  authorization = context.authorization,
) {
  const response = await context.app.inject({
    method: "GET",
    url: "/api/queue",
    headers: authorization,
  });
  assert.equal(response.statusCode, 200);
  return response.json<QueueResponse>();
}

test("authenticated users can replace and reorder their queue", async () => {
  const context = await createTestContext();
  try {
    const tracks = await createTracks(context);
    const expected = [tracks[2]!.id, tracks[0]!.id, tracks[1]!.id];

    for (let attempt = 0; attempt < 2; attempt += 1) {
      const response = await context.app.inject({
        method: "PUT",
        url: "/api/queue",
        headers: context.authorization,
        payload: { trackIds: expected },
      });
      assert.equal(response.statusCode, 200);
      assert.deepEqual(response.json<QueueResponse>().trackIds, expected);
    }

    assert.deepEqual((await readQueue(context)).trackIds, expected);

    const cleared = await context.app.inject({
      method: "PUT",
      url: "/api/queue",
      headers: context.authorization,
      payload: { trackIds: [] },
    });
    assert.equal(cleared.statusCode, 200);
    assert.deepEqual(cleared.json<QueueResponse>().trackIds, []);
  } finally {
    await context.close();
  }
});

test("queue replacement rejects malformed, duplicate, and unknown tracks", async () => {
  const context = await createTestContext();
  try {
    const [track] = await createTracks(context, 1);
    for (const payload of [
      {},
      { trackIds: "not-an-array" },
      { trackIds: [track!.id, track!.id] },
      { trackIds: ["missing"] },
      { trackIds: [" "] },
    ]) {
      const response = await context.app.inject({
        method: "PUT",
        url: "/api/queue",
        headers: context.authorization,
        payload,
      });
      assert.equal(response.statusCode, 400);
      assert.equal(response.json().error.code, "invalid_queue");
    }
  } finally {
    await context.close();
  }
});

test("queue state is private to each authenticated user", async () => {
  const context = await createTestContext();
  try {
    const [track] = await createTracks(context, 1);
    await context.app.inject({
      method: "PUT",
      url: "/api/queue",
      headers: context.authorization,
      payload: { trackIds: [track!.id] },
    });
    const member = await createMemberSession(context);

    assert.deepEqual((await readQueue(context)).trackIds, [track!.id]);
    assert.deepEqual((await readQueue(context, member)).trackIds, []);

    const anonymous = await context.app.inject({
      method: "GET",
      url: "/api/queue",
    });
    assert.equal(anonymous.statusCode, 401);
  } finally {
    await context.close();
  }
});

test("queue survives a server restart", async () => {
  const context = await createTestContext();
  let restartedApp: Awaited<ReturnType<typeof buildApp>> | undefined;
  try {
    const [track] = await createTracks(context, 1);
    await context.app.inject({
      method: "PUT",
      url: "/api/queue",
      headers: context.authorization,
      payload: { trackIds: [track!.id] },
    });
    await context.app.close();

    restartedApp = await buildApp({
      config: {
        databaseUrl: context.databaseUrl,
        libraryRoot: context.libraryRoot,
        webOrigins: ["http://127.0.0.1:3000"],
      },
      database: context.database,
      logger: false,
    });
    const response = await restartedApp.inject({
      method: "GET",
      url: "/api/queue",
      headers: context.authorization,
    });
    assert.equal(response.statusCode, 200);
    assert.deepEqual(response.json<QueueResponse>().trackIds, [track!.id]);
  } finally {
    await restartedApp?.close();
    await context.close();
  }
});

test("deleting a track or user removes their queue items", async () => {
  const context = await createTestContext();
  try {
    const [track, otherTrack] = await createTracks(context, 2);
    const admin = await context.database.user.findFirstOrThrow();
    await context.database.queueItem.createMany({
      data: [
        { userId: admin.id, trackId: track!.id, position: 0 },
        { userId: admin.id, trackId: otherTrack!.id, position: 1 },
      ],
    });
    await context.database.track.delete({ where: { id: track!.id } });
    assert.equal(await context.database.queueItem.count(), 1);

    const member = await createMemberSession(context);
    const memberUser = await context.database.user.findUniqueOrThrow({
      where: { username: "test-member" },
    });
    await context.database.queueItem.create({
      data: {
        userId: memberUser.id,
        trackId: otherTrack!.id,
        position: 0,
      },
    });
    assert.deepEqual((await readQueue(context, member)).trackIds, [
      otherTrack!.id,
    ]);
    await context.database.user.delete({ where: { id: memberUser.id } });
    assert.equal(await context.database.queueItem.count(), 1);
  } finally {
    await context.close();
  }
});
