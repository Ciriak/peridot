import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import type { TrackListResponse, TrackResponse } from "@peridot/contracts";
import {
  defaultLibrarySettings,
  librarySettingsStorageKey,
  parsePersistedLibrarySettings,
  readPersistedLibrarySettings,
  savePersistedLibrarySettings,
  type LibrarySettingsStorage,
} from "../app/lib/library-settings.ts";
import { loadAllLikedTracks } from "../app/lib/liked-offline.ts";

const scope = {
  serverAddress: "http://127.0.0.1:17430",
  userId: "user-1",
};

function createStorage(): LibrarySettingsStorage {
  const values = new Map<string, string>();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => {
      values.set(key, value);
    },
  };
}

function track(id: string): TrackResponse {
  return {
    id,
    title: id,
    artist: "Artist",
    artists: ["Artist"],
    album: null,
    albumId: null,
    discNumber: null,
    trackNumber: null,
    durationMs: null,
    mimeType: "audio/mpeg",
    available: true,
    coverUrl: null,
    metadata: null,
    liked: true,
  };
}

function page(
  items: TrackResponse[],
  nextCursor: string | null,
): TrackListResponse {
  return { items, nextCursor, catalogRevision: 1 };
}

test("liked titles are available offline by default for each server and user", () => {
  const storage = createStorage();

  assert.deepEqual(defaultLibrarySettings(), { likedTitlesOffline: true });
  assert.deepEqual(readPersistedLibrarySettings(storage, scope), {
    likedTitlesOffline: true,
  });
  assert.equal(
    savePersistedLibrarySettings(storage, scope, {
      likedTitlesOffline: false,
    }),
    true,
  );
  assert.deepEqual(readPersistedLibrarySettings(storage, scope), {
    likedTitlesOffline: false,
  });
  assert.deepEqual(
    readPersistedLibrarySettings(storage, { ...scope, userId: "user-2" }),
    { likedTitlesOffline: true },
  );
  assert.match(librarySettingsStorageKey(scope), /library-settings:v1:/);
});

test("invalid library settings fall back to the enabled default", () => {
  const storage = createStorage();
  storage.setItem(
    librarySettingsStorageKey(scope),
    JSON.stringify({
      version: 1,
      ...scope,
      likedTitlesOffline: "yes",
    }),
  );

  assert.equal(parsePersistedLibrarySettings("not-json", scope), null);
  assert.deepEqual(readPersistedLibrarySettings(storage, scope), {
    likedTitlesOffline: true,
  });
});

test("liked-title synchronization loads every page and removes duplicate tracks", async () => {
  const cursors: Array<string | null> = [];
  const tracks = await loadAllLikedTracks(async (cursor) => {
    cursors.push(cursor);
    if (cursor === null) return page([track("one"), track("two")], "page-2");
    return page([track("two"), track("three")], null);
  });

  assert.deepEqual(cursors, [null, "page-2"]);
  assert.deepEqual(
    tracks.map((item) => item.id),
    ["one", "two", "three"],
  );
});

test("the Library setting persists and drives automatic liked-track saving", async () => {
  const [pageSource, syncSource, appSource] = await Promise.all([
    readFile(
      new URL("../app/pages/settings/library.vue", import.meta.url),
      "utf8",
    ),
    readFile(
      new URL("../app/components/LikedTitlesOfflineSync.vue", import.meta.url),
      "utf8",
    ),
    readFile(new URL("../app/app.vue", import.meta.url), "utf8"),
  ]);

  assert.match(
    pageSource,
    /Make my liked titles available offline|settings\.library\.likedTitlesOffline/,
  );
  assert.match(pageSource, /<Switch[\s\S]*v-model="likedTitlesOfflineModel"/);
  assert.match(pageSource, /aria-labelledby="liked-titles-offline-label"/);
  assert.match(pageSource, /:icon="icons\.cloudDownload"/);
  assert.match(pageSource, /settings\.library\.largeCatalogOfflineUnavailable/);
  assert.match(pageSource, /syncStatus === 'too-large'/);
  assert.match(syncSource, /liked: true/);
  assert.match(syncSource, /loadAllLikedTracks/);
  assert.match(syncSource, /saveOfflineCollection/);
  assert.match(syncSource, /likesRevision/);
  assert.match(syncSource, /await save\(track\)/);
  assert.match(appSource, /<LikedTitlesOfflineSync \/>/);
});
