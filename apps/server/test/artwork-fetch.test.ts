import assert from "node:assert/strict";
import path from "node:path";
import { test } from "node:test";
import { syncArtworkJobsInBatch } from "../src/artwork-fetch.js";
import { createMediaFixture, createTestContext } from "./helpers.js";

test("artwork job sync batches creates, updates, and removes pending jobs", async () => {
  const context = await createTestContext();
  try {
    const source = await context.database.orm.LibrarySource.create({
      kind: "path",
      path: path.join(context.root, "music"),
      position: 0,
    });
    const { copy: first } = await createMediaFixture(context, {
      media: { title: "First", artist: "Artist" },
      copy: {
        librarySourceId: source.id,
        relativePath: "first.mp3",
      },
    });
    const { copy: second } = await createMediaFixture(context, {
      media: { title: "Second", artist: "Artist" },
      copy: {
        librarySourceId: source.id,
        relativePath: "second.mp3",
      },
    });

    await syncArtworkJobsInBatch(context.database, [
      {
        copyId: first.id,
        librarySourceId: source.id,
        externalCoverItemId: "album-cover",
        externalCoverTag: "v1",
      },
      {
        copyId: second.id,
        librarySourceId: source.id,
        externalCoverItemId: null,
        externalCoverTag: null,
      },
    ]);
    assert.equal(
      (
        await context.database.orm.ArtworkJob.first({
          copyId: first.id,
        })
      )?.externalCoverTag,
      "v1",
    );
    assert.equal(
      await context.database.orm.ArtworkJob.first({
        copyId: second.id,
      }),
      null,
    );

    await syncArtworkJobsInBatch(context.database, [
      {
        copyId: first.id,
        librarySourceId: source.id,
        externalCoverItemId: "album-cover",
        externalCoverTag: "v2",
      },
    ]);
    const updated = await context.database.orm.ArtworkJob.first({
      copyId: first.id,
    });
    assert.equal(updated?.externalCoverTag, "v2");
    assert.equal(updated?.attemptCount, 0);

    await syncArtworkJobsInBatch(context.database, [
      {
        copyId: first.id,
        librarySourceId: source.id,
        externalCoverItemId: null,
        externalCoverTag: null,
      },
    ]);
    assert.equal(
      await context.database.orm.ArtworkJob.first({
        copyId: first.id,
      }),
      null,
    );
  } finally {
    await context.close();
  }
});
