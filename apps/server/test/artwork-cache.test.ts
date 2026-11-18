import assert from "node:assert/strict";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import sharp from "sharp";
import { ArtworkCache } from "../src/artwork-cache.js";

test("artwork cache stores one bounded webp file per content hash", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "peridot-artwork-cache-"));
  const databasePath = path.join(root, "peridot.db").replaceAll("\\", "/");
  const cache = new ArtworkCache(`file:${databasePath}`);
  try {
    const source = await sharp({
      create: {
        background: "#00a63e",
        channels: 4,
        height: 1600,
        width: 900,
      },
    })
      .png()
      .toBuffer();

    const first = await cache.store(source);
    const second = await cache.store(source);
    assert.equal(second, first);
    assert.match(first, /^[a-f0-9]{64}$/);

    const stored = await cache.read(first);
    assert.ok(stored);
    assert.equal(path.basename(stored.path), `${first}.webp`);
    assert.ok(stored.size <= 512 * 1024);
    const metadata = await sharp(stored.path).metadata();
    assert.equal(metadata.format, "webp");
    assert.equal(metadata.width, 225);
    assert.equal(metadata.height, 400);
    assert.equal(
      (await readdir(path.join(root, "artwork"))).filter((entry) =>
        entry.endsWith(".webp"),
      ).length,
      1,
    );

    assert.equal(await cache.prune(new Set()), 1);
    assert.equal(await cache.read(first), null);
  } finally {
    await cache.close();
    await rm(root, { recursive: true, force: true });
  }
});
