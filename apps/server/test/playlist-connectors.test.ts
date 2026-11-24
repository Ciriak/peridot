import assert from "node:assert/strict";
import test from "node:test";
import type {
  PlaylistAccountResponse,
  PlaylistDetailResponse,
  PlaylistListResponse,
  PlaylistSyncResultResponse,
  RemotePlaylistListResponse,
} from "@peridot/contracts";
import type { ConnectorRuntimeDefinition } from "../src/connectors.js";
import { createMediaFixture, createTestContext } from "./helpers.js";

const ACCOUNT_SECRET = "playlist-account-private-token";
const remotePlaylists = new Map([
  [
    "remote-playlist",
    {
      title: "Remote favorites",
      version: "v1",
      items: [
        {
          externalTrackId: "remote-one",
          title: "Matched track",
          artist: "Artist",
          album: "Album",
          durationMs: 60_000,
          isrc: "US-AAA-26-00001",
        },
        {
          externalTrackId: "remote-two",
          title: "Unmatched track",
          artist: "Other artist",
          album: null,
          durationMs: 90_000,
          isrc: null,
        },
      ],
    },
  ],
]);

function playlistConnector(): ConnectorRuntimeDefinition {
  return {
    kind: "test-playlist",
    role: "playlist-account",
    name: "Test playlists",
    capabilities: ["playlist-read"],
    playlistReference: {
      kind: "test-playlist",
      async listPlaylists(account) {
        assert.equal(account.credentials.token, ACCOUNT_SECRET);
        return [...remotePlaylists].map(([id, playlist]) => ({
          id,
          title: playlist.title,
          itemCount: playlist.items.length,
        }));
      },
      async readPlaylist(account, id) {
        assert.equal(account.credentials.token, ACCOUNT_SECRET);
        const playlist = remotePlaylists.get(id);
        if (!playlist) throw new Error("Remote playlist not found");
        return {
          title: playlist.title,
          version: playlist.version,
          items: playlist.items,
        };
      },
    },
  };
}

test("playlist account links stay private and synchronize idempotently", async () => {
  const context = await createTestContext({
    connectors: [playlistConnector()],
  });
  try {
    const { media: matchedMedia } = await createMediaFixture(context, {
      media: {
        title: "Matched track",
        artist: "Artist",
        album: "Album",
        durationMs: 60_000,
      },
      copy: {
        durationMs: 60_000,
        recordingIdentityKeys: JSON.stringify(["isrc:us-aaa-26-00001"]),
      },
    });

    const createdAccount = await context.app.inject({
      method: "POST",
      url: "/api/playlist-accounts",
      headers: context.authorization,
      payload: {
        kind: "test-playlist",
        name: "My remote account",
        configuration: { owner: "test-owner" },
        credential: { token: ACCOUNT_SECRET },
      },
    });
    assert.equal(createdAccount.statusCode, 201, createdAccount.body);
    assert.doesNotMatch(createdAccount.body, new RegExp(ACCOUNT_SECRET));
    const account = createdAccount.json<PlaylistAccountResponse>();
    assert.equal(account.hasCredential, true);

    const remote = await context.app.inject({
      method: "GET",
      url: `/api/playlist-accounts/${account.id}/playlists`,
      headers: context.authorization,
    });
    assert.equal(remote.statusCode, 200, remote.body);
    assert.deepEqual(remote.json<RemotePlaylistListResponse>().items, [
      {
        id: "remote-playlist",
        title: "Remote favorites",
        itemCount: 2,
      },
    ]);

    const linked = await context.app.inject({
      method: "POST",
      url: `/api/playlist-accounts/${account.id}/links`,
      headers: context.authorization,
      payload: {
        externalPlaylistId: "remote-playlist",
        syncMode: "synchronize",
      },
    });
    assert.equal(linked.statusCode, 201, linked.body);
    assert.doesNotMatch(linked.body, new RegExp(ACCOUNT_SECRET));
    const firstSync = linked.json<PlaylistSyncResultResponse>();
    assert.equal(firstSync.added, 2);
    assert.equal(firstSync.matched, 1);
    assert.equal(firstSync.unmatched, 1);
    assert.equal(firstSync.playlist.kind, "external");
    assert.equal(firstSync.playlist.link?.syncMode, "synchronize");
    const matched = firstSync.playlist.entries.find(
      (entry) => entry.media?.id === matchedMedia.id,
    );
    assert.ok(matched);
    assert.equal(
      firstSync.playlist.entries.find(
        (entry) => entry.external?.externalTrackId === "remote-two",
      )?.media,
      null,
    );

    const secondSync = await context.app.inject({
      method: "POST",
      url: `/api/playlists/${firstSync.playlist.id}/sync`,
      headers: context.authorization,
    });
    assert.equal(secondSync.statusCode, 200, secondSync.body);
    const synchronized = secondSync.json<PlaylistSyncResultResponse>();
    assert.equal(synchronized.added, 0);
    assert.equal(synchronized.removed, 0);
    assert.equal(synchronized.unchanged, 2);

    const listed = await context.app.inject({
      method: "GET",
      url: "/api/playlists",
      headers: context.authorization,
    });
    assert.equal(listed.statusCode, 200);
    assert.equal(
      listed
        .json<PlaylistListResponse>()
        .items.find((playlist) => playlist.id === firstSync.playlist.id)?.kind,
      "external",
    );

    const rejected = await context.app.inject({
      method: "POST",
      url: `/api/playlists/${firstSync.playlist.id}/items`,
      headers: context.authorization,
      payload: { kind: "catalog", mediaId: matchedMedia.id },
    });
    assert.equal(rejected.statusCode, 409);
    assert.equal(rejected.json().error.code, "external_playlist_read_only");

    const detail = await context.app.inject({
      method: "GET",
      url: `/api/playlists/${firstSync.playlist.id}`,
      headers: context.authorization,
    });
    assert.equal(detail.statusCode, 200);
    assert.equal(detail.json<PlaylistDetailResponse>().entries.length, 2);
  } finally {
    await context.close();
  }
});
