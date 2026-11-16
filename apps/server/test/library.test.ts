import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdir, rename, rm, symlink, writeFile } from "node:fs/promises";
import path from "node:path";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../src/app.js";
import {
  createTaggedMp3,
  createTestContext,
  createWav,
  startScan,
} from "./helpers.js";

test("protected library routes require a valid user session", async () => {
  const context = await createTestContext();
  try {
    for (const authorization of [undefined, "Bearer wrong", "wrong-scheme"]) {
      const response = await context.app.inject(
        authorization
          ? {
              method: "GET",
              url: "/api/tracks",
              headers: { authorization },
            }
          : {
              method: "GET",
              url: "/api/tracks",
            },
      );
      assert.equal(response.statusCode, 401);
      assert.deepEqual(response.json(), {
        error: {
          code: "unauthorized",
          messageDescriptor: { key: "api.message.unauthorized" },
        },
      });
    }
    assert.equal(
      (
        await context.app.inject({
          method: "GET",
          url: "/api/tracks",
          headers: context.authorization,
        })
      ).statusCode,
      200,
    );
  } finally {
    await context.close();
  }
});

test("scans catalog supported regular files, reconcile availability, and persist status", async () => {
  const context = await createTestContext();
  const musicRoot = path.join(context.root, "music");
  const nested = path.join(musicRoot, "Artist", "Album");
  const external = path.join(context.root, "external");
  const trackPath = path.join(nested, "Song.wav");
  try {
    await mkdir(nested, { recursive: true });
    await mkdir(external);
    await writeFile(trackPath, createWav());
    await writeFile(path.join(nested, "notes.txt"), "not audio");
    await writeFile(path.join(nested, "broken.mp3"), Buffer.alloc(0));
    await writeFile(path.join(external, "outside.wav"), createWav());
    await symlink(external, path.join(musicRoot, "linked"), "junction");

    const firstScan = await startScan(context);
    assert.equal(firstScan.status, "completed");
    assert.equal(firstScan.discoveredCount, 2);
    assert.equal(firstScan.createdCount, 1);
    assert.equal(firstScan.errorCount, 1);

    const listResponse = await context.app.inject({
      method: "GET",
      url: "/api/tracks",
      headers: context.authorization,
    });
    assert.equal(listResponse.statusCode, 200);
    const list = listResponse.json<{ items: Array<Record<string, unknown>> }>();
    assert.equal(list.items.length, 1);
    assert.deepEqual(list.items[0], {
      id: list.items[0]?.id,
      mediaType: "music",
      mediaTypeOrigin: "fallback",
      title: "Song",
      artist: "Unknown Artist",
      artists: ["Unknown Artist"],
      album: null,
      genres: [],
      albumId: null,
      discNumber: null,
      trackNumber: null,
      durationMs: 100,
      publishedAt: null,
      mimeType: "audio/wav",
      available: true,
      coverUrl: null,
      metadata: null,
      liked: false,
    });
    assert.doesNotMatch(
      listResponse.body,
      /relativePath|fileSize|external|Artist[\\/]+Album/,
    );

    const secondScan = await startScan(context);
    assert.equal(secondScan.unchangedCount, 1);
    assert.equal(secondScan.createdCount, 0);

    await rm(trackPath);
    const missingScan = await startScan(context);
    assert.equal(missingScan.unavailableCount, 1);
    const unavailable = await context.app.inject({
      method: "GET",
      url: "/api/tracks?availability=unavailable",
      headers: context.authorization,
    });
    assert.equal(unavailable.json<{ items: unknown[] }>().items.length, 1);

    await writeFile(trackPath, createWav(125));
    const restoredScan = await startScan(context);
    assert.equal(restoredScan.updatedCount, 1);
    assert.equal(
      (
        await context.app.inject({
          method: "GET",
          url: "/api/tracks?availability=invalid",
          headers: context.authorization,
        })
      ).statusCode,
      400,
    );
  } finally {
    await context.close();
  }
});

test("scans track, disc, and album tags and backfills legacy metadata once", async () => {
  const context = await createTestContext();
  const trackPath = path.join(context.root, "music", "ordered.mp3");
  try {
    await writeFile(
      trackPath,
      createTaggedMp3({
        title: "Opening",
        artist: "Elliot Lake; Óra",
        albumArtist: "Elliot Lake",
        album: "Night Sessions",
        discNumber: 2,
        trackNumber: 5,
      }),
    );

    const firstScan = await startScan(context);
    assert.equal(firstScan.status, "completed");
    const firstTrack = await context.database.orm.Track.firstOrThrow();
    assert.equal(firstTrack.artist, "Elliot Lake, Óra");
    assert.equal(
      firstTrack.artistCredits,
      JSON.stringify(["Elliot Lake", "Óra"]),
    );
    assert.equal(firstTrack.album, "Night Sessions");
    assert.equal(firstTrack.albumArtist, "Elliot Lake");
    assert.equal(
      firstTrack.albumArtistCredits,
      JSON.stringify(["Elliot Lake"]),
    );
    assert.equal(firstTrack.mimeType, "audio/mpeg");
    assert.equal(firstTrack.discNumber, 2);
    assert.equal(firstTrack.trackNumber, 5);
    assert.equal(firstTrack.metadataVersion, 7);

    await context.database.orm.Track.where({ id: firstTrack.id }).update({
      metadataVersion: 0,
      discNumber: null,
      trackNumber: null,
    });
    const backfillScan = await startScan(context);
    assert.equal(backfillScan.updatedCount, 1);
    const backfilledTrack = await context.database.orm.Track.firstOrThrow({
      id: firstTrack.id,
    });
    assert.equal(backfilledTrack.discNumber, 2);
    assert.equal(backfilledTrack.trackNumber, 5);
    assert.equal(backfilledTrack.metadataVersion, 7);

    const unchangedScan = await startScan(context);
    assert.equal(unchangedScan.unchangedCount, 1);
    assert.equal(unchangedScan.updatedCount, 0);

    const response = await context.app.inject({
      method: "GET",
      url: `/api/tracks/${firstTrack.id}`,
      headers: context.authorization,
    });
    assert.equal(response.statusCode, 200);
    assert.equal(
      response.json<{ trackNumber: number | null }>().trackNumber,
      5,
    );
    assert.deepEqual(response.json<{ artists: string[] }>().artists, [
      "Elliot Lake",
      "Óra",
    ]);
  } finally {
    await context.close();
  }
});

test("scans multi-valued track genres and makes them searchable", async () => {
  const context = await createTestContext();
  try {
    await writeFile(
      path.join(context.libraryRoot, "genres.mp3"),
      createTaggedMp3({
        title: "Genre Song",
        artist: "Genre Artist",
        album: "Genre Album",
        genres: ["Electronic", "Ambient", "electronic"],
        discNumber: 1,
        trackNumber: 1,
      }),
    );
    const scan = await startScan(context);
    assert.equal(scan.status, "completed");

    const track = await context.database.orm.Track.firstOrThrow();
    assert.deepEqual(JSON.parse(track.genres ?? "[]"), [
      "Electronic",
      "Ambient",
    ]);

    const response = await context.app.inject({
      method: "GET",
      url: "/api/tracks?query=ambient",
      headers: context.authorization,
    });
    assert.equal(response.statusCode, 200, response.body);
    const items = response.json<{
      items: Array<{ title: string; genres: string[] }>;
    }>().items;
    assert.deepEqual(
      items.map(({ title, genres }) => ({ title, genres })),
      [
        {
          title: "Genre Song",
          genres: ["Electronic", "Ambient"],
        },
      ],
    );
  } finally {
    await context.close();
  }
});

test("repeated scans of multiple existing tracks complete without SQLite contention", async () => {
  const context = await createTestContext();
  const musicRoot = path.join(context.root, "music");
  try {
    for (let index = 0; index < 4; index++) {
      await writeFile(
        path.join(musicRoot, `track-${index}.wav`),
        createWav(100 + index),
      );
    }

    const firstScan = await startScan(context);
    assert.equal(firstScan.status, "completed");
    assert.equal(firstScan.createdCount, 4);

    for (let index = 0; index < 3; index++) {
      const repeatScan = await startScan(context);
      assert.equal(repeatScan.status, "completed");
      assert.equal(repeatScan.failureMessage, null);
      assert.equal(repeatScan.unchangedCount, 4);
      assert.equal(repeatScan.errorCount, 0);
    }
  } finally {
    await context.close();
  }
});

test("audio endpoint streams complete and ranged responses with a playback token and marks missing files unavailable", async () => {
  const context = await createTestContext();
  const trackPath = path.join(context.root, "music", "range.wav");
  const wav = createWav(20);
  try {
    await writeFile(trackPath, wav);
    await startScan(context);
    const track = await context.database.orm.Track.where({
      relativePath: "range.wav",
    }).firstOrThrow();
    const url = `/api/tracks/${track.id}/audio`;

    const tokenResponse = await context.app.inject({
      method: "POST",
      url: `/api/tracks/${track.id}/playback-token`,
      headers: context.authorization,
    });
    assert.equal(tokenResponse.statusCode, 200);
    const playbackToken = tokenResponse.json<{ token: string }>().token;
    const playbackUrl = `${url}?playbackToken=${encodeURIComponent(playbackToken)}`;

    assert.equal(
      (
        await context.app.inject({
          method: "GET",
          url,
        })
      ).statusCode,
      401,
    );
    assert.equal(
      (
        await context.app.inject({
          method: "GET",
          url: playbackUrl.replace(track.id, "another-track"),
        })
      ).statusCode,
      401,
    );

    const complete = await context.app.inject({
      method: "GET",
      url: playbackUrl,
    });
    assert.equal(complete.statusCode, 200);
    assert.equal(complete.headers["accept-ranges"], "bytes");
    assert.equal(complete.headers["content-type"], "audio/wav");
    assert.deepEqual(complete.rawPayload, wav);

    for (const [range, expectedStart, expectedEnd] of [
      ["bytes=0-9", 0, 9],
      ["bytes=10-", 10, wav.length - 1],
      ["bytes=-10", wav.length - 10, wav.length - 1],
    ] as const) {
      const response = await context.app.inject({
        method: "GET",
        url: playbackUrl,
        headers: { range },
      });
      assert.equal(response.statusCode, 206);
      assert.equal(
        response.headers["content-range"],
        `bytes ${expectedStart}-${expectedEnd}/${wav.length}`,
      );
      assert.deepEqual(
        response.rawPayload,
        wav.subarray(expectedStart, expectedEnd + 1),
      );
    }

    const head = await context.app.inject({
      method: "HEAD",
      url: playbackUrl,
    });
    assert.equal(head.statusCode, 200);
    assert.equal(head.headers["content-length"], String(wav.length));
    assert.equal(head.rawPayload.length, 0);

    const invalid = await context.app.inject({
      method: "GET",
      url: playbackUrl,
      headers: { range: `bytes=${wav.length}-` },
    });
    assert.equal(invalid.statusCode, 416);
    assert.equal(invalid.headers["content-range"], `bytes */${wav.length}`);

    await rm(trackPath);
    assert.equal(
      (
        await context.app.inject({
          method: "GET",
          url,
          headers: context.authorization,
        })
      ).statusCode,
      404,
    );
    assert.equal(
      (await context.database.orm.Track.firstOrThrow({ id: track.id }))
        .available,
      0,
    );
  } finally {
    await context.close();
  }
});

test("failed traversal does not reconcile tracks", async () => {
  const context = await createTestContext();
  const musicRoot = path.join(context.root, "music");
  const movedRoot = path.join(context.root, "music-moved");
  try {
    await writeFile(path.join(musicRoot, "kept.wav"), createWav());
    await startScan(context);
    await rename(musicRoot, movedRoot);
    const failedScan = await startScan(context);
    assert.equal(failedScan.status, "failed");
    assert.equal(failedScan.unavailableCount, 0);
    assert.equal(
      (await context.database.orm.Track.firstOrThrow()).available,
      1,
    );
    await rename(movedRoot, musicRoot);
  } finally {
    await context.close();
  }
});

test("changed files with unreadable metadata retain their previous catalog metadata", async () => {
  const context = await createTestContext();
  const trackPath = path.join(context.root, "music", "stable.wav");
  try {
    await writeFile(trackPath, createWav());
    await startScan(context);
    const before = await context.database.orm.Track.firstOrThrow();
    await writeFile(trackPath, Buffer.alloc(0));
    const scan = await startScan(context);
    assert.equal(scan.errorCount, 1);
    const after = await context.database.orm.Track.firstOrThrow();
    assert.equal(after.title, before.title);
    assert.equal(after.artist, before.artist);
    assert.equal(after.available, 1);
  } finally {
    await context.close();
  }
});

test("startup interrupts running tasks and resumes queued tasks", async () => {
  const context = await createTestContext();
  let restartedApp: FastifyInstance | undefined;
  try {
    const running = await context.database.orm.Task.create({
      kind: "library_scan",
      status: "running",
      title: "Interrupted scan",
      startedAt: new Date(),
    });
    const queued = await context.database.orm.Task.create({
      kind: "library_scan",
      status: "queued",
      title: "Queued scan",
    });
    await context.app.close();
    restartedApp = await buildApp({
      config: {
        databaseUrl: context.databaseUrl,
        libraryRoot: context.libraryRoot,
        webOrigins: ["http://127.0.0.1:17430"],
      },
      database: context.database,
      logger: false,
    });
    const interrupted = await context.database.orm.Task.firstOrThrow({
      id: running.id,
    });
    assert.equal(interrupted.status, "interrupted");
    assert.equal(
      interrupted.failureSummary,
      "The server stopped before this task completed.",
    );
    assert.ok(interrupted.completedAt);
    let resumedStatus = "queued";
    for (let attempt = 0; attempt < 300; attempt += 1) {
      resumedStatus = (
        await context.database.orm.Task.firstOrThrow({ id: queued.id })
      ).status;
      if (["completed", "failed", "interrupted"].includes(resumedStatus)) break;
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    assert.equal(resumedStatus, "completed");
  } finally {
    await restartedApp?.close();
    await context.close();
  }
});
