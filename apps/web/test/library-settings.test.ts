import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import type {
  AlbumListResponse,
  AlbumSummaryResponse,
  TrackListResponse,
  TrackResponse,
} from "@peridot/contracts";
import {
  defaultLibrarySettings,
  hasPersistedLibrarySettings,
  librarySettingsStorageKey,
  parsePersistedLibrarySettings,
  readPersistedLibrarySettings,
  savePersistedLibrarySettings,
  type LibrarySettingsStorage,
} from "../app/lib/library-settings.ts";
import {
  loadAllLikedAlbums,
  loadAllLikedTracks,
  saveLikedAlbumsOffline,
  saveLikedTracksOffline,
} from "../app/lib/liked-offline.ts";

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
  return { items, nextCursor, totalCount: items.length, catalogRevision: 1 };
}

function album(id: string): AlbumSummaryResponse {
  return {
    id,
    title: id,
    artist: "Artist",
    artists: ["Artist"],
    coverUrl: null,
    trackCount: 2,
    durationMs: null,
    releaseYear: null,
    liked: true,
  };
}

function albumPage(
  items: AlbumSummaryResponse[],
  nextCursor: string | null,
): AlbumListResponse {
  return { items, nextCursor, totalCount: items.length, catalogRevision: 1 };
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
  assert.match(librarySettingsStorageKey(scope), /library-settings:v2:/);
  assert.equal(hasPersistedLibrarySettings(storage, scope), true);
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

test("legacy device preferences are available for account initialization", () => {
  const storage = createStorage();
  storage.setItem(
    `peridot:library-settings:v1:${encodeURIComponent(scope.serverAddress)}:${encodeURIComponent(scope.userId)}`,
    JSON.stringify({
      version: 1,
      ...scope,
      likedTitlesOffline: false,
    }),
  );

  assert.equal(hasPersistedLibrarySettings(storage, scope), true);
  assert.deepEqual(readPersistedLibrarySettings(storage, scope), {
    likedTitlesOffline: false,
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

test("liked-album synchronization loads every page and removes duplicates", async () => {
  const cursors: Array<string | null> = [];
  const albums = await loadAllLikedAlbums(async (cursor) => {
    cursors.push(cursor);
    if (cursor === null)
      return albumPage([album("one"), album("two")], "page-2");
    return albumPage([album("two"), album("three")], null);
  });

  assert.deepEqual(cursors, [null, "page-2"]);
  assert.deepEqual(
    albums.map((item) => item.id),
    ["one", "two", "three"],
  );
});

test("automatic liked-track saving continues after a failed download", async () => {
  const saved: string[] = [];
  const result = await saveLikedTracksOffline(
    [track("saved"), track("failed"), track("next")],
    {
      isSaved: (trackId) => trackId === "saved",
      save: async (item) => {
        if (item.id === "failed") return false;
        saved.push(item.id);
        return true;
      },
    },
  );

  assert.deepEqual(saved, ["next"]);
  assert.deepEqual(result.failedTrackIds, ["failed"]);
  assert.deepEqual(result.savedTrackIds, ["next"]);
  assert.equal(result.stopped, false);
});

test("automatic liked-album saving continues after one album fails", async () => {
  const saved: string[] = [];
  const result = await saveLikedAlbumsOffline(
    [album("failed-load"), album("saved"), album("failed-save")],
    {
      loadTracks: async (item) => {
        if (item.id === "failed-load") throw new Error("load failed");
        return [track(`${item.id}-track`)];
      },
      save: async (item) => {
        if (item.id === "failed-save") return false;
        saved.push(item.id);
        return true;
      },
    },
  );

  assert.deepEqual(saved, ["saved"]);
  assert.deepEqual(result.failedAlbumIds, ["failed-load", "failed-save"]);
  assert.deepEqual(result.savedAlbumIds, ["saved"]);
  assert.equal(result.stopped, false);
});

test("the Library setting persists and drives automatic liked-track saving", async () => {
  const [pageSource, syncSource, appSource, settingsSource] = await Promise.all(
    [
      readFile(
        new URL("../app/pages/settings/library.vue", import.meta.url),
        "utf8",
      ),
      readFile(
        new URL(
          "../app/components/LikedTitlesOfflineSync.vue",
          import.meta.url,
        ),
        "utf8",
      ),
      readFile(new URL("../app/app.vue", import.meta.url), "utf8"),
      readFile(
        new URL("../app/composables/use-library-settings.ts", import.meta.url),
        "utf8",
      ),
    ],
  );

  assert.match(
    pageSource,
    /Make my liked titles available offline|settings\.library\.likedTitlesOffline/,
  );
  assert.match(pageSource, /<Switch[\s\S]*v-model="likedTitlesOfflineModel"/);
  assert.match(pageSource, /aria-labelledby="liked-titles-offline-label"/);
  assert.match(pageSource, /:icon="icons\.cloudDownload"/);
  assert.match(pageSource, /settings\.library\.largeCatalogOfflineUnavailable/);
  assert.match(pageSource, /syncStatus === 'too-large'/);
  assert.match(syncSource, /likedTitlesOffline/);
  assert.match(syncSource, /downloadTasks\.cancelLikedTitles/);
  assert.match(syncSource, /saveLikedTitles/);
  assert.match(syncSource, /startDownloadWorker/);
  assert.match(syncSource, /likesRevision/);
  assert.match(appSource, /<LikedTitlesOfflineSync \/>/);
  assert.match(settingsSource, /fetchUserPreferences/);
  assert.match(
    settingsSource,
    /hasPersistedLibrarySettings\(\s+window\.localStorage/,
  );
  assert.match(settingsSource, /initializeUserPreferences/);
  assert.match(settingsSource, /updateUserPreferences/);
  assert.match(settingsSource, /verification\.value === "verified"/);
});
