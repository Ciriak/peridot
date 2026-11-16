import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import type {
  AlbumSummaryResponse,
  ArtistSummaryResponse,
  AudiobookSummaryResponse,
  PodcastSummaryResponse,
  TrackResponse,
} from "@peridot/contracts";
import {
  collectOfflineCatalog,
  OFFLINE_CATALOG_CARD_PAGE_SIZE,
  OFFLINE_CATALOG_MAX_TRACKS,
  OFFLINE_CATALOG_REFRESH_INTERVAL_MS,
  OFFLINE_CATALOG_SYNC_STATE_VERSION,
  OFFLINE_CATALOG_TRACK_PAGE_SIZE,
  shouldSyncOfflineCatalog,
  type OfflineCatalogClient,
  type OfflineCatalogSyncState,
} from "../app/lib/offline-catalog.ts";
import { removesOfflineCatalogSnapshot } from "../app/lib/catalog-revision-policy.ts";
import type { PeridotQueryScope } from "../app/lib/query-keys.ts";

const scope: PeridotQueryScope = {
  serverAddress: "http://127.0.0.1:17430",
  userId: "user-1",
};

function emptyClient(overrides: Partial<OfflineCatalogClient> = {}) {
  return {
    listTracks: async () => ({
      items: [],
      nextCursor: null,
      catalogRevision: 1,
    }),
    listAlbums: async () => ({
      items: [],
      nextCursor: null,
      catalogRevision: 1,
    }),
    listArtists: async () => ({
      items: [],
      nextCursor: null,
      catalogRevision: 1,
    }),
    listAudiobooks: async () => ({
      items: [],
      nextCursor: null,
      catalogRevision: 1,
    }),
    listPodcasts: async () => ({
      items: [],
      nextCursor: null,
      catalogRevision: 1,
    }),
    ...overrides,
  } satisfies OfflineCatalogClient;
}

test("offline catalog uses valid track and card page sizes", async () => {
  const limits: number[] = [];
  const catalog = await collectOfflineCatalog(
    scope,
    "token",
    emptyClient({
      listTracks: async (_address, _token, options) => {
        limits.push(options.limit ?? 0);
        return {
          items: [{ id: "track-1" } as TrackResponse],
          nextCursor: null,
          catalogRevision: 2,
        };
      },
      listAlbums: async (_address, _token, options) => {
        limits.push(options.limit ?? 0);
        return {
          items: [{ id: "album-1" } as AlbumSummaryResponse],
          nextCursor: null,
          catalogRevision: 2,
        };
      },
      listArtists: async (_address, _token, options) => {
        limits.push(options.limit ?? 0);
        return {
          items: [{ id: "artist-1" } as ArtistSummaryResponse],
          nextCursor: null,
          catalogRevision: 2,
        };
      },
      listAudiobooks: async (_address, _token, options) => {
        limits.push(options.limit ?? 0);
        return {
          items: [{ id: "book-1" } as AudiobookSummaryResponse],
          nextCursor: null,
          catalogRevision: 2,
        };
      },
      listPodcasts: async (_address, _token, options) => {
        limits.push(options.limit ?? 0);
        return {
          items: [{ id: "podcast-1" } as PodcastSummaryResponse],
          nextCursor: null,
          catalogRevision: 2,
        };
      },
    }),
  );

  assert.equal(catalog.status, "synced");
  assert.deepEqual(limits, [
    OFFLINE_CATALOG_TRACK_PAGE_SIZE,
    OFFLINE_CATALOG_CARD_PAGE_SIZE,
    OFFLINE_CATALOG_CARD_PAGE_SIZE,
    OFFLINE_CATALOG_CARD_PAGE_SIZE,
    OFFLINE_CATALOG_CARD_PAGE_SIZE,
  ]);
});

test("oversized track catalogs stop before requesting card collections", async () => {
  let trackPages = 0;
  let cardRequests = 0;
  const page = Array.from(
    { length: OFFLINE_CATALOG_TRACK_PAGE_SIZE },
    (_, index) => ({
      id: `track-${index}`,
    }),
  ) as TrackResponse[];
  const catalog = await collectOfflineCatalog(
    scope,
    "token",
    emptyClient({
      listTracks: async () => {
        trackPages += 1;
        return {
          items: page,
          nextCursor: `page-${trackPages + 1}`,
          catalogRevision: trackPages,
        };
      },
      listAlbums: async () => {
        cardRequests += 1;
        throw new Error("card request should not run");
      },
      listArtists: async () => {
        cardRequests += 1;
        throw new Error("card request should not run");
      },
      listAudiobooks: async () => {
        cardRequests += 1;
        throw new Error("card request should not run");
      },
      listPodcasts: async () => {
        cardRequests += 1;
        throw new Error("card request should not run");
      },
    }),
  );

  assert.equal(catalog.status, "too-large");
  assert.equal(catalog.trackCount, OFFLINE_CATALOG_MAX_TRACKS + 200);
  assert.equal(
    trackPages,
    Math.floor(OFFLINE_CATALOG_MAX_TRACKS / OFFLINE_CATALOG_TRACK_PAGE_SIZE) +
      1,
  );
  assert.equal(cardRequests, 0);
});

test("combined offline snapshots stay within the memory safeguard", async () => {
  let trackPages = 0;
  const trackPage = Array.from(
    { length: OFFLINE_CATALOG_TRACK_PAGE_SIZE },
    (_, index) => ({ id: `track-${index}` }),
  ) as TrackResponse[];
  const cards = <T>(prefix: string) =>
    Array.from({ length: 4_000 }, (_, index) => ({
      id: `${prefix}-${index}`,
    })) as T[];
  const catalog = await collectOfflineCatalog(
    scope,
    "token",
    emptyClient({
      listTracks: async () => {
        trackPages += 1;
        return {
          items: trackPage,
          nextCursor:
            trackPages <
            Math.floor(
              OFFLINE_CATALOG_MAX_TRACKS / OFFLINE_CATALOG_TRACK_PAGE_SIZE,
            )
              ? `track-page-${trackPages + 1}`
              : null,
          catalogRevision: 1,
        };
      },
      listAlbums: async () => ({
        items: cards<AlbumSummaryResponse>("album"),
        nextCursor: null,
        catalogRevision: 1,
      }),
      listArtists: async () => ({
        items: cards<ArtistSummaryResponse>("artist"),
        nextCursor: null,
        catalogRevision: 1,
      }),
      listAudiobooks: async () => ({
        items: cards<AudiobookSummaryResponse>("book"),
        nextCursor: null,
        catalogRevision: 1,
      }),
      listPodcasts: async () => ({
        items: cards<PodcastSummaryResponse>("podcast"),
        nextCursor: null,
        catalogRevision: 1,
      }),
    }),
  );

  assert.equal(catalog.status, "too-large");
  assert.equal(catalog.itemCount, 26_000);
});

test("catalog synchronization is gated for one week", () => {
  const now = new Date("2026-11-16T12:00:00.000Z");
  const recent: OfflineCatalogSyncState = {
    version: OFFLINE_CATALOG_SYNC_STATE_VERSION,
    scope,
    lastAttemptAt: now.toISOString(),
    lastSuccessAt: new Date(
      now.getTime() - OFFLINE_CATALOG_REFRESH_INTERVAL_MS + 1,
    ).toISOString(),
    tooLargeUntil: null,
  };
  assert.equal(shouldSyncOfflineCatalog(recent, now), false);
  assert.equal(
    shouldSyncOfflineCatalog(
      {
        ...recent,
        lastSuccessAt: new Date(
          now.getTime() - OFFLINE_CATALOG_REFRESH_INTERVAL_MS,
        ).toISOString(),
      },
      now,
    ),
    true,
  );
  assert.equal(
    shouldSyncOfflineCatalog(
      {
        ...recent,
        lastSuccessAt: null,
        tooLargeUntil: new Date(now.getTime() + 1).toISOString(),
      },
      now,
    ),
    false,
  );
});

test("catalog revision handling is coalesced and queue hydration is incremental", async () => {
  const [catalog, plugin, player, notifications, sources] = await Promise.all([
    readFile(
      new URL("../app/composables/use-catalog-query.ts", import.meta.url),
      "utf8",
    ),
    readFile(
      new URL("../app/plugins/offline-catalog.client.ts", import.meta.url),
      "utf8",
    ),
    readFile(
      new URL("../app/composables/use-library-player.ts", import.meta.url),
      "utf8",
    ),
    readFile(
      new URL("../app/components/AppNotifications.vue", import.meta.url),
      "utf8",
    ),
    readFile(
      new URL("../app/pages/settings/sources.vue", import.meta.url),
      "utf8",
    ),
  ]);

  assert.match(catalog, /CATALOG_INVALIDATION_THROTTLE_MS = 10_000/);
  assert.match(catalog, /applyRevision[\s\S]*?scheduleInvalidation\(\)/);
  assert.match(plugin, /OFFLINE_CATALOG_QUIET_INTERVAL_MS/);
  assert.match(plugin, /shouldSyncOfflineCatalog/);
  assert.doesNotMatch(plugin, /warmOfflineArtwork/);
  assert.match(
    player,
    /watch\(catalogRevision, \(\) => void hydrateQueueTracks\(\)\)/,
  );
  assert.doesNotMatch(player, /hydrateQueueTracks\(true\)/);
  assert.equal(removesOfflineCatalogSnapshot("source-removal"), true);
  assert.equal(removesOfflineCatalogSnapshot("reset"), true);
  assert.equal(removesOfflineCatalogSnapshot("scan"), false);
  assert.match(
    notifications,
    /applyRevision\(message\.revision, message\.reason\)/,
  );
  assert.match(notifications, /void resetOfflineCatalog\(\)/);
  assert.match(sources, /resetOfflineCatalog\(\)/);
  assert.match(sources, /invalidateCatalog\(\)/);
});
