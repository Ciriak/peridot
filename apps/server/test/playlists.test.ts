import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import sharp from "sharp";
import type {
  AddPlaylistItemResponse,
  PlaylistDetailResponse,
  PlaylistListResponse,
  LikeListResponse,
} from "@peridot/contracts";
import {
  createMemberSession,
  createMediaFixture,
  createTaggedMp3,
  createTestContext,
  startScan,
} from "./helpers.js";

type TestContext = Awaited<ReturnType<typeof createTestContext>>;

async function addFile(
  context: TestContext,
  filename: string,
  title: string,
  coverSeed = "",
) {
  const folder = path.join(context.root, "music", path.dirname(filename));
  await mkdir(folder, { recursive: true });
  const coverIndex = Number(coverSeed);
  const cover = coverSeed
    ? await sharp({
        create: {
          background: {
            b: 80,
            g: 120,
            r: Number.isFinite(coverIndex) ? coverIndex * 20 : 0,
          },
          channels: 3,
          height: 16,
          width: 16,
        },
      })
        .jpeg()
        .toBuffer()
    : null;
  await writeFile(
    path.join(context.root, "music", filename),
    createTaggedMp3({
      title,
      artist: "Playlist Artist",
      album: "Playlist Album",
      discNumber: 1,
      trackNumber: 1,
      ...(cover
        ? {
            cover: {
              mimeType: "image/jpeg",
              data: cover,
            },
          }
        : {}),
    }),
  );
}

async function scanTracks(
  context: TestContext,
  files: Array<{ filename: string; title: string; coverSeed?: string }>,
) {
  for (const file of files) {
    await addFile(context, file.filename, file.title, file.coverSeed ?? "");
  }
  const result = await startScan(context);
  assert.equal(result.status, "completed");
  return context.database.orm.Media.orderBy((track) => track.title.asc()).all();
}

async function createPlaylist(
  context: TestContext,
  authorization = context.authorization,
  name = "Road trip",
) {
  const response = await context.app.inject({
    method: "POST",
    url: "/api/playlists",
    headers: authorization,
    payload: { name },
  });
  assert.equal(response.statusCode, 201);
  return response.json<PlaylistDetailResponse>();
}

async function getPlaylist(
  context: TestContext,
  playlistId: string,
  authorization = context.authorization,
) {
  const response = await context.app.inject({
    method: "GET",
    url: `/api/playlists/${playlistId}`,
    headers: authorization,
  });
  assert.equal(response.statusCode, 200);
  return response.json<PlaylistDetailResponse>();
}

async function addTrack(
  context: TestContext,
  playlistId: string,
  mediaId: string,
) {
  const response = await context.app.inject({
    method: "POST",
    url: `/api/playlists/${playlistId}/items`,
    headers: context.authorization,
    payload: { kind: "catalog", mediaId },
  });
  assert.ok([200, 201].includes(response.statusCode));
  return {
    statusCode: response.statusCode,
    body: response.json<AddPlaylistItemResponse>(),
  };
}

test("playlists support owner CRUD and stay private", async () => {
  const context = await createTestContext();
  try {
    const created = await createPlaylist(
      context,
      context.authorization,
      "  Road   trip ",
    );
    assert.equal(created.name, "Road trip");
    assert.equal(created.trackCount, 0);

    const listResponse = await context.app.inject({
      method: "GET",
      url: "/api/playlists",
      headers: context.authorization,
    });
    assert.equal(listResponse.statusCode, 200);
    const list = listResponse.json<PlaylistListResponse>();
    assert.equal(list.totalCount, 3);
    assert.deepEqual(
      list.items.map((item) => item.name),
      ["Liked tracks", "Recently added", "Road trip"],
    );
    assert.equal(list.items[0]?.kind, "liked-tracks");
    assert.equal(list.items[1]?.kind, "recently-added");
    assert.equal(created.kind, "manual");

    const renamed = await context.app.inject({
      method: "PATCH",
      url: `/api/playlists/${created.id}`,
      headers: context.authorization,
      payload: { name: "Night drive" },
    });
    assert.equal(renamed.statusCode, 200);
    assert.equal(renamed.json<PlaylistDetailResponse>().name, "Night drive");
    const preflight = await context.app.inject({
      method: "OPTIONS",
      url: `/api/playlists/${created.id}`,
      headers: {
        origin: "http://127.0.0.1:17430",
        "access-control-request-method": "PATCH",
      },
    });
    assert.equal(preflight.statusCode, 204);
    assert.match(
      String(preflight.headers["access-control-allow-methods"]),
      /PATCH/,
    );

    const member = await createMemberSession(context);
    const memberList = await context.app.inject({
      method: "GET",
      url: "/api/playlists",
      headers: member,
    });
    assert.equal(memberList.statusCode, 200);
    assert.equal(memberList.json<PlaylistListResponse>().totalCount, 2);
    assert.equal(
      memberList.json<PlaylistListResponse>().items[0]?.kind,
      "liked-tracks",
    );
    assert.equal(
      memberList.json<PlaylistListResponse>().items[1]?.kind,
      "recently-added",
    );

    for (const method of ["GET", "PATCH", "DELETE"] as const) {
      const response = await context.app.inject({
        method,
        url: `/api/playlists/${created.id}`,
        headers: member,
        ...(method === "PATCH" ? { payload: { name: "Stolen" } } : {}),
      });
      assert.equal(response.statusCode, 404);
    }

    const removed = await context.app.inject({
      method: "DELETE",
      url: `/api/playlists/${created.id}`,
      headers: context.authorization,
    });
    assert.equal(removed.statusCode, 204);
    assert.equal(
      (await getPlaylist(context, created.id).catch(() => null))?.id,
      undefined,
    );
  } finally {
    await context.close();
  }
});

test("playlist list search filters names before pagination", async () => {
  const context = await createTestContext();
  try {
    for (const name of ["Road One", "Road Two", "Road Three", "Grüne Reise"]) {
      await createPlaylist(context, context.authorization, name);
    }

    const firstPage = await context.app.inject({
      method: "GET",
      url: "/api/playlists?query=road&limit=1",
      headers: context.authorization,
    });
    assert.equal(firstPage.statusCode, 200);
    const first = firstPage.json<PlaylistListResponse>();
    assert.equal(first.totalCount, 3);
    assert.equal(first.items.length, 1);
    assert.equal(first.nextOffset, 1);

    const secondPage = await context.app.inject({
      method: "GET",
      url: "/api/playlists?query=road&limit=1&offset=1",
      headers: context.authorization,
    });
    assert.equal(secondPage.statusCode, 200);
    const second = secondPage.json<PlaylistListResponse>();
    assert.equal(second.totalCount, 3);
    assert.equal(second.items.length, 1);
    assert.equal(second.nextOffset, 2);

    const accented = await context.app.inject({
      method: "GET",
      url: "/api/playlists?query=grune",
      headers: context.authorization,
    });
    assert.equal(accented.statusCode, 200);
    const normalized = accented.json<PlaylistListResponse>();
    assert.equal(normalized.totalCount, 1);
    assert.equal(normalized.items[0]?.name, "Grüne Reise");

    const blank = await context.app.inject({
      method: "GET",
      url: "/api/playlists?query=%20",
      headers: context.authorization,
    });
    assert.equal(blank.statusCode, 200);
    assert.equal(blank.json<PlaylistListResponse>().totalCount, 6);
  } finally {
    await context.close();
  }
});

test("liked tracks produce a read-only automatic playlist", async () => {
  const context = await createTestContext();
  try {
    const tracks = await scanTracks(context, [
      { filename: "newest.mp3", title: "Newest Like" },
      { filename: "older.mp3", title: "Older Like" },
      { filename: "audiobook.mp3", title: "Not Music" },
    ]);
    assert.equal(tracks.length, 3);
    await createPlaylist(context, context.authorization, "Manual playlist");
    const user = await context.database.orm.User.firstOrThrow();
    const newest = tracks.find((track) => track.title === "Newest Like")!;
    const older = tracks.find((track) => track.title === "Older Like")!;
    const audiobook = tracks.find((track) => track.title === "Not Music")!;
    await context.database.orm.MediaLike.create({
      userId: user.id,
      mediaId: older.id,
      createdAt: new Date("2026-01-01T10:00:00.000Z"),
    });
    await context.database.orm.MediaLike.create({
      userId: user.id,
      mediaId: newest.id,
      createdAt: new Date("2026-01-02T10:00:00.000Z"),
    });
    await context.database.orm.MediaLike.create({
      userId: user.id,
      mediaId: audiobook.id,
      createdAt: new Date("2026-01-03T10:00:00.000Z"),
    });
    await context.database.orm.Media.where({ id: audiobook.id }).update({
      mediaType: "audiobook",
    });
    await context.database.orm.CatalogMedia.where({ id: audiobook.id }).update({
      mediaType: "audiobook",
    });
    await context.database.orm.Media.where({ id: older.id }).update({
      available: 0,
    });
    await context.database.orm.CatalogMedia.where({ id: older.id }).update({
      available: 0,
    });

    const detail = await getPlaylist(context, "liked");
    assert.equal(detail.kind, "liked-tracks");
    assert.equal(detail.name, "Liked tracks");
    assert.deepEqual(
      detail.entries.map((entry) => entry.title),
      ["Newest Like", "Older Like"],
    );
    assert.equal(
      detail.entries.every((entry) => entry.liked),
      true,
    );
    assert.equal(detail.entries[1]?.available, false);
    assert.equal(detail.availableTrackCount, 1);
    assert.equal(detail.trackCount, 2);
    assert.equal(detail.coverUrls.length, 0);

    const listResponse = await context.app.inject({
      method: "GET",
      url: "/api/playlists",
      headers: context.authorization,
    });
    const list = listResponse.json<PlaylistListResponse>();
    assert.equal(list.totalCount, 3);
    assert.equal(list.items[0]?.kind, "liked-tracks");

    const contains = await context.app.inject({
      method: "GET",
      url: `/api/playlists?mediaId=${encodeURIComponent(newest.id)}`,
      headers: context.authorization,
    });
    assert.equal(
      contains.json<PlaylistListResponse>().items[0]?.containsTrack,
      true,
    );

    const searched = await context.app.inject({
      method: "GET",
      url: "/api/playlists?query=liked&limit=1",
      headers: context.authorization,
    });
    const searchPage = searched.json<PlaylistListResponse>();
    assert.equal(searchPage.totalCount, 1);
    assert.equal(searchPage.items[0]?.kind, "liked-tracks");
    assert.equal(searchPage.nextOffset, null);

    const secondPage = await context.app.inject({
      method: "GET",
      url: "/api/playlists?limit=1&offset=1",
      headers: context.authorization,
    });
    assert.deepEqual(
      secondPage.json<PlaylistListResponse>().items.map((item) => item.name),
      ["Recently added"],
    );

    const manualPage = await context.app.inject({
      method: "GET",
      url: "/api/playlists?limit=1&offset=2",
      headers: context.authorization,
    });
    assert.deepEqual(
      manualPage.json<PlaylistListResponse>().items.map((item) => item.name),
      ["Manual playlist"],
    );

    const member = await createMemberSession(context);
    const memberLiked = await getPlaylist(context, "liked", member);
    assert.equal(memberLiked.trackCount, 0);
    assert.deepEqual(memberLiked.entries, []);

    const mutationResponses = [
      await context.app.inject({
        method: "PATCH",
        url: "/api/playlists/liked",
        headers: context.authorization,
        payload: { name: "Renamed" },
      }),
      await context.app.inject({
        method: "DELETE",
        url: "/api/playlists/liked",
        headers: context.authorization,
      }),
      await context.app.inject({
        method: "POST",
        url: "/api/playlists/liked/items",
        headers: context.authorization,
        payload: { kind: "catalog", mediaId: newest.id },
      }),
      await context.app.inject({
        method: "DELETE",
        url: `/api/playlists/liked/items/${encodeURIComponent(`liked:${newest.id}`)}`,
        headers: context.authorization,
      }),
      await context.app.inject({
        method: "PUT",
        url: "/api/playlists/liked/items/order",
        headers: context.authorization,
        payload: { itemIds: [] },
      }),
    ];
    assert.deepEqual(
      mutationResponses.map((response) => response.statusCode),
      [409, 409, 409, 409, 409],
    );
    assert.equal(
      mutationResponses[0]?.json().error.code,
      "automatic_playlist_read_only",
    );
  } finally {
    await context.close();
  }
});

test("recently added exposes 50 newest available music tracks and stays read-only", async () => {
  const context = await createTestContext();
  try {
    const recentFixtures: Awaited<ReturnType<typeof createMediaFixture>>[] = [];
    for (let index = 0; index <= 50; index += 1) {
      recentFixtures.push(
        await createMediaFixture(context, {
          media: {
            title: `Recent ${index}`,
            artist: "Recent Artist",
            album: "Recent Album",
            durationMs: 60_000 + index,
            createdAt: new Date(
              `2026-01-01T00:${String(index).padStart(2, "0")}:00.000Z`,
            ),
          },
        }),
      );
    }
    await createMediaFixture(context, {
      media: {
        title: "Unavailable",
        artist: "Recent Artist",
        available: 0,
        createdAt: new Date("2026-01-02T00:00:00.000Z"),
      },
    });
    await createMediaFixture(context, {
      media: {
        title: "Audiobook",
        artist: "Recent Artist",
        mediaType: "audiobook",
        createdAt: new Date("2026-01-03T00:00:00.000Z"),
      },
    });
    await createMediaFixture(context, {
      media: {
        title: "Podcast",
        artist: "Recent Artist",
        mediaType: "podcast",
        createdAt: new Date("2026-01-04T00:00:00.000Z"),
      },
    });
    const user = await context.database.orm.User.firstOrThrow();
    await context.database.orm.MediaLike.create({
      userId: user.id,
      mediaId: recentFixtures[1]!.media.id,
    });

    const detail = await getPlaylist(context, "recent");
    assert.equal(detail.kind, "recently-added");
    assert.equal(detail.name, "Recently added");
    assert.equal(detail.trackCount, 50);
    assert.equal(detail.availableTrackCount, 50);
    assert.equal(detail.coverUrls.length, 0);
    assert.equal(detail.entries.length, 50);
    assert.equal(detail.entries[0]?.title, "Recent 50");
    assert.equal(detail.entries.at(-1)?.title, "Recent 1");
    assert.equal(detail.entries[0]?.position, 0);
    assert.equal(detail.entries.at(-1)?.position, 49);
    assert.equal(detail.entries.at(-1)?.liked, true);
    assert.equal(detail.entries.at(-1)?.media?.liked, true);
    assert.equal(
      detail.entries.some((entry) =>
        ["Recent 0", "Unavailable", "Audiobook", "Podcast"].includes(
          entry.title,
        ),
      ),
      false,
    );

    const listResponse = await context.app.inject({
      method: "GET",
      url: "/api/playlists?query=recent&limit=1",
      headers: context.authorization,
    });
    assert.equal(listResponse.statusCode, 200);
    const list = listResponse.json<PlaylistListResponse>();
    assert.equal(list.totalCount, 1);
    assert.equal(list.items[0]?.kind, "recently-added");
    assert.equal(list.items[0]?.trackCount, 50);

    const contains = await context.app.inject({
      method: "GET",
      url: `/api/playlists?mediaId=${encodeURIComponent(recentFixtures[50]!.media.id)}`,
      headers: context.authorization,
    });
    const recentSummary = contains
      .json<PlaylistListResponse>()
      .items.find((item) => item.id === "recent");
    assert.equal(recentSummary?.containsTrack, true);

    const mutationResponses = [
      await context.app.inject({
        method: "PATCH",
        url: "/api/playlists/recent",
        headers: context.authorization,
        payload: { name: "Renamed" },
      }),
      await context.app.inject({
        method: "DELETE",
        url: "/api/playlists/recent",
        headers: context.authorization,
      }),
      await context.app.inject({
        method: "POST",
        url: "/api/playlists/recent/items",
        headers: context.authorization,
        payload: {
          kind: "catalog",
          mediaId: recentFixtures[50]!.media.id,
        },
      }),
      await context.app.inject({
        method: "DELETE",
        url: `/api/playlists/recent/items/${encodeURIComponent(`recent:${recentFixtures[50]!.media.id}`)}`,
        headers: context.authorization,
      }),
      await context.app.inject({
        method: "PUT",
        url: "/api/playlists/recent/items/order",
        headers: context.authorization,
        payload: { itemIds: [] },
      }),
    ];
    assert.deepEqual(
      mutationResponses.map((response) => response.statusCode),
      [409, 409, 409, 409, 409],
    );
    assert.equal(
      mutationResponses[0]?.json().error.code,
      "automatic_playlist_read_only",
    );
  } finally {
    await context.close();
  }
});

test("playlist items append, deduplicate, reorder, and compact after removal", async () => {
  const context = await createTestContext();
  try {
    const tracks = await scanTracks(context, [
      { filename: "one.mp3", title: "One" },
      { filename: "two.mp3", title: "Two" },
    ]);
    assert.equal(tracks.length, 2);
    const playlist = await createPlaylist(context);

    const firstAdd = await addTrack(context, playlist.id, tracks[0]!.id);
    assert.equal(firstAdd.statusCode, 201);
    assert.equal(firstAdd.body.added, true);
    const duplicate = await addTrack(context, playlist.id, tracks[0]!.id);
    assert.equal(duplicate.statusCode, 200);
    assert.equal(duplicate.body.added, false);
    const secondAdd = await addTrack(context, playlist.id, tracks[1]!.id);
    assert.deepEqual(
      secondAdd.body.playlist.entries.map((entry) => entry.title),
      ["One", "Two"],
    );
    const membership = await context.app.inject({
      method: "GET",
      url: `/api/playlists?mediaId=${encodeURIComponent(tracks[1]!.id)}`,
      headers: context.authorization,
    });
    assert.equal(membership.statusCode, 200);
    assert.equal(
      membership
        .json<PlaylistListResponse>()
        .items.find((item) => item.id === playlist.id)!.containsTrack,
      true,
    );

    const ids = secondAdd.body.playlist.entries.map((entry) => entry.id);
    const reordered = await context.app.inject({
      method: "PUT",
      url: `/api/playlists/${playlist.id}/items/order`,
      headers: context.authorization,
      payload: { itemIds: [ids[1], ids[0]] },
    });
    assert.equal(reordered.statusCode, 200);
    assert.deepEqual(
      reordered
        .json<PlaylistDetailResponse>()
        .entries.map((entry) => entry.title),
      ["Two", "One"],
    );

    const incompleteOrder = await context.app.inject({
      method: "PUT",
      url: `/api/playlists/${playlist.id}/items/order`,
      headers: context.authorization,
      payload: { itemIds: [ids[0]] },
    });
    assert.equal(incompleteOrder.statusCode, 409);

    const removed = await context.app.inject({
      method: "DELETE",
      url: `/api/playlists/${playlist.id}/items/${ids[1]}`,
      headers: context.authorization,
    });
    assert.equal(removed.statusCode, 204);
    const current = await getPlaylist(context, playlist.id);
    assert.deepEqual(
      current.entries.map((entry) => ({
        title: entry.title,
        position: entry.position,
      })),
      [{ title: "One", position: 0 }],
    );
  } finally {
    await context.close();
  }
});

test("external playlist references stay unavailable until an exact stable ID matches", async () => {
  const context = await createTestContext();
  try {
    const [track] = await scanTracks(context, [
      { filename: "external.mp3", title: "External Match" },
    ]);
    assert.ok(track);
    const playlist = await createPlaylist(context);
    const response = await context.app.inject({
      method: "POST",
      url: `/api/playlists/${playlist.id}/items`,
      headers: context.authorization,
      payload: {
        kind: "external",
        reference: {
          provider: "MusicBrainz",
          externalTrackId: "recording-stable-id",
          title: "Imported title",
          artist: "Imported artist",
          album: "Imported album",
          durationMs: 214000,
        },
      },
    });
    assert.equal(response.statusCode, 201);
    const added = response.json<AddPlaylistItemResponse>();
    const entry = added.playlist.entries[0]!;
    assert.equal(entry.available, false);
    assert.equal(entry.media, null);
    assert.deepEqual(entry.external, {
      provider: "musicbrainz",
      externalTrackId: "recording-stable-id",
      title: "Imported title",
      artist: "Imported artist",
      album: "Imported album",
      durationMs: 214000,
    });

    await context.database.orm.Media.where({ id: track.id }).update({
      metadataProviderId: "provider-1",
      metadataProviderKind: "musicbrainz",
      metadataProviderName: "MusicBrainz",
      metadataExternalTrackId: "recording-stable-id",
      metadataSourceUrl:
        "https://musicbrainz.org/recording/recording-stable-id",
      metadataMatchedAt: new Date(),
    });

    const resolved = await getPlaylist(context, playlist.id);
    assert.equal(resolved.entries[0]!.available, true);
    assert.equal(resolved.entries[0]!.media?.id, track.id);
    assert.equal(resolved.entries[0]!.title, "External Match");
  } finally {
    await context.close();
  }
});

test("playlist summaries expose at most nine distinct covers in playlist order", async () => {
  const context = await createTestContext();
  try {
    const tracks = await scanTracks(
      context,
      Array.from({ length: 10 }, (_, index) => ({
        filename: `cover-${index}.mp3`,
        title: `Cover ${String(index).padStart(2, "0")}`,
        coverSeed: String(index),
      })),
    );
    assert.equal(tracks.length, 10);
    const playlist = await createPlaylist(context);
    let detail: PlaylistDetailResponse | null = null;
    for (const track of tracks) {
      detail = (await addTrack(context, playlist.id, track.id)).body.playlist;
    }
    assert.ok(detail);
    assert.equal(detail.coverUrls.length, 9);
    assert.equal(new Set(detail.coverUrls).size, 9);
    const initialCovers = detail.coverUrls;
    const itemIds = detail.entries.map((entry) => entry.id);
    const reverseOrder = [...itemIds].reverse();
    const reordered = await context.app.inject({
      method: "PUT",
      url: `/api/playlists/${playlist.id}/items/order`,
      headers: context.authorization,
      payload: { itemIds: reverseOrder },
    });
    assert.equal(reordered.statusCode, 200);
    assert.notDeepEqual(
      reordered.json<PlaylistDetailResponse>().coverUrls,
      initialCovers,
    );
  } finally {
    await context.close();
  }
});

test("playlist likes are private and catalog deletion preserves display snapshots", async () => {
  const context = await createTestContext();
  try {
    const [track] = await scanTracks(context, [
      { filename: "snapshot.mp3", title: "Snapshot Track" },
    ]);
    assert.ok(track);
    const playlist = await createPlaylist(context);
    await addTrack(context, playlist.id, track.id);

    const liked = await context.app.inject({
      method: "POST",
      url: "/api/likes",
      headers: context.authorization,
      payload: {
        kind: "playlist",
        playlistId: playlist.id,
        name: playlist.name,
      },
    });
    assert.equal(liked.statusCode, 200);
    const likes = await context.app.inject({
      method: "GET",
      url: "/api/likes",
      headers: context.authorization,
    });
    assert.deepEqual(
      likes.json<LikeListResponse>().playlists.map((item) => item.playlistId),
      [playlist.id],
    );
    const member = await createMemberSession(context);
    const memberLike = await context.app.inject({
      method: "POST",
      url: "/api/likes",
      headers: member,
      payload: {
        kind: "playlist",
        playlistId: playlist.id,
        name: playlist.name,
      },
    });
    assert.equal(memberLike.statusCode, 404);

    await context.database.orm.Media.where({ id: track.id }).delete();
    const afterDeletion = await getPlaylist(context, playlist.id);
    assert.equal(afterDeletion.entries[0]!.media, null);
    assert.equal(afterDeletion.entries[0]!.title, "Snapshot Track");
    assert.equal(afterDeletion.entries[0]!.available, false);
  } finally {
    await context.close();
  }
});
