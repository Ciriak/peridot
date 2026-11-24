import assert from "node:assert/strict";
import path from "node:path";
import { test } from "node:test";
import { syncArtworkJobsInBatch } from "../src/artwork-fetch.js";
import { createTestContext } from "./helpers.js";

test("artwork job sync batches creates, updates, and removes pending jobs", async () => {
  const context = await createTestContext();
  try {
    const source = await context.database.orm.Source.create({
      kind: "path",
      path: path.join(context.root, "music"),
      position: 0,
    });
    const first = await context.database.orm.Track.create({
      title: "First",
      artist: "Artist",
      relativePath: "first.mp3",
      mimeType: "audio/mpeg",
      fileSizeBytes: 1n,
      fileModifiedAt: new Date(0),
      sourceId: source.id,
    });
    const second = await context.database.orm.Track.create({
      title: "Second",
      artist: "Artist",
      relativePath: "second.mp3",
      mimeType: "audio/mpeg",
      fileSizeBytes: 1n,
      fileModifiedAt: new Date(0),
      sourceId: source.id,
    });

    await syncArtworkJobsInBatch(context.database, [
      {
        trackId: first.id,
        sourceId: source.id,
        externalCoverItemId: "album-cover",
        externalCoverTag: "v1",
      },
      {
        trackId: second.id,
        sourceId: source.id,
        externalCoverItemId: null,
        externalCoverTag: null,
      },
    ]);
    assert.equal(
      (
        await context.database.orm.ArtworkJob.first({
          trackId: first.id,
        })
      )?.externalCoverTag,
      "v1",
    );
    assert.equal(
      await context.database.orm.ArtworkJob.first({
        trackId: second.id,
      }),
      null,
    );

    await syncArtworkJobsInBatch(context.database, [
      {
        trackId: first.id,
        sourceId: source.id,
        externalCoverItemId: "album-cover",
        externalCoverTag: "v2",
      },
    ]);
    const updated = await context.database.orm.ArtworkJob.first({
      trackId: first.id,
    });
    assert.equal(updated?.externalCoverTag, "v2");
    assert.equal(updated?.attemptCount, 0);

    await syncArtworkJobsInBatch(context.database, [
      {
        trackId: first.id,
        sourceId: source.id,
        externalCoverItemId: null,
        externalCoverTag: null,
      },
    ]);
    assert.equal(
      await context.database.orm.ArtworkJob.first({
        trackId: first.id,
      }),
      null,
    );
  } finally {
    await context.close();
  }
});
