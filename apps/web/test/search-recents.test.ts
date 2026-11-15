import assert from "node:assert/strict";
import test from "node:test";
import type { TrackResponse } from "@peridot/contracts";
import { groupAlbums } from "../app/lib/library.ts";
import {
  addRecentAlbum,
  parsePersistedSearchRecents,
  readPersistedSearchRecents,
  resolveRecentAlbums,
  savePersistedSearchRecents,
  SEARCH_RECENTS_LIMIT,
  searchRecentsStorageKey,
  type SearchRecentsStorage,
} from "../app/lib/search-recents.ts";

const scope = {
  serverAddress: "http://127.0.0.1:17430",
  userId: "user-1",
};

function createStorage(): SearchRecentsStorage {
  const values = new Map<string, string>();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => {
      values.set(key, value);
    },
  };
}

function track(
  id: string,
  title: string,
  artist: string,
  album: string,
  albumId: string,
): TrackResponse {
  return {
    id,
    title,
    artist,
    artists: [artist],
    album,
    albumId,
    discNumber: null,
    trackNumber: 1,
    durationMs: 180_000,
    mimeType: "audio/mpeg",
    available: true,
    coverUrl: null,
    metadata: null,
  };
}

test("recent albums move to the front, deduplicate, and remain bounded", () => {
  let recents = addRecentAlbum([], {
    albumId: "album-night-sessions",
    title: "Night Sessions",
    artist: "Elliot Lake",
  });
  recents = addRecentAlbum(recents, {
    albumId: "album-blue-hours",
    title: "Blue Hours",
    artist: "Elliot Lake",
  });
  recents = addRecentAlbum(recents, {
    albumId: "album-night-sessions",
    title: " night sessions ",
    artist: "ELLIOT LAKE",
  });

  assert.deepEqual(recents, [
    {
      albumId: "album-night-sessions",
      title: "night sessions",
      artist: "ELLIOT LAKE",
    },
    {
      albumId: "album-blue-hours",
      title: "Blue Hours",
      artist: "Elliot Lake",
    },
  ]);

  for (let index = 0; index < SEARCH_RECENTS_LIMIT + 3; index++) {
    recents = addRecentAlbum(recents, {
      albumId: `album-${index}`,
      title: `Album ${index}`,
      artist: "Artist",
    });
  }
  assert.equal(recents.length, SEARCH_RECENTS_LIMIT);
  assert.equal(recents[0]?.title, `Album ${SEARCH_RECENTS_LIMIT + 2}`);
});

test("recent albums persist only for their server and user scope", () => {
  const storage = createStorage();
  assert.equal(
    savePersistedSearchRecents(storage, scope, [
      {
        albumId: "album-night-sessions",
        title: "Night Sessions",
        artist: "Elliot Lake",
      },
    ]),
    true,
  );

  assert.deepEqual(readPersistedSearchRecents(storage, scope), [
    {
      albumId: "album-night-sessions",
      title: "Night Sessions",
      artist: "Elliot Lake",
    },
  ]);
  assert.deepEqual(
    readPersistedSearchRecents(storage, { ...scope, userId: "user-2" }),
    [],
  );
  assert.equal(
    storage.getItem(searchRecentsStorageKey(scope))?.includes('"version":2'),
    true,
  );
});

test("malformed recent album storage is ignored", () => {
  const storage = createStorage();
  storage.setItem(
    searchRecentsStorageKey(scope),
    JSON.stringify({
      version: 2,
      ...scope,
      items: [{ title: "Missing artist" }],
    }),
  );
  assert.deepEqual(readPersistedSearchRecents(storage, scope), []);
  assert.equal(parsePersistedSearchRecents("not-json", scope), null);
});

test("recent albums reconcile against the current catalog in saved order", () => {
  const albums = groupAlbums([
    track(
      "track-1",
      "Blue Hours",
      "Elliot Lake",
      "Night Sessions",
      "album-night-sessions",
    ),
    track(
      "track-2",
      "Last Train",
      "Elliot Lake",
      "Static Coast",
      "album-static-coast",
    ),
  ]);
  const resolved = resolveRecentAlbums(
    [
      {
        albumId: "album-static-coast",
        title: "Static Coast",
        artist: "Elliot Lake",
      },
      {
        albumId: "album-removed",
        title: "Removed Album",
        artist: "Elliot Lake",
      },
      {
        albumId: "album-night-sessions",
        title: "night sessions",
        artist: "elliot lake",
      },
    ],
    albums,
  );

  assert.deepEqual(
    resolved.map((album) => album.title),
    ["Static Coast", "Night Sessions"],
  );
});
