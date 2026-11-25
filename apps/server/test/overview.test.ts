import assert from "node:assert/strict";
import { rm } from "node:fs/promises";
import test from "node:test";
import type { OverviewResponse } from "@peridot/contracts";
import {
  createMediaFixture,
  createMemberSession,
  createTestContext,
} from "./helpers.js";

const JELLYFIN_API_KEY = "overview-jellyfin-api-key";

function jellyfinResponse(online: boolean) {
  return async (input: string | URL | Request): Promise<Response> => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    if (!online) return new Response("unavailable", { status: 503 });
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
          ItemId: "music-library-id",
          Name: "Music",
          CollectionType: "music",
        },
      ]);
    }
    if (url.pathname === "/Items") {
      return Response.json({
        Items: [],
        TotalRecordCount: 0,
        StartIndex: 0,
      });
    }
    return new Response("not found", { status: 404 });
  };
}

test("overview reports safe source details to members and counts files", async () => {
  const context = await createTestContext();
  try {
    await createMediaFixture(context, {
      media: {
        title: "Overview Track",
        artist: "Overview Artist",
      },
    });
    const member = await createMemberSession(context);

    const unauthorized = await context.app.inject({
      method: "GET",
      url: "/api/overview",
    });
    assert.equal(unauthorized.statusCode, 401);

    const response = await context.app.inject({
      method: "GET",
      url: "/api/overview",
      headers: member,
    });
    assert.equal(response.statusCode, 200, response.body);
    const overview = response.json<OverviewResponse>();
    assert.equal(overview.librarySources.length, 1);
    assert.equal(overview.librarySources[0]?.address, "Local folder");
    assert.equal(overview.librarySources[0]?.fileCount, 1);
    assert.equal(overview.librarySources[0]?.status, "online");
    assert.deepEqual(overview.counts, {
      albums: 0,
      playlists: 1,
      podcasts: 0,
      audiobooks: 0,
    });
    assert.equal(response.body.includes(context.libraryRoot), false);
  } finally {
    await context.close();
  }
});

test("overview marks missing folder sources offline", async () => {
  const context = await createTestContext();
  try {
    await rm(context.libraryRoot, { recursive: true, force: true });
    const member = await createMemberSession(context);
    const response = await context.app.inject({
      method: "GET",
      url: "/api/overview",
      headers: member,
    });
    assert.equal(response.statusCode, 200, response.body);
    assert.equal(
      response.json<OverviewResponse>().librarySources[0]?.status,
      "offline",
    );
  } finally {
    await context.close();
  }
});

test("overview includes metadata provider status without card details", async () => {
  const context = await createTestContext();
  try {
    let provider = await context.database.orm.MetadataProvider.first({
      kind: "musicbrainz",
    });
    if (!provider) {
      provider = await context.database.orm.MetadataProvider.create({
        kind: "musicbrainz",
        name: "MusicBrainz",
        accountLabel: null,
        configuration: JSON.stringify({ contact: "owner@example.com" }),
        enabled: 1,
        position: 0,
      });
    }
    const member = await createMemberSession(context);

    const response = await context.app.inject({
      method: "GET",
      url: "/api/overview",
      headers: member,
    });
    assert.equal(response.statusCode, 200, response.body);
    const metadataProvider = response
      .json<OverviewResponse>()
      .metadataProviders.find((item) => item.id === provider.id);
    assert.deepEqual(metadataProvider, {
      id: provider.id,
      kind: "musicbrainz",
      name: "MusicBrainz",
      status: "online",
    });
    assert.equal(response.body.includes("owner@example.com"), false);
  } finally {
    await context.close();
  }
});

test("overview counts the signed-in user's visible playlists", async () => {
  const context = await createTestContext();
  try {
    const member = await createMemberSession(context);
    const user = await context.database.orm.User.firstOrThrow({
      email: "member@example.com",
    });
    await context.database.orm.Playlist.create({
      userId: user.id,
      kind: "manual",
      name: "Favorites",
    });
    const response = await context.app.inject({
      method: "GET",
      url: "/api/overview",
      headers: member,
    });
    assert.equal(response.statusCode, 200, response.body);
    assert.equal(response.json<OverviewResponse>().counts.playlists, 2);
  } finally {
    await context.close();
  }
});

test("overview includes sanitized download clients", async () => {
  const context = await createTestContext();
  try {
    const source = await context.database.orm.LibrarySource.firstOrThrow({
      kind: "path",
    });
    const client = await context.database.orm.DownloadClient.create({
      kind: "qbittorrent",
      name: "Downloads",
      url: "http://qbit.local:8080/",
      username: "private-user",
      credentialCiphertext: "private-password",
      destinationSourceId: source.id,
    });
    const member = await createMemberSession(context);
    const response = await context.app.inject({
      method: "GET",
      url: "/api/overview",
      headers: member,
    });
    assert.equal(response.statusCode, 200, response.body);
    const downloadClient = response
      .json<OverviewResponse>()
      .downloadClients.find((item) => item.id === client.id);
    assert.deepEqual(downloadClient, {
      id: client.id,
      kind: "qbittorrent",
      name: "Downloads",
      address: "qbit.local:8080",
      destinationSourceId: source.id,
      status: "unknown",
    });
    assert.equal(response.body.includes("private-user"), false);
    assert.equal(response.body.includes("private-password"), false);
  } finally {
    await context.close();
  }
});

test("overview includes sanitized release indexers", async () => {
  const context = await createTestContext();
  try {
    const source = await context.database.orm.LibrarySource.firstOrThrow({
      kind: "path",
    });
    const client = await context.database.orm.DownloadClient.create({
      kind: "qbittorrent",
      name: "Linked downloader",
      url: "http://qbit.local:8080/",
      username: "",
      credentialCiphertext: "private-password",
      destinationSourceId: source.id,
    });
    const indexer = await context.database.orm.ReleaseIndexer.create({
      kind: "torznab",
      name: "Private Tracker",
      url: "http://indexer.local:9117/api",
      credentialCiphertext: "private-indexer-key",
      downloadClientId: client.id,
      position: 0,
    });
    const member = await createMemberSession(context);
    const response = await context.app.inject({
      method: "GET",
      url: "/api/overview",
      headers: member,
    });
    assert.equal(response.statusCode, 200, response.body);
    const releaseIndexer = response
      .json<OverviewResponse>()
      .releaseIndexers.find((item) => item.id === indexer.id);
    assert.deepEqual(releaseIndexer, {
      id: indexer.id,
      kind: "torznab",
      name: "Private Tracker",
      address: "indexer.local:9117",
      downloadClientId: client.id,
      status: "unknown",
    });
    assert.equal(response.body.includes("private-indexer-key"), false);
  } finally {
    await context.close();
  }
});

test("overview checks Jellyfin with stored credentials and hides them", async () => {
  let online = true;
  const context = await createTestContext({
    jellyfinFetch: async (input) =>
      online
        ? jellyfinResponse(true)(input)
        : new Response("unavailable", { status: 503 }),
  });
  try {
    const created = await context.app.inject({
      method: "POST",
      url: "/api/admin/library-sources",
      headers: context.authorization,
      payload: {
        kind: "jellyfin",
        url: "http://jellyfin.local:8096",
        apiKey: JELLYFIN_API_KEY,
        libraryId: "music-library-id",
        collectionType: "music",
      },
    });
    assert.equal(created.statusCode, 201, created.body);
    online = false;

    const member = await createMemberSession(context);
    const response = await context.app.inject({
      method: "GET",
      url: "/api/overview",
      headers: member,
    });
    assert.equal(response.statusCode, 200, response.body);
    const overview = response.json<OverviewResponse>();
    const source = overview.librarySources.find(
      (item) => item.kind === "jellyfin",
    );
    assert.deepEqual(source, {
      id: JSON.parse(created.body).id,
      kind: "jellyfin",
      name: "Music",
      address: "jellyfin.local:8096",
      fileCount: 0,
      status: "offline",
    });
    assert.equal(response.body.includes(JELLYFIN_API_KEY), false);
    assert.equal(response.body.includes("jellyfin.local:8096/"), false);
  } finally {
    await context.close();
  }
});
