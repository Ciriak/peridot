import assert from "node:assert/strict";
import { test } from "node:test";
import type {
  ResolveTracksResponse,
  TrackListResponse,
} from "@peridot/contracts";
import { CatalogService } from "../src/catalog.js";
import { DuplicateDetectionService } from "../src/duplicate-detection.js";
import { PlaybackTokenService } from "../src/playback-tokens.js";
import type { TrackRow } from "../src/prisma/models.js";
import { createTestContext, type TestContext } from "./helpers.js";

async function track(
  context: TestContext,
  sourceId: string,
  overrides: Partial<TrackRow> & {
    id: string;
    title: string;
    artist: string;
    relativePath: string;
  },
): Promise<TrackRow> {
  return context.database.orm.Track.create({
    mediaType: "music",
    album: "Album",
    durationMs: 180_000,
    mimeType: "audio/mpeg",
    fileSizeBytes: 1_000n,
    fileModifiedAt: new Date("2026-01-01T00:00:00.000Z"),
    sourceId,
    ...overrides,
    artistCredits:
      overrides.artistCredits ?? JSON.stringify([overrides.artist]),
  });
}

async function runDetection(context: TestContext) {
  const catalog = new CatalogService(
    context.database,
    new PlaybackTokenService(),
  );
  await catalog.initialize();
  const service = new DuplicateDetectionService(context.database, catalog);
  return {
    catalog,
    service,
    result: await service.detect(new AbortController().signal),
  };
}

test("duplicate detection keeps the best copy, hides the rest, and transfers user references", async () => {
  const context = await createTestContext();
  try {
    const [preferredSource, secondarySource] = await Promise.all([
      context.database.orm.Source.create({
        kind: "path",
        name: "Primary",
        path: context.libraryRoot,
        sourceIdentity: "primary",
        position: 0,
      }),
      context.database.orm.Source.create({
        kind: "path",
        name: "Secondary",
        path: context.libraryRoot,
        sourceIdentity: "secondary",
        position: 1,
      }),
    ]);
    const hidden = await track(context, secondarySource.id, {
      id: "track-hidden",
      title: "Same Song",
      artist: "Same Artist",
      relativePath: "hidden.mp3",
      durationMs: 180_500,
    });
    const canonical = await track(context, preferredSource.id, {
      id: "track-canonical",
      title: "Same Song",
      artist: "Same Artist",
      relativePath: "canonical.flac",
      mimeType: "audio/flac",
      durationMs: 180_100,
      audioLossless: 1,
      audioBitrate: 1_411_200,
      fileSizeBytes: 50_000_000n,
    });
    const unrelated = await track(context, preferredSource.id, {
      id: "track-unrelated",
      title: "Same Song",
      artist: "Same Artist",
      relativePath: "live.flac",
      durationMs: 195_000,
    });
    const catalog = new CatalogService(
      context.database,
      new PlaybackTokenService(),
    );
    await catalog.initialize();
    for (const item of [hidden, canonical, unrelated]) {
      await catalog.reindexTrack(item.id);
    }

    const user = await context.database.orm.User.first({
      email: "admin@example.com",
    });
    assert.ok(user);
    const playlist = await context.database.orm.Playlist.create({
      userId: user.id,
      name: "Transfer",
    });
    await Promise.all([
      context.database.orm.TrackLike.create({
        userId: user.id,
        trackId: hidden.id,
      }),
      context.database.orm.TrackPlayEvent.create({
        userId: user.id,
        trackId: hidden.id,
      }),
      context.database.orm.PlaylistItem.create({
        playlistId: playlist.id,
        position: 0,
        identityKey: `catalog:${encodeURIComponent(hidden.id)}`,
        trackId: hidden.id,
        snapshotTitle: hidden.title,
        snapshotArtist: hidden.artist,
        snapshotAlbum: hidden.album,
        snapshotDuration: hidden.durationMs,
      }),
    ]);

    const service = new DuplicateDetectionService(context.database, catalog);
    const result = await service.detect(new AbortController().signal);
    assert.equal(result.groupCount, 1);
    assert.equal(result.hiddenCount, 1);

    const hiddenAfter = await context.database.orm.Track.first({
      id: hidden.id,
    });
    assert.equal(hiddenAfter?.duplicateOfId, canonical.id);
    assert.equal(
      (await context.database.orm.Track.first({ id: unrelated.id }))
        ?.duplicateOfId,
      null,
    );

    const list = await context.app.inject({
      method: "GET",
      url: "/api/tracks?limit=20",
      headers: context.authorization,
    });
    assert.equal(list.statusCode, 200);
    const tracks = list.json<TrackListResponse>();
    assert.equal(tracks.totalCount, 2);
    assert.ok(tracks.items.some((item) => item.id === canonical.id));
    assert.ok(!tracks.items.some((item) => item.id === hidden.id));

    const resolved = await context.app.inject({
      method: "POST",
      url: "/api/tracks/resolve",
      headers: context.authorization,
      payload: { ids: [hidden.id] },
    });
    assert.equal(resolved.statusCode, 200);
    const resolution = resolved.json<ResolveTracksResponse>();
    assert.equal(resolution.items[0]?.id, canonical.id);
    assert.equal(resolution.aliases[hidden.id], canonical.id);

    assert.equal(
      (
        await context.database.orm.TrackLike.first({
          userId: user.id,
          trackId: canonical.id,
        })
      )?.trackId,
      canonical.id,
    );
    assert.equal(
      (
        await context.database.orm.TrackPlayEvent.first({
          userId: user.id,
        })
      )?.trackId,
      canonical.id,
    );
    assert.equal(
      (
        await context.database.orm.PlaylistItem.first({
          playlistId: playlist.id,
        })
      )?.trackId,
      canonical.id,
    );
  } finally {
    await context.close();
  }
});

test("recording identifiers override duration and non-music requires the same collection", async () => {
  const context = await createTestContext();
  try {
    const source = await context.database.orm.Source.create({
      kind: "path",
      name: "Library",
      path: context.libraryRoot,
      sourceIdentity: "library",
      position: 0,
    });
    const identity = JSON.stringify(["musicbrainz:recording-1"]);
    await Promise.all([
      track(context, source.id, {
        id: "identity-a",
        title: "Identified",
        artist: "Artist",
        relativePath: "a.mp3",
        recordingIdentityKeys: identity,
        durationMs: 100_000,
      }),
      track(context, source.id, {
        id: "identity-b",
        title: "Different title",
        artist: "Artist",
        relativePath: "b.mp3",
        recordingIdentityKeys: identity,
        durationMs: 500_000,
      }),
      track(context, source.id, {
        id: "book-a",
        title: "Chapter",
        artist: "Author",
        mediaType: "audiobook",
        album: "Book One",
        relativePath: "book-a.mp3",
        durationMs: 60_000,
      }),
      track(context, source.id, {
        id: "book-b",
        title: "Chapter",
        artist: "Author",
        mediaType: "audiobook",
        album: "Book Two",
        relativePath: "book-b.mp3",
        durationMs: 60_000,
      }),
      track(context, source.id, {
        id: "book-c",
        title: "Chapter",
        artist: "Author",
        mediaType: "audiobook",
        album: "Book One",
        relativePath: "book-c.mp3",
        durationMs: 60_400,
      }),
    ]);

    const { result } = await runDetection(context);
    assert.equal(result.groupCount, 2);
    assert.equal(
      (await context.database.orm.Track.first({ id: "identity-b" }))
        ?.duplicateOfId,
      "identity-a",
    );
    assert.equal(
      (await context.database.orm.Track.first({ id: "book-b" }))?.duplicateOfId,
      null,
    );
    assert.ok(
      await context.database.orm.Track.first({ id: "book-c" }).then(
        (row) =>
          row?.duplicateOfId === "book-a" || row?.duplicateOfId === "book-c",
      ),
    );
  } finally {
    await context.close();
  }
});

test("duration-only fallback rejects missing and distant durations", async () => {
  const context = await createTestContext();
  try {
    const source = await context.database.orm.Source.create({
      kind: "path",
      name: "Library",
      path: context.libraryRoot,
      sourceIdentity: "library",
      position: 0,
    });
    await Promise.all([
      track(context, source.id, {
        id: "short-a",
        title: "Ephemeral",
        artist: "Artist",
        relativePath: "short-a.mp3",
        durationMs: 100_000,
      }),
      track(context, source.id, {
        id: "short-b",
        title: "Ephemeral",
        artist: "Artist",
        relativePath: "short-b.mp3",
        durationMs: 102_000,
      }),
      track(context, source.id, {
        id: "unknown-a",
        title: "Unknown",
        artist: "Artist",
        relativePath: "unknown-a.mp3",
        durationMs: null,
      }),
      track(context, source.id, {
        id: "unknown-b",
        title: "Unknown",
        artist: "Artist",
        relativePath: "unknown-b.mp3",
        durationMs: null,
      }),
    ]);
    const { result } = await runDetection(context);
    assert.equal(result.groupCount, 0);
  } finally {
    await context.close();
  }
});
