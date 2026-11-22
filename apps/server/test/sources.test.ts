import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import type {
  AlbumListResponse,
  LikeListResponse,
  PlaylistDetailResponse,
  TrackListResponse,
} from "@peridot/contracts";
import {
  createMemberSession,
  createTaggedMp3,
  createTestContext,
  createWav,
  startScan,
  waitForScan,
} from "./helpers.js";
import { normalizeLegacyJellyfinSources } from "../src/sources.js";

test("administrators can read server counts and the default source", async () => {
  const context = await createTestContext();
  try {
    const status = await context.app.inject({
      method: "GET",
      url: "/api/admin/server",
      headers: context.authorization,
    });
    assert.equal(status.statusCode, 200);
    assert.deepEqual(status.json(), {
      trackCount: 0,
      availableTrackCount: 0,
      scanning: {
        workerCount: 3,
      },
      sourceRefresh: {
        enabled: true,
        cron: "0 3 * * *",
        nextRunAt: null,
      },
      fileLogging: {
        enabled: true,
        retentionDays: 5,
        path: path.join(context.root, "peridot.log"),
      },
    });

    const sources = await context.app.inject({
      method: "GET",
      url: "/api/admin/sources",
      headers: context.authorization,
    });
    assert.equal(sources.statusCode, 200);
    const items = sources.json<{ items: Array<Record<string, unknown>> }>()
      .items;
    assert.equal(items.length, 1);
    assert.equal(items[0]?.kind, "path");
    assert.equal(items[0]?.path, context.libraryRoot);
    assert.equal(items[0]?.fileCount, 0);
    assert.equal(items[0]?.lastSyncedAt, null);
  } finally {
    await context.close();
  }
});

test("legacy Jellyfin plugin sources are normalized from stored data", async () => {
  const context = await createTestContext();
  const serverUrl = "https://jellyfin.example.test/";
  const libraryId = "music-library";
  try {
    await context.database.orm.Source.create({
      kind: "plugin",
      name: "Audio",
      url: serverUrl,
      configuration: JSON.stringify({ libraryId, url: serverUrl }),
      position: 1,
    });
    await context.database.orm.Source.create({
      kind: "plugin",
      name: "Legacy plugin",
      url: "https://plugin.example.test/",
      configuration: JSON.stringify({ custom: "value" }),
      position: 2,
    });

    assert.equal(await normalizeLegacyJellyfinSources(context.database), 1);

    const normalized = await context.database.orm.Source.firstOrThrow({
      name: "Audio",
    });
    assert.equal(normalized.kind, "jellyfin");
    assert.deepEqual(JSON.parse(normalized.sourceIdentity!), [
      serverUrl,
      libraryId,
    ]);

    const untouched = await context.database.orm.Source.firstOrThrow({
      name: "Legacy plugin",
    });
    assert.equal(untouched.kind, "plugin");
    assert.equal(untouched.sourceIdentity, null);

    const sources = await context.app.inject({
      method: "GET",
      url: "/api/admin/sources",
      headers: context.authorization,
    });
    const listed = sources
      .json<{ items: Array<{ id: string; kind: string }> }>()
      .items.find((source) => source.id === normalized.id);
    assert.equal(listed?.kind, "jellyfin");
  } finally {
    await context.close();
  }
});

test("source mutations are allowed by the configured web origin", async () => {
  const context = await createTestContext();
  try {
    for (const method of ["PUT", "DELETE"]) {
      const response = await context.app.inject({
        method: "OPTIONS",
        url: "/api/admin/sources/order",
        headers: {
          origin: "http://127.0.0.1:17430",
          "access-control-request-method": method,
          "access-control-request-headers": "authorization,content-type",
        },
      });

      assert.equal(response.statusCode, 204);
      assert.equal(
        response.headers["access-control-allow-origin"],
        "http://127.0.0.1:17430",
      );
      assert.match(
        String(response.headers["access-control-allow-methods"]),
        new RegExp(`(^|,\\s*)${method}($|,\\s*)`),
      );
    }
  } finally {
    await context.close();
  }
});

test("administrators can add and remove path and url sources", async () => {
  const context = await createTestContext();
  const secondRoot = path.join(context.root, "second");
  try {
    await mkdir(secondRoot);
    await writeFile(path.join(secondRoot, "added.wav"), createWav());
    const created = await context.app.inject({
      method: "POST",
      url: "/api/admin/sources",
      headers: context.authorization,
      payload: { kind: "path", path: secondRoot },
    });
    assert.equal(created.statusCode, 201);
    const createdSource = created.json<{
      id: string;
      path: string;
      fileCount: number;
      lastSyncedAt: string | null;
      task: {
        id: string;
        kind: string;
        source: { id: string; name: string };
        status: string;
      };
    }>();
    assert.equal(createdSource.path, secondRoot);
    assert.equal(createdSource.fileCount, 0);
    assert.equal(createdSource.lastSyncedAt, null);
    assert.equal(createdSource.task.kind, "library_scan");
    assert.equal(createdSource.task.source.id, createdSource.id);
    assert.equal(createdSource.task.source.name, "second");
    assert.equal(createdSource.task.status, "queued");

    const sourceScan = await waitForScan(context, createdSource.task.id);
    assert.equal(sourceScan.status, "completed");
    assert.equal(sourceScan.metadataStatus, "completed");
    assert.equal(sourceScan.createdCount, 1);
    assert.equal(sourceScan.metadataTotalCount, 1);
    assert.equal(sourceScan.metadataProcessedCount, 1);

    const url = await context.app.inject({
      method: "POST",
      url: "/api/admin/sources",
      headers: context.authorization,
      payload: { kind: "url", url: "https://example.com/music" },
    });
    assert.equal(url.statusCode, 201);
    assert.equal(url.json().url, "https://example.com/music");
    assert.equal(url.json().task, null);

    const list = await context.app.inject({
      method: "GET",
      url: "/api/admin/sources",
      headers: context.authorization,
    });
    const listedSources = list.json<{
      items: Array<{
        id: string;
        fileCount: number;
        lastSyncedAt: string | null;
      }>;
    }>().items;
    assert.equal(listedSources.length, 3);
    const scannedSource = listedSources.find(
      (source) => source.id === createdSource.id,
    );
    assert.equal(scannedSource?.fileCount, 1);
    assert.ok(scannedSource?.lastSyncedAt);

    const tracksBeforeRemoval = await context.app.inject({
      method: "GET",
      url: "/api/tracks",
      headers: context.authorization,
    });
    const removedTrack = tracksBeforeRemoval
      .json<{ items: Array<{ id: string; sourceKind: string | null }> }>()
      .items.at(0);
    assert.ok(removedTrack);
    assert.equal(removedTrack.sourceKind, "path");
    assert.equal(tracksBeforeRemoval.body.includes(secondRoot), false);

    const removed = await context.app.inject({
      method: "DELETE",
      url: `/api/admin/sources/${createdSource.id}`,
      headers: context.authorization,
    });
    assert.equal(removed.statusCode, 200);
    assert.deepEqual(removed.json(), {
      sourceId: createdSource.id,
      unavailableTrackCount: 1,
      affectedAlbumCount: 0,
      affectedArtistCount: 1,
      durationMs: removed.json().durationMs,
    });

    const tracksAfterRemoval = await context.app.inject({
      method: "GET",
      url: "/api/tracks",
      headers: context.authorization,
    });
    assert.deepEqual(tracksAfterRemoval.json().items, []);
    const retainedTrack = await context.database.orm.Track.where({
      id: removedTrack.id,
    }).first();
    assert.equal(retainedTrack?.available, 0);
    assert.equal(retainedTrack?.sourceId, createdSource.id);
    const retainedProjection = await context.database.orm.CatalogTrack.where({
      id: removedTrack.id,
    }).first();
    assert.equal(retainedProjection?.available, 0);
    assert.equal(retainedProjection?.sourceId, createdSource.id);
    const retainedSource = await context.database.orm.Source.where({
      id: createdSource.id,
    }).first();
    assert.ok(retainedSource?.removedAt);
    assert.equal(retainedSource?.credentialCiphertext, null);

    const sourcesAfterRemoval = await context.app.inject({
      method: "GET",
      url: "/api/admin/sources",
      headers: context.authorization,
    });
    assert.equal(
      sourcesAfterRemoval
        .json<{ items: Array<{ id: string }> }>()
        .items.some((source) => source.id === createdSource.id),
      false,
    );
  } finally {
    await context.close();
  }
});

test("source removal preserves personal references and revives them when re-added", async () => {
  const context = await createTestContext();
  const albumDirectory = path.join(context.libraryRoot, "Preserved Album");
  try {
    await mkdir(albumDirectory);
    await writeFile(
      path.join(albumDirectory, "track.mp3"),
      createTaggedMp3({
        title: "Preserved Track",
        artist: "Preserved Artist",
        albumArtist: "Preserved Artist",
        album: "Preserved Album",
        discNumber: 1,
        trackNumber: 1,
      }),
    );
    await startScan(context);

    const tracks = await context.app.inject({
      method: "GET",
      url: "/api/tracks?availability=all",
      headers: context.authorization,
    });
    const track = tracks.json<TrackListResponse>().items[0];
    assert.ok(track);
    assert.ok(track.albumId);
    assert.ok(track.album);

    const likedTrack = await context.app.inject({
      method: "POST",
      url: "/api/likes",
      headers: context.authorization,
      payload: { kind: "track", trackId: track.id },
    });
    assert.equal(likedTrack.statusCode, 200);
    const likedAlbum = await context.app.inject({
      method: "POST",
      url: "/api/likes",
      headers: context.authorization,
      payload: {
        kind: "album",
        albumId: track.albumId,
        title: track.album,
        artist: track.artist,
      },
    });
    assert.equal(likedAlbum.statusCode, 200);

    const playlist = await context.app.inject({
      method: "POST",
      url: "/api/playlists",
      headers: context.authorization,
      payload: { name: "Preserved playlist" },
    });
    assert.equal(playlist.statusCode, 201);
    const playlistId = playlist.json<PlaylistDetailResponse>().id;
    const added = await context.app.inject({
      method: "POST",
      url: `/api/playlists/${playlistId}/items`,
      headers: context.authorization,
      payload: { kind: "catalog", trackId: track.id },
    });
    assert.equal(added.statusCode, 201);

    const source = await context.database.orm.Source.firstOrThrow({
      path: context.libraryRoot,
    });
    const removed = await context.app.inject({
      method: "DELETE",
      url: `/api/admin/sources/${source.id}`,
      headers: context.authorization,
    });
    assert.equal(removed.statusCode, 200);

    const likedAfterRemoval = await context.app.inject({
      method: "GET",
      url: "/api/likes",
      headers: context.authorization,
    });
    const liked = likedAfterRemoval.json<LikeListResponse>();
    assert.deepEqual(
      liked.tracks.map((item) => item.trackId),
      [track.id],
    );
    assert.deepEqual(
      liked.albums.map((item) => item.albumId),
      [track.albumId],
    );

    const unavailableLikedTracks = await context.app.inject({
      method: "GET",
      url: "/api/tracks?liked=true&availability=all",
      headers: context.authorization,
    });
    assert.equal(unavailableLikedTracks.statusCode, 200);
    assert.equal(
      unavailableLikedTracks.json<TrackListResponse>().items[0]?.available,
      false,
    );

    const normalAlbums = await context.app.inject({
      method: "GET",
      url: "/api/albums",
      headers: context.authorization,
    });
    assert.equal(normalAlbums.json<AlbumListResponse>().items.length, 0);
    const likedAlbums = await context.app.inject({
      method: "GET",
      url: "/api/albums?liked=true",
      headers: context.authorization,
    });
    assert.equal(
      likedAlbums.json<AlbumListResponse>().items[0]?.available,
      false,
    );

    const playlistAfterRemoval = await context.app.inject({
      method: "GET",
      url: `/api/playlists/${playlistId}`,
      headers: context.authorization,
    });
    const playlistEntry =
      playlistAfterRemoval.json<PlaylistDetailResponse>().entries[0];
    assert.equal(playlistEntry?.track?.id, track.id);
    assert.equal(playlistEntry?.available, false);
    const restored = await context.app.inject({
      method: "POST",
      url: "/api/admin/sources",
      headers: context.authorization,
      payload: { kind: "path", path: context.libraryRoot },
    });
    assert.equal(restored.statusCode, 201);
    const restoredSource = restored.json<{
      id: string;
      task: { id: string };
    }>();
    assert.equal(restoredSource.id, source.id);
    await waitForScan(context, restoredSource.task.id);

    const restoredTracks = await context.app.inject({
      method: "GET",
      url: "/api/tracks?availability=all",
      headers: context.authorization,
    });
    assert.equal(
      restoredTracks.json<TrackListResponse>().items[0]?.id,
      track.id,
    );
    assert.equal(
      restoredTracks.json<TrackListResponse>().items[0]?.available,
      true,
    );
  } finally {
    await context.close();
  }
});

test("invalid sources are rejected with a clear error", async () => {
  const context = await createTestContext();
  try {
    const payloads = [
      {},
      { kind: "unknown" },
      { kind: "path" },
      { kind: "path", path: "" },
      { kind: "path", path: path.join(context.root, "missing") },
      { kind: "url", url: "not-a-url" },
      { kind: "url", url: "ftp://example.com/music" },
      { kind: "integration" },
    ];
    for (const payload of payloads) {
      const response = await context.app.inject({
        method: "POST",
        url: "/api/admin/sources",
        headers: context.authorization,
        payload,
      });
      assert.equal(response.statusCode, 400);
      assert.equal(response.json().error.code, "invalid_source");
    }
  } finally {
    await context.close();
  }
});

test("duplicate path sources are rejected", async () => {
  const context = await createTestContext();
  try {
    const response = await context.app.inject({
      method: "POST",
      url: "/api/admin/sources",
      headers: context.authorization,
      payload: { kind: "path", path: context.libraryRoot },
    });
    assert.equal(response.statusCode, 400);
    assert.equal(response.json().error.code, "invalid_source");
  } finally {
    await context.close();
  }
});

test("local directory tree returns child folders", async () => {
  const context = await createTestContext();
  const nested = path.join(context.libraryRoot, "Artist", "Album");
  try {
    await mkdir(nested, { recursive: true });
    const response = await context.app.inject({
      method: "GET",
      url: `/api/admin/filesystem/tree?path=${encodeURIComponent(context.libraryRoot)}`,
      headers: context.authorization,
    });
    assert.equal(response.statusCode, 200);
    assert.deepEqual(response.json().items, [
      { name: "Artist", path: path.join(context.libraryRoot, "Artist") },
    ]);
  } finally {
    await context.close();
  }
});

test("filesystem roots are listed when no parent is provided", async () => {
  const context = await createTestContext();
  try {
    const response = await context.app.inject({
      method: "GET",
      url: "/api/admin/filesystem/tree",
      headers: context.authorization,
    });
    assert.equal(response.statusCode, 200);
    assert.ok(response.json().items.length > 0);
    for (const item of response.json().items) {
      assert.equal(typeof item.name, "string");
      assert.equal(typeof item.path, "string");
    }
  } finally {
    await context.close();
  }
});

test("filesystem search finds folders deeply below the selected path", async () => {
  const context = await createTestContext();
  const deepFolder = path.join(
    context.libraryRoot,
    "Artist",
    "Album",
    "Disc 1",
    "Lossless",
    "Deep Music",
  );
  try {
    await mkdir(deepFolder, { recursive: true });
    const response = await context.app.inject({
      method: "GET",
      url:
        `/api/admin/filesystem/search?path=${encodeURIComponent(context.libraryRoot)}` +
        `&query=${encodeURIComponent("deep music")}`,
      headers: context.authorization,
    });

    assert.equal(response.statusCode, 200);
    assert.deepEqual(response.json(), {
      items: [{ name: "Deep Music", path: deepFolder }],
      truncated: false,
    });
  } finally {
    await context.close();
  }
});

test("filesystem search validates its query and caps large result sets", async () => {
  const context = await createTestContext();
  try {
    const invalid = await context.app.inject({
      method: "GET",
      url: "/api/admin/filesystem/search?query=",
      headers: context.authorization,
    });
    assert.equal(invalid.statusCode, 400);
    assert.equal(invalid.json().error.code, "invalid_search");

    const tooLong = await context.app.inject({
      method: "GET",
      url: `/api/admin/filesystem/search?query=${"x".repeat(201)}`,
      headers: context.authorization,
    });
    assert.equal(tooLong.statusCode, 400);
    assert.equal(tooLong.json().error.code, "invalid_search");

    await Promise.all(
      Array.from({ length: 105 }, (_, index) =>
        mkdir(path.join(context.libraryRoot, `Match ${index}`)),
      ),
    );
    const response = await context.app.inject({
      method: "GET",
      url:
        `/api/admin/filesystem/search?path=${encodeURIComponent(context.libraryRoot)}` +
        "&query=match",
      headers: context.authorization,
    });
    const body = response.json<{
      items: Array<{ name: string; path: string }>;
      truncated: boolean;
    }>();

    assert.equal(response.statusCode, 200);
    assert.equal(body.items.length, 100);
    assert.equal(body.truncated, true);
  } finally {
    await context.close();
  }
});

test("administrators can reorder sources", async () => {
  const context = await createTestContext();
  const secondRoot = path.join(context.root, "second");
  try {
    await mkdir(secondRoot);
    await context.app.inject({
      method: "POST",
      url: "/api/admin/sources",
      headers: context.authorization,
      payload: { kind: "path", path: secondRoot },
    });
    await context.app.inject({
      method: "POST",
      url: "/api/admin/sources",
      headers: context.authorization,
      payload: { kind: "url", url: "https://example.com/music" },
    });
    const list = await context.app.inject({
      method: "GET",
      url: "/api/admin/sources",
      headers: context.authorization,
    });
    const ids = list
      .json<{ items: Array<{ id: string }> }>()
      .items.map((source) => source.id);
    const reversed = [...ids].reverse();

    const reorder = await context.app.inject({
      method: "PUT",
      url: "/api/admin/sources/order",
      headers: context.authorization,
      payload: { ids: reversed },
    });
    assert.equal(reorder.statusCode, 200);
    assert.deepEqual(
      reorder
        .json<{ items: Array<{ id: string }> }>()
        .items.map((source) => source.id),
      reversed,
    );
  } finally {
    await context.close();
  }
});

test("a rescan reads all configured path sources", async () => {
  const context = await createTestContext();
  const secondRoot = path.join(context.root, "second");
  try {
    await mkdir(secondRoot);
    await writeFile(path.join(context.libraryRoot, "first.wav"), createWav());
    await writeFile(path.join(secondRoot, "second.wav"), createWav());
    const secondSource = await context.app.inject({
      method: "POST",
      url: "/api/admin/sources",
      headers: context.authorization,
      payload: { kind: "path", path: secondRoot },
    });
    const secondSourceScan = secondSource.json<{ task: { id: string } }>().task;
    await waitForScan(context, secondSourceScan.id);
    const scan = await startScan(context);
    assert.equal(scan.status, "completed");
    assert.equal(scan.createdCount, 1);
    assert.equal(scan.unchangedCount, 1);
  } finally {
    await context.close();
  }
});

test("source rescans isolate availability changes to the selected source", async () => {
  const context = await createTestContext();
  const secondRoot = path.join(context.root, "second");
  const firstTrack = path.join(context.libraryRoot, "first.wav");
  try {
    await mkdir(secondRoot);
    await writeFile(firstTrack, createWav());
    await writeFile(path.join(secondRoot, "second.wav"), createWav());
    const secondSource = await context.app.inject({
      method: "POST",
      url: "/api/admin/sources",
      headers: context.authorization,
      payload: { kind: "path", path: secondRoot },
    });
    const secondSourceScan = secondSource.json<{ task: { id: string } }>().task;
    await waitForScan(context, secondSourceScan.id);
    await startScan(context);
    await rm(firstTrack);

    const scoped = await context.app.inject({
      method: "POST",
      url: `/api/admin/sources/${secondSource.json().id}/scans`,
      headers: context.authorization,
    });
    assert.equal(scoped.statusCode, 202);
    assert.equal(scoped.json().source.id, secondSource.json().id);
    assert.equal(scoped.json().source.name, "second");
    const scopedScan = await waitForScan(context, scoped.json().id);
    assert.equal(scopedScan.status, "completed");
    assert.equal(scopedScan.unavailableCount, 0);

    const availableAfterSecond = await context.app.inject({
      method: "GET",
      url: "/api/tracks",
      headers: context.authorization,
    });
    assert.equal(availableAfterSecond.json().items.length, 2);

    const firstSource = await context.app.inject({
      method: "GET",
      url: "/api/admin/sources",
      headers: context.authorization,
    });
    const firstSourceId = firstSource
      .json<{
        items: Array<{ id: string; path: string }>;
      }>()
      .items.find((source) => source.path === context.libraryRoot)?.id;
    const firstScoped = await context.app.inject({
      method: "POST",
      url: `/api/admin/sources/${firstSourceId}/scans`,
      headers: context.authorization,
    });
    assert.equal(firstScoped.statusCode, 202);
    await waitForScan(context, firstScoped.json().id);
    const availableAfterFirst = await context.app.inject({
      method: "GET",
      url: "/api/tracks",
      headers: context.authorization,
    });
    assert.equal(availableAfterFirst.json().items.length, 1);
  } finally {
    await context.close();
  }
});

test("only local sources can be rescanned", async () => {
  const context = await createTestContext();
  try {
    const remote = await context.app.inject({
      method: "POST",
      url: "/api/admin/sources",
      headers: context.authorization,
      payload: { kind: "url", url: "https://example.com/music" },
    });
    const response = await context.app.inject({
      method: "POST",
      url: `/api/admin/sources/${remote.json().id}/scans`,
      headers: context.authorization,
    });
    assert.equal(response.statusCode, 400);
    assert.equal(response.json().error.code, "source_not_rescanable");
  } finally {
    await context.close();
  }
});

test("sources require an administrator", async () => {
  const context = await createTestContext();
  const member = await createMemberSession(context);
  try {
    for (const [method, url] of [
      ["GET", "/api/admin/sources"],
      ["POST", "/api/admin/sources"],
      ["POST", "/api/admin/sources/missing/scans"],
      ["GET", "/api/admin/filesystem/search?query=music"],
    ] as const) {
      const memberResponse = await context.app.inject({
        method,
        url,
        headers: member,
      });
      assert.equal(memberResponse.statusCode, 403);

      const anonymousResponse = await context.app.inject({ method, url });
      assert.equal(anonymousResponse.statusCode, 401);
    }
  } finally {
    await context.close();
  }
});
