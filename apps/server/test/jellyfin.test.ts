import assert from "node:assert/strict";
import { test } from "node:test";
import type { TaskResponse } from "@peridot/contracts";
import { createTestContext, waitForScan } from "./helpers.js";

const API_KEY = "jellyfin-secret-api-key";
const AUDIO_ID = "11111111-1111-1111-1111-111111111111";
const ALBUM_ID = "22222222-2222-2222-2222-222222222222";
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xd9]);
const AUDIO = Buffer.from("jellyfin-audio-bytes");
const LIBRARIES = [
  {
    ItemId: "music-library-id",
    Name: "Music",
    CollectionType: "music",
  },
];

function jellyfinResponse(input: string | URL | Request): Response {
  const request = input instanceof Request ? input : null;
  const url = new URL(input instanceof Request ? input.url : String(input));
  if (url.pathname === "/System/Info") {
    return Response.json({
      ServerName: "Living Room Jellyfin",
      ProductName: "Jellyfin Server",
      Id: "server-id",
      Version: "10.10.0",
    });
  }
  if (url.pathname === "/Library/VirtualFolders") {
    return Response.json([
      {
        ItemId: "audio-library-id",
        Name: "Audiobooks",
        CollectionType: "books",
      },
      {
        ItemId: "music-library-id",
        Name: "Music",
        CollectionType: "music",
      },
    ]);
  }
  if (url.pathname === "/Items") {
    return Response.json({
      Items: [
        {
          Id: AUDIO_ID,
          Name: "Night Drive",
          Etag: "track-v1",
          Container: "mp3",
          RunTimeTicks: 123_400_000,
          IndexNumber: 2,
          ParentIndexNumber: 1,
          DateCreated: "2025-01-02T03:04:05.000Z",
          Artists: ["Artist One", "Artist Two"],
          Album: "Night Album",
          AlbumId: ALBUM_ID,
          AlbumArtists: [{ Name: "Album Artist" }],
          AlbumPrimaryImageTag: "cover-v1",
          Genres: ["Electronic", "Synthwave"],
          MediaSources: [{ Container: "mp3", Size: AUDIO.length }],
        },
        {
          Id: "unsupported",
          Name: "Windows Media",
          Container: "wma",
          MediaSources: [{ Container: "wma", Size: 20 }],
        },
      ],
      TotalRecordCount: 2,
      StartIndex: 0,
    });
  }
  if (url.pathname === `/Items/${ALBUM_ID}/Images/Primary`) {
    return new Response(JPEG, {
      headers: {
        "content-type": "image/jpeg",
        "content-length": String(JPEG.length),
      },
    });
  }
  if (url.pathname === `/Audio/${AUDIO_ID}/stream`) {
    const range = request?.headers.get("range");
    if (range === "bytes=0-7") {
      return new Response(AUDIO.subarray(0, 8), {
        status: 206,
        headers: {
          "accept-ranges": "bytes",
          "content-type": "audio/mpeg",
          "content-length": "8",
          "content-range": `bytes 0-7/${AUDIO.length}`,
        },
      });
    }
    return new Response(AUDIO, {
      headers: {
        "accept-ranges": "bytes",
        "content-type": "audio/mpeg",
        "content-length": String(AUDIO.length),
      },
    });
  }
  return new Response("not found", { status: 404 });
}

test("Jellyfin library discovery creates one auto-detected source per selected library", async () => {
  const requestedUrls: string[] = [];
  const jellyfinFetch: typeof fetch = async (input, init) => {
    const request =
      input instanceof Request
        ? input
        : new Request(String(input), init as RequestInit);
    requestedUrls.push(request.url);
    return jellyfinResponse(request);
  };
  const context = await createTestContext({ jellyfinFetch });
  try {
    const discovery = await context.app.inject({
      method: "POST",
      url: "/api/admin/integrations/jellyfin/libraries",
      headers: context.authorization,
      payload: {
        url: "http://jellyfin.local:8096",
        apiKey: API_KEY,
      },
    });
    assert.equal(discovery.statusCode, 200, discovery.body);
    assert.equal(
      discovery.json<{ items: Array<{ name: string }> }>().items[0]?.name,
      "Audiobooks",
    );

    const create = await context.app.inject({
      method: "POST",
      url: "/api/admin/sources",
      headers: context.authorization,
      payload: {
        kind: "integration",
        integration: "jellyfin",
        libraryId: "audio-library-id",
        url: "http://jellyfin.local:8096",
        apiKey: API_KEY,
      },
    });
    assert.equal(create.statusCode, 201, create.body);
    const source = create.json<{
      id: string;
      externalLibraryCollectionType: string | null;
      externalLibraryId: string;
      task: TaskResponse;
    }>();
    assert.equal(source.externalLibraryCollectionType, "books");
    assert.equal(source.externalLibraryId, "audio-library-id");
    await waitForScan(context, source.task.id);

    assert.ok(
      requestedUrls.some(
        (url) =>
          new URL(url).pathname === "/Items" &&
          new URL(url).searchParams.get("parentId") === "audio-library-id",
      ),
    );
    const books = await context.app.inject({
      method: "GET",
      url: "/api/audiobooks",
      headers: context.authorization,
    });
    assert.equal(
      books.json<{ items: Array<{ title: string }> }>().items[0]?.title,
      "Night Album",
    );
  } finally {
    await context.close();
  }
});

test("Jellyfin auto-detects audiobooks, podcasts, and music within one library", async () => {
  const requestedUrls: string[] = [];
  const context = await createTestContext({
    jellyfinFetch: async (input) => {
      const url = new URL(input instanceof Request ? input.url : String(input));
      requestedUrls.push(url.toString());
      if (url.pathname.endsWith("/System/Info")) {
        return Response.json({ ServerName: "Mixed Jellyfin" });
      }
      if (url.pathname.endsWith("/Library/VirtualFolders")) {
        return Response.json(LIBRARIES);
      }
      if (url.pathname.endsWith("/Items")) {
        return Response.json({
          Items: [
            {
              Id: "audio-book",
              Type: "AudioBook",
              Name: "Chapter One",
              Container: "m4b",
              Album: "Mixed Book",
              AlbumId: "mixed-book-album",
              Artists: ["Book Author"],
              MediaSources: [{ Container: "m4b", Size: 10 }],
            },
            {
              Id: "podcast-episode",
              Type: "Audio",
              Name: "Episode One",
              Container: "mp3",
              Album: "Mixed Show",
              AlbumId: "mixed-show-album",
              Artists: ["Show Publisher"],
              Tags: ["Podcast"],
              MediaSources: [{ Container: "mp3", Size: 10 }],
            },
            {
              Id: "music-track",
              Type: "Audio",
              Name: "Song One",
              Container: "mp3",
              Album: "Mixed Music",
              AlbumId: "mixed-music-album",
              Artists: ["Music Artist"],
              MediaSources: [{ Container: "mp3", Size: 10 }],
            },
          ],
          TotalRecordCount: 3,
        });
      }
      return new Response("not found", { status: 404 });
    },
  });
  try {
    const created = await context.app.inject({
      method: "POST",
      url: "/api/admin/sources",
      headers: context.authorization,
      payload: {
        kind: "integration",
        integration: "jellyfin",
        libraryId: "music-library-id",
        url: "http://jellyfin.example.test",
        apiKey: API_KEY,
      },
    });
    assert.equal(created.statusCode, 201, created.body);
    const source = created.json<{ task: TaskResponse }>();
    await waitForScan(context, source.task.id);

    const tracks = await context.database.orm.Track.all();
    const byTitle = new Map(tracks.map((track) => [track.title, track]));
    assert.equal(byTitle.get("Chapter One")?.mediaType, "audiobook");
    assert.equal(byTitle.get("Chapter One")?.mediaTypeOrigin, "jellyfin");
    assert.equal(byTitle.get("Episode One")?.mediaType, "podcast");
    assert.equal(byTitle.get("Episode One")?.mediaTypeOrigin, "jellyfin");
    assert.equal(byTitle.get("Song One")?.mediaType, "music");
    assert.equal(byTitle.get("Song One")?.mediaTypeOrigin, "fallback");

    const itemsRequest = requestedUrls.find(
      (value) => new URL(value).pathname === "/Items",
    );
    assert.ok(itemsRequest);
    const itemsUrl = new URL(itemsRequest);
    assert.equal(
      itemsUrl.searchParams.get("includeItemTypes"),
      "Audio,AudioBook",
    );
    assert.match(itemsUrl.searchParams.get("fields") ?? "", /Tags/);
    assert.match(itemsUrl.searchParams.get("fields") ?? "", /ProviderIds/);
  } finally {
    await context.close();
  }
});

test("Jellyfin sources validate, import audio only, encrypt credentials, proxy playback, and remove cleanly", async () => {
  const authorizationHeaders: string[] = [];
  const requestedUrls: string[] = [];
  const jellyfinFetch: typeof fetch = async (input, init) => {
    const request =
      input instanceof Request
        ? input
        : new Request(String(input), init as RequestInit);
    requestedUrls.push(request.url);
    authorizationHeaders.push(request.headers.get("authorization") ?? "");
    return jellyfinResponse(request);
  };
  const context = await createTestContext({ jellyfinFetch });
  try {
    const create = await context.app.inject({
      method: "POST",
      url: "/api/admin/sources",
      headers: context.authorization,
      payload: {
        kind: "integration",
        integration: "jellyfin",
        libraryId: "music-library-id",
        url: "http://jellyfin.local:8096",
        apiKey: API_KEY,
      },
    });
    assert.equal(create.statusCode, 201, create.body);
    const source = create.json<{
      id: string;
      name: string;
      url: string;
      integration: string;
      fileCount: number;
      lastSyncedAt: string | null;
      credentialCiphertext?: unknown;
      task: TaskResponse;
    }>();
    assert.equal(source.name, "Music");
    assert.equal(source.url, "http://jellyfin.local:8096/");
    assert.equal(source.integration, "jellyfin");
    assert.equal(source.fileCount, 0);
    assert.equal(source.lastSyncedAt, null);
    assert.equal(source.task.kind, "library_scan");
    assert.equal(source.task.status, "queued");
    assert.equal("credentialCiphertext" in source, false);
    assert.equal(create.body.includes(API_KEY), false);

    const stored = await context.database.orm.Source.firstOrThrow({
      id: source.id,
    });
    assert.ok(stored.credentialCiphertext);
    assert.notEqual(stored.credentialCiphertext, API_KEY);
    assert.equal(stored.credentialCiphertext.includes(API_KEY), false);

    const scan = await waitForScan(context, source.task.id);
    assert.equal(scan.status, "completed");
    assert.equal(scan.createdCount, 1);
    assert.equal(scan.errorCount, 1);
    assert.equal(scan.unavailableCount, 0);

    const sources = await context.app.inject({
      method: "GET",
      url: "/api/admin/sources",
      headers: context.authorization,
    });
    const listedSource = sources
      .json<{
        items: Array<{
          id: string;
          fileCount: number;
          lastSyncedAt: string | null;
        }>;
      }>()
      .items.find((item) => item.id === source.id);
    assert.equal(listedSource?.fileCount, 1);
    assert.ok(listedSource?.lastSyncedAt);

    const tracks = await context.app.inject({
      method: "GET",
      url: "/api/tracks",
      headers: context.authorization,
    });
    assert.equal(tracks.statusCode, 200);
    const track = tracks.json<{
      items: Array<{
        id: string;
        title: string;
        artist: string;
        album: string;
        discNumber: number | null;
        trackNumber: number | null;
        durationMs: number | null;
        coverUrl: string | null;
        mimeType: string;
        genres: string[];
      }>;
    }>().items[0];
    assert.ok(track);
    assert.equal(track.title, "Night Drive");
    assert.equal(track.artist, "Artist One, Artist Two");
    assert.equal(track.album, "Night Album");
    assert.equal(track.discNumber, 1);
    assert.equal(track.trackNumber, 2);
    assert.equal(track.durationMs, 12_340);
    assert.equal(track.mimeType, "audio/mpeg");
    assert.deepEqual(track.genres, ["Electronic", "Synthwave"]);
    assert.ok(track.coverUrl);
    assert.ok(
      requestedUrls.some((url) => {
        const fields = new URL(url).searchParams.get("fields") ?? "";
        return fields.includes("MediaSources") && fields.includes("Genres");
      }),
      "Jellyfin requests genre fields",
    );

    const playbackToken = await context.app.inject({
      method: "POST",
      url: `/api/tracks/${track.id}/playback-token`,
      headers: context.authorization,
    });
    const token = playbackToken.json<{ token: string }>().token;
    const playback = await context.app.inject({
      method: "GET",
      url: `/api/tracks/${track.id}/audio?playbackToken=${token}`,
      headers: { range: "bytes=0-7" },
    });
    assert.equal(playback.statusCode, 206);
    assert.equal(
      playback.headers["content-range"],
      `bytes 0-7/${AUDIO.length}`,
    );
    assert.equal(playback.headers["content-type"], "audio/mpeg");
    assert.deepEqual(playback.rawPayload, AUDIO.subarray(0, 8));
    const head = await context.app.inject({
      method: "HEAD",
      url: `/api/tracks/${track.id}/audio?playbackToken=${token}`,
      headers: { range: "bytes=0-7" },
    });
    assert.equal(head.statusCode, 206);
    assert.equal(head.rawPayload.length, 0);
    assert.ok(
      authorizationHeaders.every((header) =>
        header.includes(`Token="${API_KEY}"`),
      ),
    );
    assert.ok(
      requestedUrls.some((url) => {
        const parsed = new URL(url);
        return (
          parsed.pathname === `/Audio/${AUDIO_ID}/stream` &&
          parsed.searchParams.get("static") === "true" &&
          parsed.searchParams.get("container") === "mp3"
        );
      }),
    );
    assert.ok(requestedUrls.every((url) => !url.includes(API_KEY)));
    assert.equal(playback.body.includes(API_KEY), false);

    const removed = await context.app.inject({
      method: "DELETE",
      url: `/api/admin/sources/${source.id}`,
      headers: context.authorization,
    });
    assert.equal(removed.statusCode, 204);
    assert.equal(
      await context.database.orm.Track.where({ id: track.id }).first(),
      null,
    );
  } finally {
    await context.close();
  }
});

test("Jellyfin source validation rejects invalid keys without persisting a source", async () => {
  const context = await createTestContext({
    jellyfinFetch: async () => new Response("unauthorized", { status: 401 }),
  });
  try {
    const response = await context.app.inject({
      method: "POST",
      url: "/api/admin/sources",
      headers: context.authorization,
      payload: {
        kind: "integration",
        integration: "jellyfin",
        libraryId: "music-library-id",
        url: "https://media.example.test/jellyfin",
        apiKey: "bad-key",
      },
    });
    assert.equal(response.statusCode, 400);
    assert.equal(response.json().error.code, "invalid_source");
    assert.equal(
      response.json().error.messageDescriptor.key,
      "api.message.jellyfinInvalidCredentials",
    );
    assert.equal(
      (
        await context.database.orm.Source.where({
          integration: "jellyfin",
        }).all()
      ).length,
      0,
    );
  } finally {
    await context.close();
  }
});

test("multiple Jellyfin instances are supported while normalized duplicate URLs are rejected", async () => {
  const requested: string[] = [];
  const context = await createTestContext({
    jellyfinFetch: async (input) => {
      const url = new URL(input instanceof Request ? input.url : String(input));
      requested.push(url.toString());
      if (url.pathname.endsWith("/System/Info")) {
        return Response.json({ ServerName: url.host + url.pathname });
      }
      if (url.pathname.endsWith("/Items")) {
        return Response.json({ Items: [], TotalRecordCount: 0 });
      }
      if (url.pathname.endsWith("/Library/VirtualFolders")) {
        return Response.json(LIBRARIES);
      }
      return new Response("not found", { status: 404 });
    },
  });
  try {
    const first = await context.app.inject({
      method: "POST",
      url: "/api/admin/sources",
      headers: context.authorization,
      payload: {
        kind: "integration",
        integration: "jellyfin",
        libraryId: "music-library-id",
        url: "https://media.example.test/jellyfin",
        apiKey: "first-key",
      },
    });
    assert.equal(first.statusCode, 201, first.body);
    const firstTask = first.json<{ task: TaskResponse }>().task;
    await waitForScan(context, firstTask.id);

    const duplicate = await context.app.inject({
      method: "POST",
      url: "/api/admin/sources",
      headers: context.authorization,
      payload: {
        kind: "integration",
        integration: "jellyfin",
        libraryId: "music-library-id",
        url: "https://media.example.test/jellyfin/",
        apiKey: "different-key",
      },
    });
    assert.equal(duplicate.statusCode, 400);
    assert.equal(
      duplicate.json().error.messageDescriptor.key,
      "api.message.sourceIntegrationDuplicate",
    );

    const second = await context.app.inject({
      method: "POST",
      url: "/api/admin/sources",
      headers: context.authorization,
      payload: {
        kind: "integration",
        integration: "jellyfin",
        libraryId: "music-library-id",
        url: "https://media.example.test/other",
        apiKey: "second-key",
      },
    });
    assert.equal(second.statusCode, 201, second.body);
    const secondTask = second.json<{ task: TaskResponse }>().task;
    await waitForScan(context, secondTask.id);

    assert.ok(
      requested.some((url) =>
        url.startsWith("https://media.example.test/jellyfin/System/Info"),
      ),
    );
    assert.ok(
      requested.some((url) =>
        url.startsWith("https://media.example.test/other/System/Info"),
      ),
    );
    assert.equal(
      (
        await context.database.orm.Source.where({
          kind: "integration",
          integration: "jellyfin",
        }).all()
      ).length,
      2,
    );
  } finally {
    await context.close();
  }
});

test("Jellyfin rescans use item versions and mark remotely deleted audio unavailable", async () => {
  let revision = 1;
  let includeSecond = true;
  const item = (id: string, title: string, etag: string) => ({
    Id: id,
    Name: title,
    Etag: etag,
    Container: "mp3",
    RunTimeTicks: 10_000_000,
    MediaSources: [{ Container: "mp3", Size: 10 }],
  });
  const context = await createTestContext({
    jellyfinFetch: async (input) => {
      const url = new URL(input instanceof Request ? input.url : String(input));
      if (url.pathname.endsWith("/System/Info")) {
        return Response.json({ ServerName: "Versioned Jellyfin" });
      }
      if (url.pathname.endsWith("/Items")) {
        const items = [
          item(
            "33333333-3333-3333-3333-333333333333",
            revision === 1 ? "First Version" : "Second Version",
            `v${revision}`,
          ),
          ...(includeSecond
            ? [item("44444444-4444-4444-4444-444444444444", "Going Away", "v1")]
            : []),
        ];
        return Response.json({
          Items: items,
          TotalRecordCount: items.length,
        });
      }
      if (url.pathname.endsWith("/Library/VirtualFolders")) {
        return Response.json(LIBRARIES);
      }
      return new Response("not found", { status: 404 });
    },
  });
  try {
    const created = await context.app.inject({
      method: "POST",
      url: "/api/admin/sources",
      headers: context.authorization,
      payload: {
        kind: "integration",
        integration: "jellyfin",
        libraryId: "music-library-id",
        url: "http://jellyfin.example.test",
        apiKey: API_KEY,
      },
    });
    assert.equal(created.statusCode, 201, created.body);
    const source = created.json<{ id: string; task: TaskResponse }>();
    const firstScan = await waitForScan(context, source.task.id);
    assert.equal(firstScan.createdCount, 2);

    const unchangedScanResponse = await context.app.inject({
      method: "POST",
      url: `/api/admin/sources/${source.id}/scans`,
      headers: context.authorization,
    });
    assert.equal(unchangedScanResponse.statusCode, 202);
    const unchangedScan = await waitForScan(
      context,
      unchangedScanResponse.json<{ id: string }>().id,
    );
    assert.equal(unchangedScan.unchangedCount, 2);
    assert.equal(unchangedScan.updatedCount, 0);

    revision = 2;
    includeSecond = false;
    const changedScanResponse = await context.app.inject({
      method: "POST",
      url: `/api/admin/sources/${source.id}/scans`,
      headers: context.authorization,
    });
    assert.equal(changedScanResponse.statusCode, 202);
    const changedScan = await waitForScan(
      context,
      changedScanResponse.json<{ id: string }>().id,
    );
    assert.equal(changedScan.updatedCount, 1);
    assert.equal(changedScan.unavailableCount, 1);

    const changed = await context.database.orm.Track.firstOrThrow({
      externalId: "33333333-3333-3333-3333-333333333333",
    });
    assert.equal(changed.title, "Second Version");
    assert.equal(changed.available, 1);
    const removed = await context.database.orm.Track.firstOrThrow({
      externalId: "44444444-4444-4444-4444-444444444444",
    });
    assert.equal(removed.available, 0);
  } finally {
    await context.close();
  }
});

test("a failed Jellyfin scan writes an error to the administrator log", async () => {
  const context = await createTestContext({
    jellyfinFetch: async (input) => {
      const url = new URL(input instanceof Request ? input.url : String(input));
      if (url.pathname.endsWith("/System/Info")) {
        return Response.json({ ServerName: "Logging Jellyfin" });
      }
      if (url.pathname.endsWith("/Items")) {
        return new Response("library unavailable", { status: 503 });
      }
      if (url.pathname.endsWith("/Library/VirtualFolders")) {
        return Response.json(LIBRARIES);
      }
      return new Response("not found", { status: 404 });
    },
  });
  try {
    const created = await context.app.inject({
      method: "POST",
      url: "/api/admin/sources",
      headers: context.authorization,
      payload: {
        kind: "integration",
        integration: "jellyfin",
        libraryId: "music-library-id",
        url: "http://jellyfin-logging.example.test",
        apiKey: API_KEY,
      },
    });
    assert.equal(created.statusCode, 201, created.body);
    const task = created.json<{ task: TaskResponse }>().task;
    const failed = await waitForScan(context, task.id);
    assert.equal(failed.status, "failed");

    const logs = await context.app.inject({
      method: "GET",
      url: "/api/admin/logs",
      headers: context.authorization,
    });
    assert.equal(logs.statusCode, 200);
    const entries = logs.json<{
      items: Array<{ level: string; message: string }>;
    }>().items;
    assert.ok(
      entries.some(
        (entry) =>
          entry.level === "error" &&
          entry.message.includes(
            "Task failed: Music scan. Jellyfin could not list its audio library.",
          ),
      ),
    );
  } finally {
    await context.close();
  }
});

test("Jellyfin artwork fetches use bounded concurrency", async () => {
  let activeCovers = 0;
  let maximumActiveCovers = 0;
  const items = Array.from({ length: 12 }, (_, index) => ({
    Id: `track-${index}`,
    Name: `Track ${index}`,
    Etag: `track-${index}-v1`,
    Container: "mp3",
    Album: `Album ${index}`,
    AlbumId: `album-${index}`,
    AlbumPrimaryImageTag: `cover-${index}`,
    Artists: [`Artist ${index}`],
    MediaSources: [{ Container: "mp3", Size: 10 }],
  }));
  const context = await createTestContext({
    jellyfinFetch: async (input) => {
      const url = new URL(input instanceof Request ? input.url : String(input));
      if (url.pathname === "/System/Info") {
        return Response.json({ ServerName: "Concurrent Jellyfin" });
      }
      if (url.pathname === "/Library/VirtualFolders") {
        return Response.json(LIBRARIES);
      }
      if (url.pathname === "/Items") {
        return Response.json({
          Items: items,
          TotalRecordCount: items.length,
        });
      }
      if (/^\/Items\/album-\d+\/Images\/Primary$/u.test(url.pathname)) {
        activeCovers += 1;
        maximumActiveCovers = Math.max(maximumActiveCovers, activeCovers);
        await new Promise((resolve) => setTimeout(resolve, 20));
        activeCovers -= 1;
        return new Response(JPEG, {
          headers: {
            "content-type": "image/jpeg",
            "content-length": String(JPEG.length),
          },
        });
      }
      return new Response("not found", { status: 404 });
    },
  });
  try {
    const created = await context.app.inject({
      method: "POST",
      url: "/api/admin/sources",
      headers: context.authorization,
      payload: {
        kind: "integration",
        integration: "jellyfin",
        libraryId: "music-library-id",
        url: "http://concurrent-jellyfin.example.test",
        apiKey: API_KEY,
      },
    });
    assert.equal(created.statusCode, 201, created.body);
    const task = created.json<{ task: TaskResponse }>().task;
    const completed = await waitForScan(context, task.id);
    assert.equal(completed.status, "completed");
    assert.equal(completed.createdCount, items.length);
    assert.ok(
      maximumActiveCovers > 1,
      "Jellyfin artwork requests should overlap",
    );
    assert.ok(
      maximumActiveCovers <= 6,
      "Jellyfin artwork concurrency should remain bounded",
    );
  } finally {
    await context.close();
  }
});

test("Jellyfin task progress advances before a page finishes", async () => {
  let releaseCovers!: () => void;
  let coversReleased = false;
  const coversReady = new Promise<void>((resolve) => {
    releaseCovers = () => {
      if (coversReleased) return;
      coversReleased = true;
      resolve();
    };
  });
  const items = Array.from({ length: 4 }, (_, index) => ({
    Id: `progress-track-${index}`,
    Name: `Progress track ${index}`,
    Etag: `progress-track-${index}-v1`,
    Container: "mp3",
    Album: `Progress album ${index}`,
    AlbumId: `progress-album-${index}`,
    AlbumPrimaryImageTag: `progress-cover-${index}`,
    Artists: [`Progress artist ${index}`],
    MediaSources: [{ Container: "mp3", Size: 10 }],
  }));
  const context = await createTestContext({
    jellyfinFetch: async (input) => {
      const url = new URL(input instanceof Request ? input.url : String(input));
      if (url.pathname === "/System/Info") {
        return Response.json({ ServerName: "Progress Jellyfin" });
      }
      if (url.pathname === "/Library/VirtualFolders") {
        return Response.json(LIBRARIES);
      }
      if (url.pathname === "/Items") {
        return Response.json({
          Items: items,
          TotalRecordCount: items.length,
        });
      }
      if (url.pathname === "/Items/progress-album-0/Images/Primary") {
        return new Response(JPEG, {
          headers: {
            "content-type": "image/jpeg",
            "content-length": String(JPEG.length),
          },
        });
      }
      if (
        /^\/Items\/progress-album-\d+\/Images\/Primary$/u.test(url.pathname)
      ) {
        await coversReady;
        return new Response(JPEG, {
          headers: {
            "content-type": "image/jpeg",
            "content-length": String(JPEG.length),
          },
        });
      }
      return new Response("not found", { status: 404 });
    },
  });
  try {
    const created = await context.app.inject({
      method: "POST",
      url: "/api/admin/sources",
      headers: context.authorization,
      payload: {
        kind: "integration",
        integration: "jellyfin",
        libraryId: "music-library-id",
        url: "http://progress-jellyfin.example.test",
        apiKey: API_KEY,
      },
    });
    assert.equal(created.statusCode, 201, created.body);
    const task = created.json<{ task: TaskResponse }>().task;

    let partiallyProcessed: TaskResponse | null = null;
    for (let attempt = 0; attempt < 1_500; attempt += 1) {
      const response = await context.app.inject({
        method: "GET",
        url: `/api/tasks/${task.id}`,
        headers: context.authorization,
      });
      const current = response.json<TaskResponse>();
      if (
        current.status === "running" &&
        current.progress.completed !== null &&
        current.progress.completed > 0 &&
        current.progress.completed < items.length
      ) {
        partiallyProcessed = current;
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    assert.ok(partiallyProcessed);
    assert.equal(partiallyProcessed.progress.total, items.length);

    releaseCovers();
    const completed = await waitForScan(context, task.id);
    assert.equal(completed.status, "completed");
    assert.equal(completed.createdCount, items.length);
  } finally {
    releaseCovers();
    await context.close();
  }
});
