import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import type { TrackResponse } from "@peridot/contracts";
import { trackAlbumRoute } from "../app/lib/library.ts";
import {
  discoverJellyfinLibraries,
  listAudiobooks,
  listPodcastEpisodes,
  listPodcasts,
  updateMediaCollectionType,
  updateSource,
  updateTrackMediaType,
} from "../app/lib/peridot-client.ts";

test("audiobook and podcast navigation, pages, and source settings are wired", async () => {
  const [
    layout,
    audiobookPage,
    audiobookDetail,
    podcastPage,
    podcastDetail,
    card,
    detail,
    sources,
    trackMenu,
  ] = await Promise.all([
    readFile(new URL("../app/layouts/default.vue", import.meta.url), "utf8"),
    readFile(
      new URL("../app/pages/audiobooks/index.vue", import.meta.url),
      "utf8",
    ),
    readFile(
      new URL("../app/pages/audiobooks/[book].vue", import.meta.url),
      "utf8",
    ),
    readFile(
      new URL("../app/pages/podcasts/index.vue", import.meta.url),
      "utf8",
    ),
    readFile(
      new URL("../app/pages/podcasts/[show].vue", import.meta.url),
      "utf8",
    ),
    readFile(
      new URL("../app/components/MediaCollectionCard.vue", import.meta.url),
      "utf8",
    ),
    readFile(
      new URL("../app/components/MediaCollectionDetail.vue", import.meta.url),
      "utf8",
    ),
    readFile(
      new URL("../app/pages/settings/sources.vue", import.meta.url),
      "utf8",
    ),
    readFile(
      new URL("../app/components/TrackContextMenu.vue", import.meta.url),
      "utf8",
    ),
  ]);

  assert.match(layout, /labelKey: "navigation\.audiobooks"/);
  assert.match(layout, /labelKey: "navigation\.podcasts"/);
  assert.match(layout, /icon: icons\.book/);
  assert.match(layout, /icon: icons\.podcast/);
  assert.match(audiobookPage, /useCatalogAudiobookQuery/);
  assert.match(podcastPage, /useCatalogPodcastQuery/);
  assert.match(audiobookDetail, /name: "audiobook-detail"/);
  assert.match(podcastDetail, /name: "podcast-detail"/);
  assert.match(card, /MediaCollectionOfflineButton/);
  assert.match(card, /kind: "audiobook"/);
  assert.match(card, /kind: "podcast"/);
  assert.match(detail, /page\.audiobook\.chapters/);
  assert.match(detail, /page\.podcast\.episodes/);
  assert.match(detail, /allow-track-like="false"/);
  assert.match(sources, /discoverJellyfinLibraries/);
  assert.match(sources, /newClassificationMode/);
  assert.match(sources, /changeClassification/);
  assert.match(sources, /classification\.autoHelp/);
  assert.match(detail, /changeCollectionMediaType/);
  assert.match(detail, /v-if="admin"/);
  assert.match(trackMenu, /changeTrackMediaType/);
  assert.match(trackMenu, /restoreDetectedMediaType/);
  assert.match(trackMenu, /v-if="admin"/);
});

test("track collection routes follow the normalized media type", () => {
  const base: TrackResponse = {
    id: "track-id",
    mediaType: "music",
    mediaTypeOrigin: "fallback",
    title: "Part One",
    artist: "Creator",
    artists: ["Creator"],
    album: "Collection",
    genres: [],
    albumId: "collection-id",
    discNumber: 1,
    trackNumber: 1,
    durationMs: 1000,
    publishedAt: null,
    mimeType: "audio/mpeg",
    available: true,
    coverUrl: null,
    metadata: null,
    liked: false,
  };

  assert.equal(
    (trackAlbumRoute(base) as { name: string }).name,
    "album-detail",
  );
  assert.equal(
    (
      trackAlbumRoute({
        ...base,
        mediaType: "audiobook",
        albumId: "audiobook-id",
      }) as { name: string }
    ).name,
    "audiobook-detail",
  );
  assert.equal(
    (
      trackAlbumRoute({
        ...base,
        mediaType: "podcast",
        albumId: "podcast-id",
      }) as { name: string }
    ).name,
    "podcast-detail",
  );
});

test("category and source client calls use authenticated typed endpoints", async (context) => {
  const originalFetch = globalThis.fetch;
  context.after(() => {
    globalThis.fetch = originalFetch;
  });
  const requests: Array<{ url: string; method: string; body?: string }> = [];
  globalThis.fetch = async (input, init) => {
    requests.push({
      url: String(input),
      method: init?.method ?? "GET",
      ...(typeof init?.body === "string" ? { body: init.body } : {}),
    });
    return Response.json({
      items: [],
      nextCursor: null,
      catalogRevision: 1,
    });
  };

  await listAudiobooks("http://peridot.local:17430", "token", {
    query: "book",
  });
  await listPodcasts("http://peridot.local:17430", "token", {
    query: "show",
  });
  await listPodcastEpisodes(
    "http://peridot.local:17430",
    "token",
    "podcast-id",
  );
  await updateSource("http://peridot.local:17430", "token", "source-id", {
    classificationMode: "fixed",
    fixedMediaType: "audiobook",
  });
  await updateTrackMediaType(
    "http://peridot.local:17430",
    "token",
    "track-id",
    "podcast",
  );
  await updateMediaCollectionType(
    "http://peridot.local:17430",
    "token",
    "collection-id",
    "audiobook",
  );
  await discoverJellyfinLibraries("http://peridot.local:17430", "token", {
    url: "http://jellyfin.local:8096",
    apiKey: "secret",
  });

  assert.ok(
    requests.some(
      (request) =>
        request.url.includes("/api/audiobooks?") && request.method === "GET",
    ),
  );
  assert.ok(
    requests.some((request) =>
      request.url.includes("/api/podcasts/podcast-id/episodes"),
    ),
  );
  assert.ok(
    requests.some(
      (request) =>
        request.url.endsWith("/api/admin/sources/source-id") &&
        request.method === "PATCH" &&
        request.body ===
          JSON.stringify({
            classificationMode: "fixed",
            fixedMediaType: "audiobook",
          }),
    ),
  );
  assert.ok(
    requests.some(
      (request) =>
        request.url.endsWith("/api/admin/tracks/track-id/media-type") &&
        request.method === "PUT" &&
        request.body === JSON.stringify({ mediaType: "podcast" }),
    ),
  );
  assert.ok(
    requests.some(
      (request) =>
        request.url.endsWith(
          "/api/admin/media-collections/collection-id/media-type",
        ) &&
        request.method === "PUT" &&
        request.body === JSON.stringify({ mediaType: "audiobook" }),
    ),
  );
  assert.ok(
    requests.some(
      (request) =>
        request.url.endsWith("/api/admin/integrations/jellyfin/libraries") &&
        request.method === "POST",
    ),
  );
});
