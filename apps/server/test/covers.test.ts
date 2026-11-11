import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";
import {
  createTaggedMp3,
  createTestContext,
  createWav,
  startScan,
} from "./helpers.js";

const png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl2nXQAAAAASUVORK5CYII=",
  "base64",
);

test("embedded artwork is deduplicated and served through a signed URL", async () => {
  const context = await createTestContext();
  const albumRoot = path.join(context.libraryRoot, "Night Sessions");
  try {
    await mkdir(albumRoot);
    for (const [index, title] of ["Blue Hours", "Last Train"].entries()) {
      await writeFile(
        path.join(albumRoot, `${index + 1}.mp3`),
        createTaggedMp3({
          title,
          artist: "Elliot Lake",
          album: "Night Sessions",
          discNumber: 1,
          trackNumber: index + 1,
          cover: { mimeType: "image/png", data: png },
        }),
      );
    }
    await startScan(context);
    assert.equal(
      (
        await context.database.orm.TrackCover.aggregate((aggregate) => ({
          count: aggregate.count(),
        }))
      ).count,
      1,
    );
    const tracks = await context.app.inject({
      method: "GET",
      url: "/api/tracks",
      headers: context.authorization,
    });
    const items = tracks.json<{
      items: Array<{ id: string; coverUrl: string | null }>;
    }>().items;
    assert.equal(items.length, 2);
    assert.ok(items.every((track) => Boolean(track.coverUrl)));

    const cover = await context.app.inject({
      method: "GET",
      url: items[0]!.coverUrl!,
    });
    assert.equal(cover.statusCode, 200);
    assert.equal(cover.headers["content-type"], "image/png");
    assert.deepEqual(cover.rawPayload, png);

    const unsigned = await context.app.inject({
      method: "GET",
      url: `/api/tracks/${items[0]!.id}/cover`,
    });
    assert.equal(unsigned.statusCode, 401);

    const playback = await context.app.inject({
      method: "POST",
      url: `/api/tracks/${items[0]!.id}/playback-token`,
      headers: context.authorization,
    });
    const wrongToken = await context.app.inject({
      method: "GET",
      url: `/api/tracks/${items[0]!.id}/cover?coverToken=${encodeURIComponent(playback.json().token)}`,
    });
    assert.equal(wrongToken.statusCode, 401);
  } finally {
    await context.close();
  }
});

test("folder artwork is used when a file has no embedded cover", async () => {
  const context = await createTestContext();
  try {
    await writeFile(path.join(context.libraryRoot, "song.wav"), createWav());
    await writeFile(path.join(context.libraryRoot, "cover.png"), png);
    await startScan(context);
    const tracks = await context.app.inject({
      method: "GET",
      url: "/api/tracks",
      headers: context.authorization,
    });
    const track = tracks.json<{
      items: Array<{ coverUrl: string | null }>;
    }>().items[0];
    assert.ok(track?.coverUrl);
  } finally {
    await context.close();
  }
});

test("tracks without artwork retain the null-cover fallback", async () => {
  const context = await createTestContext();
  try {
    await writeFile(path.join(context.libraryRoot, "song.wav"), createWav());
    await startScan(context);
    const tracks = await context.app.inject({
      method: "GET",
      url: "/api/tracks",
      headers: context.authorization,
    });
    assert.equal(tracks.json().items[0].coverUrl, null);
  } finally {
    await context.close();
  }
});
