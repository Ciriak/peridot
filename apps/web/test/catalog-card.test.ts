import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import type {
  AlbumSummaryResponse,
  PlaylistSummaryResponse,
  MediaResponse,
} from "@peridot/contracts";
import {
  albumCatalogCard,
  catalogCardKey,
  playlistCatalogCard,
  mediaCatalogCard,
} from "../app/lib/catalog-cards.ts";

const album: AlbumSummaryResponse = {
  id: "album-1",
  title: "Night Sessions",
  artist: "Elliot Lake",
  artists: ["Elliot Lake"],
  sourceKinds: ["path"],
  coverUrl: null,
  trackCount: 2,
  durationMs: null,
  releaseYear: null,
  available: true,
  liked: false,
};
const track: MediaResponse = {
  id: "track-1",
  mediaType: "music",
  mediaTypeOrigin: "embedded",
  title: "Opening",
  artist: "Elliot Lake",
  artists: ["Elliot Lake"],
  album: "Night Sessions",
  albumId: "album-1",
  genres: [],
  discNumber: 1,
  trackNumber: 1,
  durationMs: 180_000,
  publishedAt: null,
  mimeType: "audio/mpeg",
  available: true,
  coverUrl: null,
  metadata: null,
  liked: false,
};
const playlist: PlaylistSummaryResponse = {
  id: "playlist-1",
  kind: "manual",
  name: "Night Drive",
  trackCount: 2,
  availableTrackCount: 2,
  durationMs: null,
  coverUrls: [],
  liked: false,
  containsTrack: false,
  createdAt: "2026-11-20T00:00:00.000Z",
  updatedAt: "2026-11-20T00:00:00.000Z",
};

test("catalog card items preserve their discriminated payload and key", () => {
  const albumItem = albumCatalogCard(album);
  const trackItem = mediaCatalogCard(track);
  const playlistItem = playlistCatalogCard(playlist);

  assert.equal(catalogCardKey(albumItem), "album:album-1");
  assert.equal(catalogCardKey(trackItem), "media:track-1");
  assert.equal(catalogCardKey(playlistItem), "playlist:playlist-1");
  assert.equal(albumItem.kind, "album");
  assert.equal(trackItem.kind, "media");
  assert.equal(playlistItem.kind, "playlist");
});

test("existing card lists render the one shared catalog card", async () => {
  const [
    home,
    albums,
    artist,
    playlists,
    search,
    catalogCard,
    quickPick,
    quickPickContent,
  ] = await Promise.all([
    readFile(new URL("../app/pages/index.vue", import.meta.url), "utf8"),
    readFile(new URL("../app/pages/albums/index.vue", import.meta.url), "utf8"),
    readFile(
      new URL("../app/pages/artists/[artist].vue", import.meta.url),
      "utf8",
    ),
    readFile(
      new URL("../app/pages/playlists/index.vue", import.meta.url),
      "utf8",
    ),
    readFile(new URL("../app/pages/search.vue", import.meta.url), "utf8"),
    readFile(
      new URL("../app/components/CatalogCard.vue", import.meta.url),
      "utf8",
    ),
    readFile(
      new URL("../app/components/QuickPickTile.vue", import.meta.url),
      "utf8",
    ),
    readFile(
      new URL("../app/components/QuickPickTileContent.vue", import.meta.url),
      "utf8",
    ),
  ]);

  for (const source of [home, albums, artist, playlists, search]) {
    assert.match(source, /CatalogCard/);
    assert.doesNotMatch(source, /components\/(?:AlbumCard|PlaylistCard)\.vue/);
  }
  assert.match(home, /playlistCatalogCard/);
  assert.match(home, /items\.push\(\.\.\.visibleQuickPickItems\.value\)/);
  assert.equal(home.match(/<CatalogCard(?:\s|>)/g)?.length, 1);
  assert.match(albums, /albumCatalogCard\(item\)/);
  assert.match(artist, /albumCatalogCard\(item\)/);
  assert.match(playlists, /playlistCatalogCard\(item\)/);
  assert.match(search, /albumCatalogCard\(album\)/);
  assert.match(catalogCard, /<article/);
  assert.doesNotMatch(quickPick, /layout\?: "tile" \| "card"/);
  assert.doesNotMatch(quickPickContent, /layout|rounded-lg border bg-card/);
});

test("the shared card adapts menus, playback, and likes by item type", async () => {
  const [card, playlistMenu] = await Promise.all([
    readFile(
      new URL("../app/components/CatalogCard.vue", import.meta.url),
      "utf8",
    ),
    readFile(
      new URL("../app/components/PlaylistContextMenu.vue", import.meta.url),
      "utf8",
    ),
  ]);

  assert.match(
    card,
    /if \(album\.value\) return AlbumContextMenu;[\s\S]*if \(track\.value\) return TrackContextMenu;[\s\S]*return PlaylistContextMenu;/,
  );
  assert.match(
    card,
    /<component\s+:is="menuComponent"\s+v-bind="menuBindings"/,
  );
  assert.match(card, /toggleCollectionPlayback\(\s*albumTarget\.value/);
  assert.match(card, /if \(trackPlayable\.value\) \{\s+play\(track\.value\);/);
  assert.match(card, /toggleCollectionPlayback\(\s*playlistTarget\.value/);
  assert.match(
    card,
    /if \(album\.value\) \{[\s\S]*kind: "album"[\s\S]*if \(track\.value\?\.mediaType === "music"\) \{[\s\S]*kind: "media"[\s\S]*return null;/,
  );
  assert.equal(card.match(/<LikeButton/g)?.length, 2);
  assert.match(card, /layout\?: "card" \| "row"/);
  assert.match(card, /layout === 'row'/);
  assert.match(card, /<SearchResultTag/);
  assert.match(card, /:source-kinds="searchLibrarySourceKinds"/);
  assert.ok(
    card.indexOf('<SearchResultTag class="shrink-0" :type="resultType" />') <
      card.indexOf('<div class="ml-auto flex shrink-0 items-center gap-2">'),
    "The category tag sits beside the row title rather than in the trailing actions",
  );
  assert.match(
    card,
    /v-if="album \|\| track"[\s\S]*?@click\.prevent\.stop="toggleCardPlayback"/,
    "Album playback is overlaid on the row cover instead of using a trailing control",
  );
  assert.match(
    card,
    /<TooltipProvider v-if="playlist" :delay-duration="150">/,
    "Only playlists retain the standalone row playback control",
  );
  assert.match(card, /v-if="likeTarget"/);
  assert.doesNotMatch(
    card,
    /<Badge\b/,
    "Track and album cards rely on their shared disabled control instead of a status tag",
  );
  assert.match(card, /:class="!playable && 'opacity-60'"/);
  assert.match(
    card,
    /!controlEnabled\s+\? icons\.cloudOff\s+:\s+playbackActive\s+\? icons\.pause\s+:\s+icons\.play/,
  );
  assert.match(
    card,
    /if \(trackPlayable\.value\) \{\s+play\(track\.value\);\s+return;\s+\}\s+retryUnavailableTrack\(track\.value\);/,
    "Unavailable card taps retry through the shared player",
  );
  assert.match(playlistMenu, /v-if="!automatic"/);
  assert.match(playlistMenu, /context\.playPlaylist/);
  assert.match(playlistMenu, /context\.renamePlaylist/);
  assert.match(playlistMenu, /context\.deletePlaylist/);
  assert.match(playlistMenu, /context\.openPlaylist/);
});
