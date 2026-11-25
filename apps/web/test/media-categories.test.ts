import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import type { MediaResponse } from "@peridot/contracts";
import { trackAlbumRoute } from "../app/lib/library.ts";
import {
  discoverIntegrationSources,
  listAudiobooks,
  listPodcastEpisodes,
  listPodcasts,
} from "../app/lib/peridot-client.ts";

test("automatic media categories remain wired without classification controls", async () => {
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
      new URL(
        "../app/pages/settings/connectors/library-sources.vue",
        import.meta.url,
      ),
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
  assert.match(audiobookPage, /useVirtualAudiobooks/);
  assert.match(audiobookPage, /<AlbumCardPlaceholder/);
  assert.match(audiobookPage, /<CatalogUpdateBadge \/>/);
  assert.match(audiobookPage, /paging-mode="window"/);
  assert.match(podcastPage, /useVirtualPodcasts/);
  assert.match(podcastPage, /<AlbumCardPlaceholder/);
  assert.match(podcastPage, /<CatalogUpdateBadge \/>/);
  assert.match(podcastPage, /paging-mode="window"/);
  assert.match(audiobookDetail, /name: "audiobook-detail"/);
  assert.match(podcastDetail, /name: "podcast-detail"/);
  assert.match(card, /MediaCollectionOfflineButton/);
  assert.match(card, /kind: "audiobook"/);
  assert.match(card, /kind: "podcast"/);
  assert.match(detail, /page\.audiobook\.chapters/);
  assert.match(detail, /page\.podcast\.episodes/);
  assert.match(detail, /allow-track-like="false"/);
  assert.match(sources, /discoverIntegrationSources/);
  assert.doesNotMatch(
    sources,
    /newClassificationMode|changeClassification|classification\.autoHelp/,
  );
  assert.doesNotMatch(
    detail,
    /changeCollectionMediaType|restoreCollectionMediaType/,
  );
  assert.doesNotMatch(
    trackMenu,
    /changeTrackMediaType|restoreDetectedMediaType|context\.mediaType/,
  );
});

test("track collection routes follow the normalized media type", () => {
  const base: MediaResponse = {
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

  assert.equal(trackAlbumRoute(base), "/albums/Collection?id=collection-id");
  assert.equal(
    trackAlbumRoute({
      ...base,
      mediaType: "audiobook",
      albumId: "audiobook-id",
    }),
    "/audiobooks/Collection?author=Creator&id=audiobook-id",
  );
  assert.equal(
    trackAlbumRoute({
      ...base,
      mediaType: "podcast",
      albumId: "podcast-id",
    }),
    "/podcasts/Collection?publisher=Creator&id=podcast-id",
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
  await discoverIntegrationSources(
    "http://peridot.local:17430",
    "token",
    "jellyfin",
    {
      configuration: {
        url: "http://jellyfin.local:8096",
      },
      credentials: { apiKey: "secret" },
    },
  );

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
        request.url.endsWith(
          "/api/admin/source-integrations/jellyfin/discover",
        ) && request.method === "POST",
    ),
  );
});
