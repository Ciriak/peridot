import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";
import type { TrackResponse } from "@peridot/contracts";
import { QueryClient, QueryObserver } from "@tanstack/vue-query";
import {
  OFFLINE_AUDIO_CACHE,
  OFFLINE_TRACK_DATABASE,
  offlineAudioCacheRequest,
  offlineTrackStorageKey,
  prepareOfflineResponse,
  snapshotTrackForOffline,
} from "../app/lib/offline-audio.ts";
import {
  OFFLINE_DATABASE,
  offlineTracks,
  type OfflineCatalogSnapshot,
} from "../app/lib/offline-catalog.ts";
import {
  OFFLINE_ARTWORK_CACHE,
  offlineArtworkCacheRequest,
} from "../app/lib/offline-artwork.ts";
import { saveOfflineCollection } from "../app/lib/offline-collection.ts";
import { isTrackPlayable } from "../app/lib/offline-playback.ts";
import { queryKeys } from "../app/lib/query-keys.ts";
import {
  blockingQueryLoading,
  visibleQueryError,
} from "../app/lib/query-view-state.ts";
import { reactive } from "vue";

const scope = {
  serverAddress: "http://127.0.0.1:17430",
  userId: "user-1",
};

async function waitFor(predicate: () => boolean, timeoutMs = 1_000) {
  const deadline = Date.now() + timeoutMs;
  while (!predicate()) {
    if (Date.now() >= deadline) throw new Error("Timed out waiting for state");
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}

test("Nuxt builds a client-rendered installable offline shell", async () => {
  const [config, devReset, indexIcon, maskableIcon] = await Promise.all([
    readFile(new URL("../nuxt.config.ts", import.meta.url), "utf8"),
    readFile(
      new URL(
        "../app/plugins/service-worker-dev-reset.client.ts",
        import.meta.url,
      ),
      "utf8",
    ),
    access(new URL("../public/pwa-192x192.png", import.meta.url)),
    access(new URL("../public/pwa-maskable-512x512.png", import.meta.url)),
  ]);

  assert.match(config, /ssr: false/);
  assert.match(config, /modules: \["@nuxtjs\/i18n", "@vite-pwa\/nuxt"\]/);
  assert.match(config, /registerType: "autoUpdate"/);
  assert.match(
    config,
    /devOptions: \{\s*enabled: false,?\s*\}/,
    "Development avoids a service-worker cache that can serve stale app code",
  );
  assert.match(devReset, /import\.meta\.dev/);
  assert.match(devReset, /registration\.unregister\(\)/);
  assert.match(devReset, /caches\.delete\(key\)/);
  assert.match(config, /navigateFallback: "\/"/);
  assert.match(config, /additionalManifestEntries/);
  assert.match(config, /rel: "manifest", href: "\/manifest.webmanifest"/);
  assert.match(config, /orientation: "portrait"/);
  assert.doesNotMatch(config, /runtimeCaching:/);
  assert.equal(indexIcon, undefined);
  assert.equal(maskableIcon, undefined);
});

test("the topbar names the unavailable-server state as offline mode", async () => {
  const locale = JSON.parse(
    await readFile(
      new URL("../i18n/locales/en-US.json", import.meta.url),
      "utf8",
    ),
  ) as Record<string, string>;

  assert.equal(locale["components.serverConnection.offline"], "Offline mode");
  assert.match(
    locale["components.serverConnection.offlineDescription"] ?? "",
    /Saved tracks remain available/,
  );
});

test("catalog synchronization does not depend on query-client initialization order", async () => {
  const plugin = await readFile(
    new URL("../app/plugins/offline-catalog.client.ts", import.meta.url),
    "utf8",
  );

  assert.match(plugin, /useState\("catalog-revision"/);
  assert.doesNotMatch(plugin, /useCatalogRevision|useQueryClient/);
});

test("query keys isolate server, user, resource, and list options", () => {
  const firstUserTrackKey = queryKeys.tracks(scope, {
    sort: "title",
    direction: "asc",
  });
  const otherUserTrackKey = queryKeys.tracks(
    { ...scope, userId: "user-2" },
    { sort: "title", direction: "asc" },
  );
  const otherServerTrackKey = queryKeys.tracks(
    { ...scope, serverAddress: "http://music.local:17430" },
    { sort: "title", direction: "asc" },
  );

  assert.notDeepEqual(firstUserTrackKey, otherUserTrackKey);
  assert.notDeepEqual(firstUserTrackKey, otherServerTrackKey);
  assert.deepEqual(queryKeys.likes(scope), [
    "peridot",
    scope.serverAddress,
    scope.userId,
    "likes",
  ]);
  assert.equal(OFFLINE_DATABASE, "peridot-web-offline-catalog-v2");
  assert.equal(OFFLINE_TRACK_DATABASE, "peridot-web-offline-tracks-v1");
  assert.notEqual(OFFLINE_DATABASE, OFFLINE_TRACK_DATABASE);
});

test("cached query data remains renderable after a background failure", async () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        staleTime: Number.POSITIVE_INFINITY,
      },
    },
  });
  const queryKey = queryKeys.likes(scope);
  const cached = {
    tracks: [],
    albums: [],
    audiobooks: [],
    podcasts: [],
    artists: [],
    playlists: [],
  };
  const options = {
    queryKey,
    queryFn: async () => cached,
  };
  const observer = new QueryObserver(queryClient, options);
  const unsubscribe = observer.subscribe(() => undefined);

  try {
    await waitFor(() => observer.getCurrentResult().data !== undefined);
    observer.setOptions({
      ...options,
      queryFn: async () => {
        throw new Error("server unavailable");
      },
    });
    await observer.refetch().catch(() => undefined);

    const result = observer.getCurrentResult();
    assert.deepEqual(result.data, cached);
    assert.equal(result.status, "error");
    assert.equal(
      visibleQueryError(result.data !== undefined, "Refresh failed"),
      null,
    );
    assert.equal(
      blockingQueryLoading(result.data !== undefined, result.isPending),
      false,
    );
  } finally {
    unsubscribe();
  }
});

test("offline audio keys are stable and scoped without bearer credentials", () => {
  const first = offlineAudioCacheRequest(
    scope,
    "track / one",
    "https://peridot.example",
  );
  const second = offlineAudioCacheRequest(
    scope,
    "track / one",
    "https://peridot.example",
  );

  assert.equal(first.url, second.url);
  assert.match(first.url, /track%20%2F%20one/);
  assert.doesNotMatch(first.url, /session|bearer|playbackToken/i);
  assert.notEqual(
    offlineTrackStorageKey(scope, "track-1"),
    offlineTrackStorageKey({ ...scope, userId: "user-2" }, "track-1"),
  );
  assert.equal(OFFLINE_AUDIO_CACHE, "peridot-offline-audio-v1");
  assert.equal(OFFLINE_ARTWORK_CACHE, "peridot-artwork-v2");
});

test("offline catalog and track manifests use separate IndexedDB databases", async () => {
  const [catalog, audio] = await Promise.all([
    readFile(new URL("../app/lib/offline-catalog.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/lib/offline-audio.ts", import.meta.url), "utf8"),
  ]);

  assert.match(
    catalog,
    /createStore\(OFFLINE_DATABASE, OFFLINE_CATALOG_STORE\)/,
  );
  assert.match(
    audio,
    /createStore\(OFFLINE_TRACK_DATABASE, OFFLINE_TRACK_STORE\)/,
  );
});

test("offline track metadata becomes plain data before IndexedDB storage", () => {
  const track = reactive({
    id: "track-1",
    title: "Track",
    artist: "Artist",
    artists: ["Artist"],
    album: "Album",
    albumId: "album-1",
    discNumber: 1,
    trackNumber: 2,
    durationMs: 180_000,
    mimeType: "audio/mpeg",
    available: true,
    coverUrl: "/api/covers/cover-1",
    metadata: { provider: { detail: { state: "matched" } } },
    liked: true,
  }) as unknown as TrackResponse;

  assert.throws(() => structuredClone(track), { name: "DataCloneError" });
  const snapshot = snapshotTrackForOffline(track);
  assert.doesNotThrow(() => structuredClone(snapshot));
  assert.deepEqual(snapshot, {
    id: "track-1",
    title: "Track",
    artist: "Artist",
    artists: ["Artist"],
    album: "Album",
    albumId: "album-1",
    discNumber: 1,
    trackNumber: 2,
    durationMs: 180_000,
    mimeType: "audio/mpeg",
    available: true,
    coverUrl: "/api/covers/cover-1",
    metadata: { provider: { detail: { state: "matched" } } },
    liked: true,
  });
});

test("offline audio downloads report determinate cache progress", async () => {
  const response = new Response(
    new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(Uint8Array.of(1, 2));
        controller.enqueue(Uint8Array.of(3, 4));
        controller.close();
      },
    }),
    {
      headers: {
        "content-length": "4",
        "content-type": "audio/mpeg",
      },
    },
  );
  const progress: Array<number | null> = [];
  const prepared = await prepareOfflineResponse(response, (value) =>
    progress.push(value),
  );

  assert.equal(prepared.size, 4);
  assert.equal(prepared.response.headers.get("content-type"), "audio/mpeg");
  assert.deepEqual(
    new Uint8Array(await prepared.response.arrayBuffer()),
    Uint8Array.of(1, 2, 3, 4),
  );
  assert.deepEqual(progress.slice(0, 2), [0, 50]);
  assert.equal(progress.at(-1), 100);
});

test("offline audio downloads use an indeterminate progress state without a length", async () => {
  const response = new Response(Uint8Array.of(1, 2, 3, 4));
  const progress: Array<number | null> = [];
  const prepared = await prepareOfflineResponse(response, (value) =>
    progress.push(value),
  );

  assert.equal(prepared.size, 4);
  assert.equal(progress[0], null);
  assert.equal(progress.at(-1), 100);
});

test("whole-album offline saves every available track with aggregate progress", async () => {
  const track = (id: string, available = true): TrackResponse =>
    ({
      id,
      title: id,
      artist: "Artist",
      artists: ["Artist"],
      album: "Album",
      albumId: "album-1",
      discNumber: 1,
      trackNumber: null,
      durationMs: null,
      mimeType: "audio/mpeg",
      available,
      coverUrl: null,
      metadata: null,
      liked: false,
    }) as TrackResponse;
  const saved = new Set(["already-saved"]);
  const calls: string[] = [];
  const progress: Array<number | null> = [];
  const result = await saveOfflineCollection(
    [
      track("already-saved"),
      track("first-missing"),
      track("unavailable", false),
      track("second-missing"),
    ],
    {
      isSaved: (trackId) => saved.has(trackId),
      save: async (item, onProgress) => {
        calls.push(item.id);
        onProgress?.(50);
        saved.add(item.id);
        onProgress?.(100);
      },
      onProgress: (value) => progress.push(value),
    },
  );

  assert.deepEqual(calls, ["first-missing", "second-missing"]);
  assert.deepEqual(result.savedTrackIds, [
    "already-saved",
    "first-missing",
    "second-missing",
  ]);
  assert.equal(result.completed, 3);
  assert.equal(result.total, 3);
  assert.equal(result.failure, null);
  assert.equal(progress[0], 33);
  assert.equal(progress.at(-1), 100);
});

test("whole-album offline stops at a failed track without dropping saved copies", async () => {
  const tracks = ["one", "two", "three"].map(
    (id) =>
      ({
        id,
        title: id,
        artist: "Artist",
        artists: ["Artist"],
        album: "Album",
        albumId: "album-1",
        discNumber: 1,
        trackNumber: null,
        durationMs: null,
        mimeType: "audio/mpeg",
        available: true,
        coverUrl: null,
        metadata: null,
        liked: false,
      }) as TrackResponse,
  );
  const saved = new Set<string>();
  const result = await saveOfflineCollection(tracks, {
    isSaved: (trackId) => saved.has(trackId),
    save: async (track) => {
      if (track.id === "two") throw new Error("download failed");
      saved.add(track.id);
    },
  });

  assert.deepEqual(result.savedTrackIds, ["one"]);
  assert.equal(result.completed, 1);
  assert.equal(result.total, 3);
  assert.equal(result.failure?.track.id, "two");
});

test("offline artwork keys ignore rotating signed query parameters", () => {
  const first = offlineArtworkCacheRequest(
    scope,
    "http://127.0.0.1:17430/api/covers/cover-1?coverToken=first",
    "https://peridot.example",
  );
  const second = offlineArtworkCacheRequest(
    scope,
    "http://127.0.0.1:17430/api/covers/cover-1?coverToken=second",
    "https://peridot.example",
  );
  const otherUser = offlineArtworkCacheRequest(
    { ...scope, userId: "user-2" },
    "http://127.0.0.1:17430/api/covers/cover-1?coverToken=first",
    "https://peridot.example",
  );

  assert.ok(first);
  assert.ok(second);
  assert.equal(first.url, second.url);
  assert.doesNotMatch(first.url, /coverToken|first|second/);
  assert.notEqual(first.url, otherUser?.url);
});

test("full catalog snapshots preserve every availability state", () => {
  const track = (
    id: string,
    available: boolean,
    albumId: string | null = null,
  ) => ({
    id,
    mediaType: "music" as const,
    title: id,
    artist: "Artist",
    artists: ["Artist"],
    album: albumId ? "Album" : null,
    albumId,
    discNumber: null,
    trackNumber: null,
    durationMs: null,
    publishedAt: null,
    mimeType: "audio/mpeg",
    available,
    coverUrl: null,
    metadata: null,
    liked: false,
  });
  const snapshot: OfflineCatalogSnapshot = {
    version: 2,
    scope,
    tracks: [
      track("z-available", true),
      track("a-unavailable", false),
      track("m-other-album", true, "album-2"),
    ],
    albums: [],
    audiobooks: [],
    podcasts: [],
    artists: [],
    catalogRevision: 3,
    syncedAt: "2026-11-13T10:00:00.000Z",
  };

  assert.deepEqual(
    offlineTracks(snapshot, {
      availability: "all",
      sort: "title",
    }).map((item) => item.id),
    ["a-unavailable", "m-other-album", "z-available"],
  );
  assert.deepEqual(
    offlineTracks(snapshot, { availability: "unavailable" }).map(
      (item) => item.id,
    ),
    ["a-unavailable"],
  );
  assert.deepEqual(
    offlineTracks(snapshot, { albumId: "album-2" }).map((item) => item.id),
    ["m-other-album"],
  );
  assert.deepEqual(
    offlineTracks(snapshot, { query: "Artist Album" }).map((item) => item.id),
    ["m-other-album"],
  );
});

test("offline playback uses only saved copies while disconnected", () => {
  const track = {
    id: "track-1",
    title: "Track",
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
    liked: false,
  };

  assert.equal(
    isTrackPlayable(track, {
      serverLost: true,
      savedTrackIds: new Set(),
    }),
    false,
  );
  assert.equal(
    isTrackPlayable(track, {
      serverLost: true,
      savedTrackIds: new Set(["track-1"]),
    }),
    true,
  );
  assert.equal(
    isTrackPlayable(
      { ...track, available: false },
      {
        serverLost: false,
        savedTrackIds: new Set(["track-1"]),
      },
    ),
    true,
  );
  assert.equal(
    isTrackPlayable(
      { ...track, available: false },
      { serverLost: false, savedTrackIds: new Set() },
    ),
    false,
  );
  assert.equal(
    isTrackPlayable(track, {
      serverLost: false,
      savedTrackIds: new Set(["track-1"]),
      unavailableTrackIds: new Set(["track-1"]),
    }),
    false,
  );
});

test("the fixed player shares saved-track availability across controls", async () => {
  const [player, offlineTracks, layout] = await Promise.all([
    readFile(
      new URL("../app/composables/use-library-player.ts", import.meta.url),
      "utf8",
    ),
    readFile(
      new URL("../app/composables/use-offline-tracks.ts", import.meta.url),
      "utf8",
    ),
    readFile(new URL("../app/layouts/default.vue", import.meta.url), "utf8"),
  ]);

  assert.match(
    offlineTracks,
    /const savedTracks = useState<SavedOfflineTrack\[\]>\(\s*"player-offline-saved-tracks"/,
  );
  assert.match(
    offlineTracks,
    /const pendingTrackIds = useState<string\[\]>\(\s*"player-offline-pending-track-ids"/,
    "Offline pending state is shared by every track control",
  );
  assert.match(
    player,
    /const currentTrackPlayable = computed\(\(\) =>\s+active\.value\s+\? isTrackPlayable\(active\.value,[\s\S]*?savedTrackIds: offlineSavedTrackIdSet\.value/,
  );
  assert.match(layout, /currentTrackPlayable,\s+canGoNext,/);
  assert.doesNotMatch(layout, /useOfflineTracks|serverStatus/);
  assert.match(layout, /:disabled="!currentTrackPlayable"/);
});

test("offline saves use shared task progress without removal toasts", async () => {
  const [table, albumAction, toasts, locale] = await Promise.all([
    readFile(
      new URL("../app/components/TrackTable.vue", import.meta.url),
      "utf8",
    ),
    readFile(
      new URL("../app/composables/use-offline-album.ts", import.meta.url),
      "utf8",
    ),
    readFile(new URL("../app/lib/toasts.ts", import.meta.url), "utf8"),
    readFile(new URL("../i18n/locales/en-US.json", import.meta.url), "utf8"),
  ]);
  const messages = JSON.parse(locale) as Record<string, string>;

  assert.match(
    table,
    /<ProgressCircle[\s\S]*?:value="offlineProgressFor\(item\.track\.id\) \?\? null"/,
  );
  assert.match(
    table,
    /if \(!\(await removeOffline\(track\.id\)\)\) \{[\s\S]*?notifyOfflineTrackRemoveFailed/,
  );
  assert.match(table, /if \(!\(await saveOffline\(track\)\)\)/);
  assert.match(
    table,
    /if \(!\(await saveOffline\(track\)\)\) \{[\s\S]*?notifyOfflineTrackFailed/,
  );
  assert.doesNotMatch(table, /notifyOfflineTrackSaved\(track\.title\)/);
  assert.match(albumAction, /saveAlbum\(currentAlbum\)/);
  assert.doesNotMatch(albumAction, /notifyOfflineAlbumSaved/);
  assert.match(toasts, /notifyDownloadTaskEnded/);
  assert.match(toasts, /notifyOfflineTrackRemoveFailed/);
  assert.doesNotMatch(toasts, /toast\.offlineRemoved/);
  assert.equal(
    messages["toast.downloadTaskCompletedTitle"],
    "Download complete",
  );
  assert.equal(
    messages["toast.downloadTaskCompleted"],
    "{item} is available offline.",
  );
  assert.equal(messages["toast.offlineRemovedTitle"], undefined);
  assert.equal(messages["toast.offlineRemoved"], undefined);
  assert.equal(
    messages["toast.offlineRemoveFailedTitle"],
    "Offline removal failed",
  );
  assert.equal(
    messages["toast.offlineRemoveFailed"],
    "{track} could not be made unavailable offline. {message}",
  );
});

test("offline progress spinners show song and album download details", async () => {
  const [tooltip, table, albumButton, albumMenu, trackMenu, locale] =
    await Promise.all([
      readFile(
        new URL(
          "../app/components/DownloadProgressTooltip.vue",
          import.meta.url,
        ),
        "utf8",
      ),
      readFile(
        new URL("../app/components/TrackTable.vue", import.meta.url),
        "utf8",
      ),
      readFile(
        new URL("../app/components/AlbumOfflineButton.vue", import.meta.url),
        "utf8",
      ),
      readFile(
        new URL("../app/components/AlbumContextMenu.vue", import.meta.url),
        "utf8",
      ),
      readFile(
        new URL("../app/components/TrackContextMenu.vue", import.meta.url),
        "utf8",
      ),
      readFile(new URL("../i18n/locales/en-US.json", import.meta.url), "utf8"),
    ]);
  const messages = JSON.parse(locale) as Record<string, string>;

  assert.match(tooltip, /<TooltipTrigger as-child>/);
  assert.match(tooltip, /<TooltipContent/);
  assert.match(tooltip, /\{\{ title \}\}/);
  assert.match(tooltip, /\{\{ progressLabel \}\}/);
  assert.match(table, /<DownloadProgressTooltip[\s\S]*?type="track"/);
  assert.match(table, /:title="item\.track\.title"/);
  assert.match(albumButton, /<DownloadProgressTooltip[\s\S]*?type="album"/);
  assert.match(albumButton, /:title="album\.title"/);
  assert.match(albumMenu, /<DownloadProgressTooltip[\s\S]*?type="album"/);
  assert.match(trackMenu, /<DownloadProgressTooltip[\s\S]*?type="track"/);
  assert.equal(messages["downloadProgress.track"], "Song");
  assert.equal(messages["downloadProgress.album"], "Album");
  assert.equal(messages["downloadProgress.percent"], "{percent}% downloaded");
});

test("album offline controls use the shared album download task", async () => {
  const [button, action, card, detail, menu, tasks] = await Promise.all([
    readFile(
      new URL("../app/components/AlbumOfflineButton.vue", import.meta.url),
      "utf8",
    ),
    readFile(
      new URL("../app/composables/use-offline-album.ts", import.meta.url),
      "utf8",
    ),
    readFile(
      new URL("../app/components/CatalogCard.vue", import.meta.url),
      "utf8",
    ),
    readFile(
      new URL("../app/pages/albums/[album].vue", import.meta.url),
      "utf8",
    ),
    readFile(
      new URL("../app/components/AlbumContextMenu.vue", import.meta.url),
      "utf8",
    ),
    readFile(
      new URL(
        "../app/composables/use-offline-download-tasks.ts",
        import.meta.url,
      ),
      "utf8",
    ),
  ]);

  assert.match(action, /saveAlbum\(currentAlbum\)/);
  assert.match(action, /removeAlbum\(currentAlbum\.id\)/);
  assert.match(tasks, /loadCollectionTracks\(/);
  assert.match(tasks, /albumId: task\.request\.album\.id/);
  assert.match(button, /<ProgressCircle/);
  assert.match(button, /:aria-pressed="allSaved"/);
  assert.doesNotMatch(button, /showLabel|visibleLabel|<span/);
  assert.doesNotMatch(card, /<AlbumOfflineButton/);
  assert.doesNotMatch(
    detail,
    /<AlbumOfflineButton/,
    "The album detail header does not expose a separate offline action",
  );
  assert.match(menu, /@select="toggleAlbumOffline"/);
});

test("offline playback prefers saved audio and recovers stream failures", async () => {
  const [player, persister, table] = await Promise.all([
    readFile(
      new URL("../app/composables/use-library-player.ts", import.meta.url),
      "utf8",
    ),
    readFile(new URL("../app/lib/query-persister.ts", import.meta.url), "utf8"),
    readFile(
      new URL("../app/components/TrackTable.vue", import.meta.url),
      "utf8",
    ),
  ]);

  assert.match(player, /isPeridotNetworkError\(reason\)/);
  assert.match(player, /offlineAudioBlob\(/);
  assert.match(player, /serverStatus\.value === "lost"[\s\S]*loadOfflineTrack/);
  assert.match(
    player,
    /const handleError = \(\) => \{[\s\S]*loadOfflineTrack\(failedTrackId, failedAttempt\)/,
  );
  assert.match(player, /addEventListener\("error", handleError\)/);
  assert.match(player, /URL\.revokeObjectURL\(offlineObjectUrl\)/);
  assert.match(persister, /experimental_createQueryPersister/);
  assert.match(persister, /maxAge: Number\.POSITIVE_INFINITY/);
  assert.match(persister, /createStore\(QUERY_DATABASE, QUERY_STORE\)/);
  assert.match(persister, /QUERY_DATABASE = "peridot-web-query"/);
  assert.match(player, /offlineAudioBlob\(/);
  assert.notEqual(OFFLINE_DATABASE, "peridot-web-query");
  assert.match(persister, /query\.meta\?\.persist !== false/);
  assert.match(table, /icons\.cloudDownload/);
  assert.match(table, /icons\.cloudCheck/);
  assert.match(table, /saveTrackForOffline|saveOffline/);
  assert.match(
    table,
    /:title="offlineActionLabel\(item\.track\)"/,
    "The offline save control has a native title tooltip",
  );
});
