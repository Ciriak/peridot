import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";
import { QueryClient, QueryObserver } from "@tanstack/vue-query";
import {
  OFFLINE_AUDIO_CACHE,
  OFFLINE_DATABASE,
  offlineAudioCacheRequest,
  offlineTrackStorageKey,
} from "../app/lib/offline-audio.ts";
import { queryKeys } from "../app/lib/query-keys.ts";
import {
  blockingQueryLoading,
  visibleQueryError,
} from "../app/lib/query-view-state.ts";

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
  const [config, indexIcon, maskableIcon] = await Promise.all([
    readFile(new URL("../nuxt.config.ts", import.meta.url), "utf8"),
    access(new URL("../public/pwa-192x192.png", import.meta.url)),
    access(new URL("../public/pwa-maskable-512x512.png", import.meta.url)),
  ]);

  assert.match(config, /ssr: false/);
  assert.match(config, /modules: \["@nuxtjs\/i18n", "@vite-pwa\/nuxt"\]/);
  assert.match(config, /registerType: "autoUpdate"/);
  assert.match(config, /devOptions: \{\s*enabled: true,?\s*\}/);
  assert.match(config, /navigateFallback: "\/"/);
  assert.match(config, /additionalManifestEntries/);
  assert.match(config, /peridot-artwork-v1/);
  assert.match(config, /rel: "manifest", href: "\/manifest.webmanifest"/);
  assert.doesNotMatch(config, /runtimeCaching:[\s\S]*\/api\/tracks/);
  assert.equal(indexIcon, undefined);
  assert.equal(maskableIcon, undefined);
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
  assert.equal(OFFLINE_DATABASE, "peridot-web-offline");
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
  const cached = { tracks: [], albums: [], artists: [] };
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
});

test("offline playback falls back only from a typed network failure", async () => {
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
    /:title="[\s\S]*?trackTable\.removeOffline[\s\S]*?trackTable\.saveOffline/,
    "The offline save control has a native title tooltip",
  );
});
