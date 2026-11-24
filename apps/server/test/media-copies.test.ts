import assert from "node:assert/strict";
import test from "node:test";
import type { MediaCopyRow } from "../src/prisma/models.js";
import {
  primaryCopiesForMediaIds,
  rankedMediaCopies,
} from "../src/media-copies.js";
import { createMediaFixture, createTestContext } from "./helpers.js";

function copyValues(copy: MediaCopyRow) {
  return {
    mediaId: copy.mediaId,
    librarySourceId: copy.librarySourceId,
    relativePath: copy.relativePath,
    mediaType: copy.mediaType,
    mediaTypeOrigin: copy.mediaTypeOrigin,
    title: copy.title,
    artist: copy.artist,
    artistCredits: copy.artistCredits,
    albumArtist: copy.albumArtist,
    albumArtistCredits: copy.albumArtistCredits,
    album: copy.album,
    genres: copy.genres,
    discNumber: copy.discNumber,
    trackNumber: copy.trackNumber,
    durationMs: copy.durationMs,
    publishedAt: copy.publishedAt,
    coverId: copy.coverId,
    recordingIdentityKeys: copy.recordingIdentityKeys,
    audioLossless: copy.audioLossless,
    audioBitrate: copy.audioBitrate,
    mimeType: copy.mimeType,
    fileSizeBytes: copy.fileSizeBytes,
    fileModifiedAt: copy.fileModifiedAt,
    externalId: copy.externalId,
    externalVersion: copy.externalVersion,
    externalContainer: copy.externalContainer,
    externalCoverKey: copy.externalCoverKey,
    available: copy.available,
    lastSeenScanId: copy.lastSeenScanId,
    metadataVersion: copy.metadataVersion,
  };
}

test("playable copies rank by availability, quality, metadata, and source order", async () => {
  const context = await createTestContext();
  try {
    const firstSource = await context.database.orm.LibrarySource.create({
      kind: "path",
      path: context.libraryRoot,
      sourceIdentity: "first-ranked",
      position: 0,
    });
    const secondSource = await context.database.orm.LibrarySource.create({
      kind: "path",
      path: `${context.libraryRoot}-second`,
      sourceIdentity: "second-ranked",
      position: 1,
    });
    const { media, copy: baseline } = await createMediaFixture(context, {
      media: {
        title: "Ranked",
        artist: "Artist",
        album: "Album",
        durationMs: 60_000,
      },
      copy: {
        librarySourceId: firstSource.id,
        relativePath: "ranked.mp3",
        fileSizeBytes: 10n,
        audioBitrate: 320,
      },
    });
    const lossless = await context.database.orm.MediaCopy.create({
      ...copyValues(baseline),
      mediaId: media.id,
      librarySourceId: secondSource.id,
      relativePath: "ranked.flac",
      fileSizeBytes: 20n,
      audioLossless: 1,
      audioBitrate: 1_411,
      mimeType: "audio/flac",
    });
    const lowBitrate = await context.database.orm.MediaCopy.create({
      ...copyValues(baseline),
      mediaId: media.id,
      librarySourceId: secondSource.id,
      relativePath: "ranked-128.mp3",
      fileSizeBytes: 30n,
      audioBitrate: 128,
    });

    const ranked = await rankedMediaCopies(context.database, media.id);
    assert.deepEqual(
      ranked.map(({ copy }) => copy.id),
      [lossless.id, baseline.id, lowBitrate.id],
    );
    assert.equal(
      (await primaryCopiesForMediaIds(context.database, [media.id])).get(
        media.id,
      )?.copy.id,
      lossless.id,
    );

    await context.database.orm.MediaCopy.where({ id: lossless.id }).update({
      available: 0,
    });
    assert.equal(
      (await rankedMediaCopies(context.database, media.id))[0]?.copy.id,
      baseline.id,
    );
  } finally {
    await context.close();
  }
});

test("removing one source keeps media available through another copy", async () => {
  const context = await createTestContext();
  try {
    const primarySource = await context.database.orm.LibrarySource.create({
      kind: "path",
      path: context.libraryRoot,
      sourceIdentity: "removable",
      position: 0,
    });
    const backupSource = await context.database.orm.LibrarySource.create({
      kind: "jellyfin",
      name: "Backup",
      sourceIdentity: "backup",
      position: 1,
    });
    const { media, copy: primary } = await createMediaFixture(context, {
      media: {
        title: "Survivor",
        artist: "Artist",
        album: "Album",
      },
      copy: {
        librarySourceId: primarySource.id,
        relativePath: "survivor.mp3",
      },
    });
    await context.database.orm.MediaCopy.create({
      ...copyValues(primary),
      mediaId: media.id,
      librarySourceId: backupSource.id,
      relativePath: "jellyfin/survivor",
      externalId: "backup-external-id",
      externalContainer: "mp3",
    });

    const lookup = await context.app.inject({
      method: "GET",
      url: `/api/media/${media.id}`,
      headers: context.authorization,
    });
    assert.equal(lookup.statusCode, 200);
    assert.equal(lookup.json().copies.length, 2);

    const removed = await context.app.inject({
      method: "DELETE",
      url: `/api/admin/library-sources/${primarySource.id}`,
      headers: context.authorization,
    });
    assert.equal(removed.statusCode, 200, removed.body);
    const retained = await context.database.orm.Media.firstOrThrow({
      id: media.id,
    });
    assert.equal(retained.available, 1);
    const copies = await rankedMediaCopies(context.database, media.id);
    assert.deepEqual(
      copies.map(({ copy }) => copy.librarySourceId),
      [backupSource.id],
    );
  } finally {
    await context.close();
  }
});
