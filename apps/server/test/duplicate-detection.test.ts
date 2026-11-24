import assert from "node:assert/strict";
import { test } from "node:test";
import { CatalogService } from "../src/catalog.js";
import { MediaMatchService } from "../src/duplicate-detection.js";
import { primaryMediaCopy } from "../src/media-copies.js";
import { PlaybackTokenService } from "../src/playback-tokens.js";
import { createMediaFixture, createTestContext } from "./helpers.js";

test("media matching merges copies and redirects aliases", async () => {
  const context = await createTestContext();
  try {
    const firstSource = await context.database.orm.LibrarySource.create({
      kind: "path",
      path: context.libraryRoot,
      position: 0,
      sourceIdentity: "first",
    });
    const secondSource = await context.database.orm.LibrarySource.create({
      kind: "path",
      path: `${context.libraryRoot}-second`,
      position: 1,
      sourceIdentity: "second",
    });
    const mediaData = {
      mediaType: "music",
      title: "Shared",
      artist: "Artist",
      album: "Album",
      durationMs: 60_000,
      available: 1,
    };
    const { media: firstMedia } = await createMediaFixture(context, {
      media: mediaData,
      copy: {
        librarySourceId: firstSource.id,
        relativePath: "shared.flac",
        recordingIdentityKeys: JSON.stringify(["isrc:shared"]),
        mimeType: "audio/flac",
        fileSizeBytes: 10n,
        audioLossless: 1,
        audioBitrate: 1_411,
      },
    });
    const { media: secondMedia } = await createMediaFixture(context, {
      media: mediaData,
      copy: {
        librarySourceId: secondSource.id,
        relativePath: "shared.mp3",
        recordingIdentityKeys: JSON.stringify(["isrc:shared"]),
        mimeType: "audio/mpeg",
        fileSizeBytes: 5n,
        audioBitrate: 320,
      },
    });
    const user = await context.database.orm.User.firstOrThrow({
      email: "admin@example.com",
    });
    await context.database.orm.MediaLike.create({
      userId: user.id,
      mediaId: secondMedia.id,
    });

    const catalog = new CatalogService(
      context.database,
      new PlaybackTokenService(),
    );
    const service = new MediaMatchService(context.database, catalog);
    const result = await service.detect(new AbortController().signal);

    assert.equal(result.mergedCount, 1);
    assert.equal(
      await context.database.orm.Media.first({ id: secondMedia.id }),
      null,
    );
    assert.deepEqual(
      await context.database.orm.MediaCopy.where({
        mediaId: firstMedia.id,
      })
        .select("relativePath")
        .all(),
      [{ relativePath: "shared.flac" }, { relativePath: "shared.mp3" }],
    );
    assert.equal(
      (await context.database.orm.MediaAlias.first({ aliasId: secondMedia.id }))
        ?.mediaId,
      firstMedia.id,
    );
    assert.equal(
      (await context.database.orm.MediaLike.firstOrThrow()).mediaId,
      firstMedia.id,
    );
  } finally {
    await context.close();
  }
});

test("a better later copy does not change the canonical media identity", async () => {
  const context = await createTestContext();
  try {
    const { media: firstMedia } = await createMediaFixture(context, {
      media: {
        title: "Stable",
        artist: "Artist",
        album: "Album",
        durationMs: 90_000,
      },
      copy: {
        relativePath: "stable.mp3",
        recordingIdentityKeys: JSON.stringify(["musicbrainz:stable"]),
        audioBitrate: 320,
        fileSizeBytes: 10n,
      },
    });
    const { media: betterMedia } = await createMediaFixture(context, {
      media: {
        title: "Stable",
        artist: "Artist",
        album: "Album",
        durationMs: 90_000,
      },
      copy: {
        relativePath: "stable.flac",
        recordingIdentityKeys: JSON.stringify(["musicbrainz:stable"]),
        audioLossless: 1,
        audioBitrate: 1_411,
        fileSizeBytes: 50n,
      },
    });
    const catalog = new CatalogService(
      context.database,
      new PlaybackTokenService(),
    );
    const service = new MediaMatchService(context.database, catalog);
    await service.detect(new AbortController().signal);

    assert.ok(await context.database.orm.Media.first({ id: firstMedia.id }));
    assert.equal(
      await context.database.orm.Media.first({ id: betterMedia.id }),
      null,
    );
    assert.equal(
      (await primaryMediaCopy(context.database, firstMedia.id))?.copy.mediaId,
      firstMedia.id,
    );
  } finally {
    await context.close();
  }
});
