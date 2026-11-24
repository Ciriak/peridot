import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import type { MediaCopyRow } from "../src/prisma/models.js";
import type { LibrarySourceConnectorDefinition } from "../src/source-integrations.js";
import { createMediaFixture, createTestContext, createWav } from "./helpers.js";

function copyValues(copy: MediaCopyRow) {
  return {
    mediaId: copy.mediaId,
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

test("playback falls back before headers and serves HEAD and ranges from the ranked copy", async () => {
  const context = await createTestContext();
  const missingRoot = path.join(context.root, "missing");
  const availableRoot = path.join(context.root, "available");
  try {
    await Promise.all([
      mkdir(missingRoot, { recursive: true }),
      mkdir(availableRoot, { recursive: true }),
    ]);
    const bytes = createWav(20);
    await writeFile(path.join(availableRoot, "fallback.wav"), bytes);
    const missingSource = await context.database.orm.LibrarySource.create({
      kind: "path",
      path: missingRoot,
      sourceIdentity: "missing-first",
      position: 0,
    });
    const availableSource = await context.database.orm.LibrarySource.create({
      kind: "path",
      path: availableRoot,
      sourceIdentity: "available-second",
      position: 1,
    });
    const { media, copy: baseline } = await createMediaFixture(context, {
      media: {
        title: "Fallback",
        artist: "Artist",
        album: "Album",
      },
      copy: {
        librarySourceId: missingSource.id,
        relativePath: "fallback.wav",
        mimeType: "audio/wav",
        fileSizeBytes: BigInt(bytes.length),
      },
    });
    const fallback = await context.database.orm.MediaCopy.create({
      ...copyValues(baseline),
      mediaId: media.id,
      librarySourceId: availableSource.id,
      relativePath: "fallback.wav",
      mimeType: "audio/wav",
      fileSizeBytes: BigInt(bytes.length),
    });

    const tokenResponse = await context.app.inject({
      method: "POST",
      url: `/api/media/${media.id}/playback-token`,
      headers: context.authorization,
    });
    const playbackToken = tokenResponse.json<{ token: string }>().token;
    const url = `/api/media/${media.id}/audio?playbackToken=${encodeURIComponent(playbackToken)}`;

    const ranged = await context.app.inject({
      method: "GET",
      url,
      headers: { range: "bytes=0-9" },
    });
    assert.equal(ranged.statusCode, 206, ranged.body);
    assert.equal(ranged.headers["content-range"], `bytes 0-9/${bytes.length}`);
    assert.equal(ranged.rawPayload.length, 10);
    assert.equal(
      (
        await context.database.orm.MediaCopy.first({
          librarySourceId: missingSource.id,
        })
      )?.available,
      0,
    );
    assert.equal(
      (
        await context.database.orm.MediaCopy.first({
          id: fallback.id,
        })
      )?.available,
      1,
    );

    const head = await context.app.inject({
      method: "HEAD",
      url,
    });
    assert.equal(head.statusCode, 200, head.body);
    assert.equal(head.headers["content-length"], String(bytes.length));
  } finally {
    await context.close();
  }
});

test("a mid-stream source failure marks that copy unavailable for the retry", async () => {
  let opened = 0;
  const failingSource: LibrarySourceConnectorDefinition = {
    kind: "failing-stream",
    async discover() {
      return [];
    },
    async validateSource() {
      return {
        identity: "failing-stream",
        name: "Failing stream",
        configuration: {},
        credentials: {},
      };
    },
    async scan() {},
    async artwork() {
      return null;
    },
    async openAudio() {
      opened += 1;
      const body = new ReadableStream<Uint8Array>({
        start(controller) {
          setTimeout(() => {
            controller.enqueue(new Uint8Array([1, 2, 3, 4]));
          }, 10);
          setTimeout(
            () => controller.error(new Error("upstream stream failed")),
            100,
          );
        },
      });
      return new Response(body, {
        headers: {
          "content-type": "audio/mpeg",
          "content-length": "100",
          "accept-ranges": "bytes",
        },
      });
    },
  };
  const context = await createTestContext({
    additionalSourceIntegrations: [failingSource],
  });
  const fallbackRoot = path.join(context.root, "fallback");
  try {
    await mkdir(fallbackRoot, { recursive: true });
    const bytes = createWav(20);
    await writeFile(path.join(fallbackRoot, "fallback.wav"), bytes);
    const failing = await context.database.orm.LibrarySource.create({
      kind: "failing-stream",
      name: "Failing source",
      sourceIdentity: "failing-stream",
      position: 0,
    });
    const fallbackSource = await context.database.orm.LibrarySource.create({
      kind: "path",
      path: fallbackRoot,
      sourceIdentity: "fallback-source",
      position: 1,
    });
    const { media, copy: baseline } = await createMediaFixture(context, {
      media: {
        title: "Resumable",
        artist: "Artist",
        album: "Album",
      },
      copy: {
        librarySourceId: failing.id,
        relativePath: "remote/resumable",
        externalId: "remote-resumable",
        externalContainer: "mp3",
        fileSizeBytes: 100n,
      },
    });
    await context.database.orm.MediaCopy.create({
      ...copyValues(baseline),
      mediaId: media.id,
      librarySourceId: fallbackSource.id,
      relativePath: "fallback.wav",
      externalId: null,
      externalContainer: null,
      mimeType: "audio/wav",
      fileSizeBytes: 10n,
    });

    const tokenResponse = await context.app.inject({
      method: "POST",
      url: `/api/media/${media.id}/playback-token`,
      headers: context.authorization,
    });
    const playbackToken = tokenResponse.json<{ token: string }>().token;
    const url = `/api/media/${media.id}/audio?playbackToken=${encodeURIComponent(playbackToken)}`;
    const address = await context.app.listen({ host: "127.0.0.1", port: 0 });

    await fetch(address + url, { headers: { range: "bytes=0-9" } })
      .then((response) => response.arrayBuffer())
      .catch(() => undefined);
    assert.equal(opened, 1, "the first ranked connector copy should be tried");
    for (let attempt = 0; attempt < 50; attempt += 1) {
      const copy = await context.database.orm.MediaCopy.first({
        id: baseline.id,
      });
      if (copy?.available === 0) break;
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    assert.equal(
      (await context.database.orm.MediaCopy.first({ id: baseline.id }))
        ?.available,
      0,
    );

    const retry = await fetch(address + url, {
      headers: { range: "bytes=0-9" },
    });
    assert.equal(retry.status, 206);
    assert.equal((await retry.arrayBuffer()).byteLength, 10);
    assert.equal(opened, 1);
  } finally {
    await context.close();
  }
});
