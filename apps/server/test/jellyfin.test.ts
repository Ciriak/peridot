import assert from "node:assert/strict";
import { test } from "node:test";
import type { TaskResponse } from "@peridot/contracts";
import sharp from "sharp";
import { createTestContext, waitForScan, waitForTask } from "./helpers.js";

const API_KEY = "jellyfin-secret-api-key";
const AUDIO_ID = "11111111-1111-1111-1111-111111111111";
const ALBUM_ID = "22222222-2222-2222-2222-222222222222";
const JPEG = await sharp({
  create: {
    background: "#00a63e",
    channels: 3,
    height: 32,
    width: 32,
  },
})
  .jpeg({ quality: 75 })
  .toBuffer();
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
      url: "/api/admin/source-integrations/jellyfin/discover",
      headers: context.authorization,
      payload: {
        configuration: {
          url: "http://jellyfin.local:8096",
        },
        credentials: {
          apiKey: API_KEY,
        },
      },
    });
    assert.equal(discovery.statusCode, 200, discovery.body);
    assert.equal(
      discovery.json<{ items: Array<{ label: string }> }>().items[0]?.label,
      "Audiobooks",
    );

    const create = await context.app.inject({
      method: "POST",
      url: "/api/admin/sources",
      headers: context.authorization,
      payload: {
        kind: "jellyfin",
        url: "http://jellyfin.local:8096",
        apiKey: API_KEY,
        libraryId: "audio-library-id",
        collectionType: "books",
      },
    });
    assert.equal(create.statusCode, 201, create.body);
    const source = create.json<{
      id: string;
      configuration: Record<string, string> | null;
      task: TaskResponse;
    }>();
    assert.equal(source.configuration?.libraryCollectionType, "books");
    assert.equal(source.configuration?.libraryId, "audio-library-id");
    await waitForScan(context, source.task.id);

    assert.ok(
      requestedUrls.some(
        (url) =>
          new URL(url).pathname === "/Items" &&
          new URL(url).searchParams.get("parentId") === "audio-library-id",
      ),
    );
    const coverRequest = requestedUrls
      .map((url) => new URL(url))
      .find((url) => url.pathname === `/Items/${ALBUM_ID}/Images/Primary`);
    assert.ok(coverRequest);
    assert.equal(coverRequest.searchParams.get("maxWidth"), "400");
    assert.equal(coverRequest.searchParams.get("maxHeight"), "400");
    assert.equal(coverRequest.searchParams.get("quality"), "75");
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
        kind: "jellyfin",
        url: "http://jellyfin.example.test",
        apiKey: API_KEY,
        libraryId: "music-library-id",
        collectionType: "music",
      },
    });
    assert.equal(created.statusCode, 201, created.body);
    const source = created.json<{ task: TaskResponse }>();
    await waitForScan(context, source.task.id);

    const tracks = await context.database.orm.Track.all();
    const byTitle = new Map(tracks.map((track) => [track.title, track]));
    assert.equal(byTitle.get("Chapter One")?.mediaType, "audiobook");
    assert.equal(byTitle.get("Chapter One")?.mediaTypeOrigin, "source");
    assert.equal(byTitle.get("Episode One")?.mediaType, "podcast");
    assert.equal(byTitle.get("Episode One")?.mediaTypeOrigin, "source");
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

test("Jellyfin publishes 100-item catalog batches before the scan completes", async () => {
  let releaseSecondPage!: () => void;
  let secondPageStarted = false;
  const secondPageReady = new Promise<void>((resolve) => {
    releaseSecondPage = resolve;
  });
  const items = Array.from({ length: 150 }, (_, index) => ({
    Id: `batched-track-${index}`,
    Name: `Batched track ${index}`,
    Etag: `batched-track-${index}-v1`,
    Container: "mp3",
    RunTimeTicks: 10_000_000,
    Artists: [`Batched artist ${index}`],
    Album: `Batched album ${index}`,
    AlbumId: `batched-album-${index}`,
    MediaSources: [{ Container: "mp3", Size: 10 }],
  }));
  const requestedLimits: number[] = [];
  const requestedStarts: number[] = [];
  const context = await createTestContext({
    jellyfinFetch: async (input) => {
      const url = new URL(input instanceof Request ? input.url : String(input));
      if (url.pathname === "/System/Info") {
        return Response.json({ ServerName: "Batched Jellyfin" });
      }
      if (url.pathname === "/Library/VirtualFolders") {
        return Response.json(LIBRARIES);
      }
      if (url.pathname === "/Items") {
        const startIndex = Number(url.searchParams.get("startIndex"));
        const limit = Number(url.searchParams.get("limit"));
        requestedLimits.push(limit);
        requestedStarts.push(startIndex);
        if (startIndex === 100) {
          secondPageStarted = true;
          await secondPageReady;
        }
        return Response.json({
          Items: items.slice(startIndex, startIndex + limit),
          TotalRecordCount: items.length,
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
        kind: "jellyfin",
        url: "http://batched-jellyfin.example.test",
        apiKey: API_KEY,
        libraryId: "music-library-id",
        collectionType: "music",
      },
    });
    assert.equal(created.statusCode, 201, created.body);
    const scanTask = created.json<{ task: TaskResponse }>().task;
    const waitStarted = Date.now();
    while (!secondPageStarted && Date.now() - waitStarted < 10_000) {
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    if (!secondPageStarted) {
      const taskResponse = await context.app.inject({
        method: "GET",
        url: `/api/tasks/${scanTask.id}`,
        headers: context.authorization,
      });
      const [{ count: trackCount }, { count: catalogCount }] =
        await Promise.all([
          context.database.orm.Track.aggregate((aggregate) => ({
            count: aggregate.count(),
          })),
          context.database.orm.CatalogTrack.aggregate((aggregate) => ({
            count: aggregate.count(),
          })),
        ]);
      assert.fail(
        `Jellyfin did not request its second page: ${JSON.stringify({
          task: taskResponse.json(),
          trackCount,
          catalogCount,
          requestedStarts,
          secondPageStarted,
        })}`,
      );
    }

    const partial = await context.app.inject({
      method: "GET",
      url: "/api/tracks?limit=100",
      headers: context.authorization,
    });
    assert.equal(partial.statusCode, 200, partial.body);
    const partialTracks = partial.json<{
      items: Array<{ title: string; artist: string; album: string | null }>;
      totalCount: number;
    }>();
    assert.equal(partialTracks.totalCount, 100);
    assert.equal(partialTracks.items.length, 100);
    assert.ok(
      partialTracks.items.every(
        (track) =>
          track.title.startsWith("Batched track ") &&
          track.artist.startsWith("Batched artist ") &&
          track.album?.startsWith("Batched album "),
      ),
    );
    const running = await context.app.inject({
      method: "GET",
      url: `/api/tasks/${scanTask.id}`,
      headers: context.authorization,
    });
    assert.equal(running.json<TaskResponse>().status, "running");

    releaseSecondPage();
    const result = await waitForScan(context, scanTask.id);
    assert.equal(result.status, "completed", JSON.stringify(result));
    assert.equal(result.createdCount, items.length);
    assert.equal(result.catalogStatus, "completed");
    assert.ok(requestedLimits.length >= 2);
    assert.ok(requestedLimits.every((limit) => limit === 100));
    assert.deepEqual(requestedStarts, [0, 100]);
    assert.equal(
      (
        await context.database.orm.Track.where({
          catalogProjectionPending: 1,
        }).all()
      ).length,
      0,
    );
  } finally {
    releaseSecondPage();
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
        kind: "jellyfin",
        url: "http://jellyfin.local:8096",
        apiKey: API_KEY,
        libraryId: "music-library-id",
        collectionType: "music",
      },
    });
    assert.equal(create.statusCode, 201, create.body);
    const source = create.json<{
      id: string;
      name: string;
      configuration: Record<string, string> | null;
      fileCount: number;
      lastSyncedAt: string | null;
      credentialCiphertext?: unknown;
      task: TaskResponse;
    }>();
    assert.equal(source.name, "Music");
    assert.equal(source.configuration?.url, "http://jellyfin.local:8096/");
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
        kind: "jellyfin",
        url: "https://media.example.test/jellyfin",
        apiKey: "bad-key",
        libraryId: "music-library-id",
        collectionType: "music",
      },
    });
    assert.equal(response.statusCode, 400);
    assert.equal(response.json().error.code, "invalid_source");
    assert.equal(
      response.json().error.messageDescriptor.key,
      "settings.sources.jellyfin.error.invalidCredentials",
    );
    assert.equal(
      (
        await context.database.orm.Source.where({
          kind: "jellyfin",
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
        kind: "jellyfin",
        url: "https://media.example.test/jellyfin",
        apiKey: "first-key",
        libraryId: "music-library-id",
        collectionType: "music",
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
        kind: "jellyfin",
        url: "https://media.example.test/jellyfin/",
        apiKey: "different-key",
        libraryId: "music-library-id",
        collectionType: "music",
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
        kind: "jellyfin",
        url: "https://media.example.test/other",
        apiKey: "second-key",
        libraryId: "music-library-id",
        collectionType: "music",
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
          kind: "jellyfin",
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
        kind: "jellyfin",
        url: "http://jellyfin.example.test",
        apiKey: API_KEY,
        libraryId: "music-library-id",
        collectionType: "music",
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
    const tracksBeforeReconciliation = await context.database.orm.Track.where({
      sourceId: source.id,
    }).all();
    assert.equal(
      changedScan.unavailableCount,
      1,
      JSON.stringify({
        scan: changedScan,
        tracks: tracksBeforeReconciliation.map((track) => ({
          externalId: track.externalId,
          available: track.available,
          lastSeenScanId: track.lastSeenScanId,
        })),
        changedScanId: changedScanResponse.json<{ id: string }>().id,
      }),
    );

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
        kind: "jellyfin",
        url: "http://jellyfin-logging.example.test",
        apiKey: API_KEY,
        libraryId: "music-library-id",
        collectionType: "music",
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
        kind: "jellyfin",
        url: "http://concurrent-jellyfin.example.test",
        apiKey: API_KEY,
        libraryId: "music-library-id",
        collectionType: "music",
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

test("failed Jellyfin artwork remains pending and retries after a rescan", async () => {
  let failCover = true;
  let coverRequests = 0;
  const context = await createTestContext({
    jellyfinFetch: async (input) => {
      const url = new URL(input instanceof Request ? input.url : String(input));
      if (url.pathname === "/System/Info") {
        return Response.json({ ServerName: "Retry Jellyfin" });
      }
      if (url.pathname === "/Library/VirtualFolders") {
        return Response.json(LIBRARIES);
      }
      if (url.pathname === "/Items") {
        return Response.json({
          Items: [
            {
              Id: "retry-track",
              Name: "Retry Track",
              Etag: "retry-track-v1",
              Container: "mp3",
              Album: "Retry Album",
              AlbumId: "retry-album",
              AlbumPrimaryImageTag: "retry-cover",
              Artists: ["Retry Artist"],
              MediaSources: [{ Container: "mp3", Size: 10 }],
            },
          ],
          TotalRecordCount: 1,
        });
      }
      if (url.pathname === "/Items/retry-album/Images/Primary") {
        coverRequests += 1;
        if (failCover) {
          return new Response("unavailable", { status: 503 });
        }
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
        kind: "jellyfin",
        url: "http://retry-jellyfin.example.test",
        apiKey: API_KEY,
        libraryId: "music-library-id",
        collectionType: "music",
      },
    });
    assert.equal(created.statusCode, 201, created.body);
    const source = created.json<{ id: string; task: TaskResponse }>();
    const first = await waitForScan(context, source.task.id);
    assert.equal(first.artworkStatus, "completed");
    assert.equal(first.artworkErrorCount, 1);
    assert.equal(coverRequests, 1);
    const pending = await context.database.orm.ArtworkJob.firstOrThrow({
      sourceId: source.id,
    });
    assert.equal(pending.attemptCount, 1);
    assert.ok(pending.lastAttemptAt);

    failCover = false;
    const rescan = await context.app.inject({
      method: "POST",
      url: `/api/admin/sources/${source.id}/scans`,
      headers: context.authorization,
    });
    assert.equal(rescan.statusCode, 202, rescan.body);
    const second = await waitForScan(context, rescan.json<{ id: string }>().id);
    assert.equal(second.artworkStatus, "completed");
    assert.equal(second.artworkErrorCount, 0);
    assert.equal(second.artworkRetrievedCount, 1);
    assert.equal(coverRequests, 2);
    assert.equal(
      await context.database.orm.ArtworkJob.first({ sourceId: source.id }),
      null,
    );
    const track = await context.database.orm.Track.firstOrThrow({
      sourceId: source.id,
    });
    assert.ok(track.coverId);
  } finally {
    await context.close();
  }
});

test("Jellyfin tracks become available before deferred artwork finishes", async () => {
  let releaseFirstCover!: () => void;
  let releaseRemainingCovers!: () => void;
  let firstCoverReleased = false;
  let remainingCoversReleased = false;
  const firstCoverReady = new Promise<void>((resolve) => {
    releaseFirstCover = () => {
      if (firstCoverReleased) return;
      firstCoverReleased = true;
      resolve();
    };
  });
  const remainingCoversReady = new Promise<void>((resolve) => {
    releaseRemainingCovers = () => {
      if (remainingCoversReleased) return;
      remainingCoversReleased = true;
      resolve();
    };
  });
  const items = Array.from({ length: 4 }, (_, index) => ({
    Id: `deferred-track-${index}`,
    Name: `Deferred track ${index}`,
    Etag: `deferred-track-${index}-v1`,
    Container: "mp3",
    Album: `Deferred album ${index}`,
    AlbumId: `deferred-album-${index}`,
    AlbumPrimaryImageTag: `deferred-cover-${index}`,
    Artists: [`Deferred artist ${index}`],
    MediaSources: [{ Container: "mp3", Size: 10 }],
  }));
  const context = await createTestContext({
    jellyfinFetch: async (input) => {
      const url = new URL(input instanceof Request ? input.url : String(input));
      if (url.pathname === "/System/Info") {
        return Response.json({ ServerName: "Deferred Jellyfin" });
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
      if (url.pathname === "/Items/deferred-album-0/Images/Primary") {
        await firstCoverReady;
        return new Response(JPEG, {
          headers: {
            "content-type": "image/jpeg",
            "content-length": String(JPEG.length),
          },
        });
      }
      if (
        /^\/Items\/deferred-album-\d+\/Images\/Primary$/u.test(url.pathname)
      ) {
        await remainingCoversReady;
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
        kind: "jellyfin",
        url: "http://deferred-jellyfin.example.test",
        apiKey: API_KEY,
        libraryId: "music-library-id",
        collectionType: "music",
      },
    });
    assert.equal(created.statusCode, 201, created.body);
    const scanTask = created.json<{ task: TaskResponse }>().task;
    const scan = await waitForTask(context, scanTask.id);
    assert.equal(scan.status, "completed");

    const tracksBeforeArtwork = await context.app.inject({
      method: "GET",
      url: "/api/tracks",
      headers: context.authorization,
    });
    const deferredTracks = tracksBeforeArtwork.json<{
      items: Array<{ id: string; title: string; coverUrl: string | null }>;
    }>().items;
    assert.equal(deferredTracks.length, items.length);
    assert.ok(deferredTracks.every((track) => track.coverUrl === null));

    const playbackToken = await context.app.inject({
      method: "POST",
      url: `/api/tracks/${deferredTracks[0]!.id}/playback-token`,
      headers: context.authorization,
    });
    assert.equal(playbackToken.statusCode, 200, playbackToken.body);

    const metadataTask = await context.database.orm.Task.where({
      parentTaskId: scan.id,
      kind: "metadata_fetch",
    }).firstOrThrow();
    await waitForTask(context, metadataTask.id);
    let artworkTask: TaskResponse | null = null;
    for (let attempt = 0; attempt < 500; attempt += 1) {
      const response = await context.app.inject({
        method: "GET",
        url: `/api/tasks?status=active&limit=50`,
        headers: context.authorization,
      });
      artworkTask =
        response
          .json<{ items: TaskResponse[] }>()
          .items.find(
            (task) =>
              task.kind === "artwork_fetch" && task.parentTaskId === scan.id,
          ) ?? null;
      if (artworkTask) break;
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    assert.ok(artworkTask);

    releaseFirstCover();

    let partiallyProcessed: TaskResponse | null = null;
    for (let attempt = 0; attempt < 1_500; attempt += 1) {
      const response = await context.app.inject({
        method: "GET",
        url: `/api/tasks/${artworkTask.id}`,
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

    releaseRemainingCovers();
    const completedArtwork = await waitForTask(context, artworkTask.id);
    assert.equal(completedArtwork.status, "completed");
    const withCovers = await context.database.orm.Track.all();
    assert.ok(withCovers.every((track) => track.coverId));
  } finally {
    releaseFirstCover();
    releaseRemainingCovers();
    await context.close();
  }
});
