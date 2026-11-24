import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";
import sharp from "sharp";
import {
  createTaggedMp3,
  createTestContext,
  createWav,
  startScan,
} from "./helpers.js";

const png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAADUlEQVQImWNgWGb3HwADcgHkhrgr6AAAAABJRU5ErkJggg==",
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
        await context.database.orm.Cover.aggregate((aggregate) => ({
          count: aggregate.count(),
        }))
      ).count,
      1,
    );
    const tracks = await context.app.inject({
      method: "GET",
      url: "/api/media",
      headers: context.authorization,
    });
    const items = tracks.json<{
      items: Array<{ id: string; coverUrl: string | null }>;
    }>().items;
    assert.equal(items.length, 2);
    assert.ok(items.every((track) => Boolean(track.coverUrl)));
    assert.equal(items[0]!.coverUrl, items[1]!.coverUrl);

    const cover = await context.app.inject({
      method: "GET",
      url: items[0]!.coverUrl!,
    });
    assert.equal(cover.statusCode, 200);
    assert.equal(cover.headers["content-type"], "image/webp");
    const metadata = await sharp(cover.rawPayload).metadata();
    assert.equal(metadata.format, "webp");
    assert.ok((metadata.width ?? 0) <= 400);
    assert.ok((metadata.height ?? 0) <= 400);

    const unsigned = await context.app.inject({
      method: "GET",
      url: items[0]!.coverUrl!.split("?")[0]!,
    });
    assert.equal(unsigned.statusCode, 401);

    const playback = await context.app.inject({
      method: "POST",
      url: `/api/media/${items[0]!.id}/playback-token`,
      headers: context.authorization,
    });
    const wrongToken = await context.app.inject({
      method: "GET",
      url: `${items[0]!.coverUrl!.split("?")[0]}?coverToken=${encodeURIComponent(playback.json().token)}`,
    });
    assert.equal(wrongToken.statusCode, 401);
  } finally {
    await context.close();
  }
});

test("large artwork is normalized to webp with a 400 pixel maximum", async () => {
  const context = await createTestContext();
  try {
    const largeCover = await sharp({
      create: {
        background: "#00a63e",
        channels: 3,
        height: 1200,
        width: 800,
      },
    })
      .png()
      .toBuffer();
    await writeFile(
      path.join(context.libraryRoot, "large.mp3"),
      createTaggedMp3({
        title: "Large Artwork",
        artist: "Elliot Lake",
        album: "Night Sessions",
        cover: { data: largeCover, mimeType: "image/png" },
        discNumber: 1,
        trackNumber: 1,
      }),
    );

    await startScan(context);
    const tracks = await context.app.inject({
      method: "GET",
      url: "/api/media",
      headers: context.authorization,
    });
    const coverUrl = tracks.json<{
      items: Array<{ coverUrl: string | null }>;
    }>().items[0]?.coverUrl;
    assert.ok(coverUrl);

    const cover = await context.app.inject({
      method: "GET",
      url: coverUrl,
    });
    assert.equal(cover.statusCode, 200);
    assert.equal(cover.headers["content-type"], "image/webp");
    const metadata = await sharp(cover.rawPayload).metadata();
    assert.equal(metadata.format, "webp");
    assert.equal(metadata.width, 267);
    assert.equal(metadata.height, 400);
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
      url: "/api/media",
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
      url: "/api/media",
      headers: context.authorization,
    });
    assert.equal(tracks.json().items[0].coverUrl, null);
  } finally {
    await context.close();
  }
});
