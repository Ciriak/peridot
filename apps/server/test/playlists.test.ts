import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import type {
  AddPlaylistItemResponse,
  PlaylistDetailResponse,
  PlaylistListResponse,
  LikeListResponse,
} from "@peridot/contracts";
import {
  createMemberSession,
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
  await writeFile(
    path.join(context.root, "music", filename),
    createTaggedMp3({
      title,
      artist: "Playlist Artist",
      album: "Playlist Album",
      discNumber: 1,
      trackNumber: 1,
      ...(coverSeed
        ? {
            cover: {
              mimeType: "image/jpeg",
              data: Buffer.from(`cover-${coverSeed}`),
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
  return context.database.orm.Track.orderBy((track) => track.title.asc()).all();
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
  trackId: string,
) {
  const response = await context.app.inject({
    method: "POST",
    url: `/api/playlists/${playlistId}/items`,
    headers: context.authorization,
    payload: { kind: "catalog", trackId },
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
    assert.equal(list.totalCount, 1);
    assert.deepEqual(
      list.items.map((item) => item.name),
      ["Road trip"],
    );

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
        origin: "http://127.0.0.1:3000",
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
    assert.equal(memberList.json<PlaylistListResponse>().totalCount, 0);

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
      url: `/api/playlists?trackId=${encodeURIComponent(tracks[1]!.id)}`,
      headers: context.authorization,
    });
    assert.equal(membership.statusCode, 200);
    assert.equal(
      membership.json<PlaylistListResponse>().items[0]!.containsTrack,
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
    assert.equal(entry.track, null);
    assert.deepEqual(entry.external, {
      provider: "musicbrainz",
      externalTrackId: "recording-stable-id",
      title: "Imported title",
      artist: "Imported artist",
      album: "Imported album",
      durationMs: 214000,
    });

    await context.database.orm.Track.where({ id: track.id }).update({
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
    assert.equal(resolved.entries[0]!.track?.id, track.id);
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

    await context.database.orm.Track.where({ id: track.id }).delete();
    const afterDeletion = await getPlaylist(context, playlist.id);
    assert.equal(afterDeletion.entries[0]!.track, null);
    assert.equal(afterDeletion.entries[0]!.title, "Snapshot Track");
    assert.equal(afterDeletion.entries[0]!.available, false);
  } finally {
    await context.close();
  }
});
