import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import type { LikeListResponse } from "@peridot/contracts";
import { buildApp } from "../src/app.js";
import {
  createMemberSession,
  createTaggedMp3,
  createTestContext,
  startScan,
} from "./helpers.js";

async function createCatalogTrack(
  context: Awaited<ReturnType<typeof createTestContext>>,
) {
  const trackPath = path.join(context.root, "music", "night-sessions.mp3");
  await writeFile(
    trackPath,
    createTaggedMp3({
      title: "Opening",
      artist: "Elliot Lake",
      album: "Night Sessions",
      discNumber: 1,
      trackNumber: 1,
    }),
  );
  const scan = await startScan(context);
  assert.equal(scan.status, "completed");
  return context.database.track.findFirstOrThrow();
}

async function listLikes(
  context: Awaited<ReturnType<typeof createTestContext>>,
  authorization = context.authorization,
) {
  const response = await context.app.inject({
    method: "GET",
    url: "/api/likes",
    headers: authorization,
  });
  assert.equal(response.statusCode, 200);
  return response.json<LikeListResponse>();
}

test("likes persist for tracks, albums, and artists with normalized identities", async () => {
  const context = await createTestContext();
  try {
    const track = await createCatalogTrack(context);
    const targets = [
      { kind: "track", trackId: track.id },
      {
        kind: "album",
        title: " Night Sessions ",
        artist: " Elliot Lake ",
      },
      { kind: "artist", name: " Elliot Lake " },
    ] as const;

    for (const target of targets) {
      const response = await context.app.inject({
        method: "POST",
        url: "/api/likes",
        headers: context.authorization,
        payload: target,
      });
      assert.equal(response.statusCode, 200);
      assert.equal(response.json<{ kind: string }>().kind, target.kind);
    }

    const repeatedAlbum = await context.app.inject({
      method: "POST",
      url: "/api/likes",
      headers: context.authorization,
      payload: {
        kind: "album",
        title: "night sessions",
        artist: "ELLIOT LAKE",
      },
    });
    assert.equal(repeatedAlbum.statusCode, 200);
    assert.equal((await context.database.albumLike.count()) as number, 1);

    const likes = await listLikes(context);
    assert.deepEqual(
      likes.tracks.map((item) => item.trackId),
      [track.id],
    );
    assert.deepEqual(
      likes.albums.map(({ title, artist }) => ({ title, artist })),
      [{ title: "Night Sessions", artist: "Elliot Lake" }],
    );
    assert.deepEqual(
      likes.artists.map((item) => item.name),
      ["Elliot Lake"],
    );

    const removed = await context.app.inject({
      method: "DELETE",
      url: "/api/likes",
      headers: context.authorization,
      payload: { kind: "track", trackId: track.id },
    });
    assert.equal(removed.statusCode, 204);
    assert.equal(
      (
        await context.app.inject({
          method: "DELETE",
          url: "/api/likes",
          headers: context.authorization,
          payload: { kind: "track", trackId: track.id },
        })
      ).statusCode,
      204,
    );
    assert.equal((await listLikes(context)).tracks.length, 0);
    assert.equal((await listLikes(context)).albums.length, 1);
    assert.equal((await listLikes(context)).artists.length, 1);

    for (const target of [
      {
        kind: "album",
        title: "Night Sessions",
        artist: "Elliot Lake",
      },
      { kind: "artist", name: "Elliot Lake" },
    ] as const) {
      for (let attempt = 0; attempt < 2; attempt += 1) {
        const response = await context.app.inject({
          method: "DELETE",
          url: "/api/likes",
          headers: context.authorization,
          payload: target,
        });
        assert.equal(response.statusCode, 204);
      }
    }
    assert.deepEqual(await listLikes(context), {
      tracks: [],
      albums: [],
      artists: [],
    });
  } finally {
    await context.close();
  }
});

test("likes are private to each authenticated user", async () => {
  const context = await createTestContext();
  try {
    const track = await createCatalogTrack(context);
    await context.app.inject({
      method: "POST",
      url: "/api/likes",
      headers: context.authorization,
      payload: { kind: "track", trackId: track.id },
    });
    const member = await createMemberSession(context);
    assert.equal((await listLikes(context, member)).tracks.length, 0);

    await context.app.inject({
      method: "POST",
      url: "/api/likes",
      headers: member,
      payload: {
        kind: "artist",
        name: "Elliot Lake",
      },
    });
    assert.equal((await listLikes(context)).tracks.length, 1);
    assert.equal((await listLikes(context)).artists.length, 0);
    assert.equal((await listLikes(context, member)).artists.length, 1);

    const anonymous = await context.app.inject({
      method: "GET",
      url: "/api/likes",
    });
    assert.equal(anonymous.statusCode, 401);
  } finally {
    await context.close();
  }
});

test("likes survive a server restart", async () => {
  const context = await createTestContext();
  let restartedApp: Awaited<ReturnType<typeof buildApp>> | undefined;
  try {
    await createCatalogTrack(context);
    await context.app.inject({
      method: "POST",
      url: "/api/likes",
      headers: context.authorization,
      payload: { kind: "artist", name: "Elliot Lake" },
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
      url: "/api/likes",
      headers: context.authorization,
    });
    assert.equal(response.statusCode, 200);
    assert.deepEqual(
      response.json<LikeListResponse>().artists.map((item) => item.name),
      ["Elliot Lake"],
    );
  } finally {
    await restartedApp?.close();
    await context.close();
  }
});

test("like validation rejects invalid targets and unknown tracks", async () => {
  const context = await createTestContext();
  try {
    for (const payload of [
      {},
      { kind: "unknown" },
      { kind: "artist", name: " " },
      { kind: "album", title: "Album" },
      { kind: "album", title: "x".repeat(513), artist: "Artist" },
    ]) {
      const response = await context.app.inject({
        method: "POST",
        url: "/api/likes",
        headers: context.authorization,
        payload,
      });
      assert.equal(response.statusCode, 400);
      assert.equal(response.json().error.code, "invalid_like");
    }

    for (const method of ["POST", "DELETE"] as const) {
      const response = await context.app.inject({
        method,
        url: "/api/likes",
        headers: context.authorization,
        payload: { kind: "track", trackId: "missing" },
      });
      assert.equal(response.statusCode, 404);
      assert.equal(response.json().error.code, "track_not_found");
    }
  } finally {
    await context.close();
  }
});

test("deleting a track or user removes their likes", async () => {
  const context = await createTestContext();
  try {
    const track = await createCatalogTrack(context);
    await context.database.trackLike.create({
      data: {
        userId: (await context.database.user.findFirstOrThrow()).id,
        trackId: track.id,
      },
    });
    await context.database.track.delete({ where: { id: track.id } });
    assert.equal(await context.database.trackLike.count(), 0);

    const member = await createMemberSession(context);
    await context.app.inject({
      method: "POST",
      url: "/api/likes",
      headers: member,
      payload: { kind: "album", title: "Album", artist: "Artist" },
    });
    await context.app.inject({
      method: "POST",
      url: "/api/likes",
      headers: member,
      payload: { kind: "artist", name: "Artist" },
    });
    await context.database.user.delete({
      where: { username: "test-member" },
    });
    assert.equal(await context.database.albumLike.count(), 0);
    assert.equal(await context.database.artistLike.count(), 0);
  } finally {
    await context.close();
  }
});
