import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("track rows expose a Reka context menu with playback, favorites, offline storage, downloads, and navigation", async () => {
  const [menu, trackTable, library, album, artist] = await Promise.all([
    readFile(
      new URL("../app/components/TrackContextMenu.vue", import.meta.url),
      "utf8",
    ),
    readFile(
      new URL("../app/components/TrackTable.vue", import.meta.url),
      "utf8",
    ),
    readFile(
      new URL("../app/components/LibraryScreen.vue", import.meta.url),
      "utf8",
    ),
    readFile(
      new URL("../app/pages/albums/[album].vue", import.meta.url),
      "utf8",
    ),
    readFile(
      new URL("../app/pages/artists/[artist].vue", import.meta.url),
      "utf8",
    ),
  ]);

  assert.match(
    menu,
    /@peridot\/ui\/components\/ui\/context-menu/,
    "Context menu primitives come from the shared shadcn-vue layer",
  );
  assert.match(menu, /<ContextMenuTrigger as-child>/);
  assert.match(
    menu,
    /<ContextMenuItem :disabled="!playable" @select="emit\('play'\)">/,
  );
  assert.match(menu, /useLikes\(\)/);
  assert.match(menu, /toggleLike\(\{ kind: 'track', trackId: track\.id \}\)/);
  assert.match(menu, /useOfflineTracks\(\)/);
  assert.match(menu, /saveOffline\(props\.track\)/);
  assert.match(menu, /removeOffline\(props\.track\.id\)/);
  assert.match(menu, /notifyOfflineTrackSaved\(props\.track\.title\)/);
  assert.match(menu, /context\.makeAvailableOffline/);
  assert.match(menu, /context\.removeOfflineCopy/);
  assert.match(menu, /downloadTrack\(props\.track\.id\)/);
  assert.match(menu, /context\.goToAlbum/);
  assert.match(menu, /<Icon :icon="icons\.album" aria-hidden="true" \/>/);
  assert.match(menu, /context\.goToArtist/);
  assert.match(menu, /context\.goToArtists/);
  assert.match(menu, /v-for="artist in artists"/);
  assert.match(menu, /v-else-if="music && artists\.length > 1"/);
  assert.match(menu, /context\.matchedWith/);
  assert.match(menu, /context\.metadataCorrect/);
  assert.match(menu, /context\.metadataRestore/);
  assert.match(menu, /listMetadataCandidates/);
  assert.match(menu, /applyTrackMetadata/);
  assert.match(menu, /revertTrackMetadata/);
  assert.match(menu, /context\.metadataSearchLabel/);
  assert.match(menu, /externalTrackId/);
  assert.match(menu, /candidate\.details/);
  assert.match(menu, /genres: candidate\.genres/);
  assert.match(menu, /context\.metadataGenres/);
  assert.match(trackTable, /item\.data\.genres\.join\(" · "\)/);

  const offlineActionIndex = menu.indexOf('@select="toggleOffline"');
  const downloadActionIndex = menu.indexOf('@select="download"');
  assert.ok(
    offlineActionIndex > -1,
    "The track context menu exposes an offline-storage action",
  );
  assert.ok(
    downloadActionIndex > offlineActionIndex,
    "Make available offline appears above the browser download action",
  );

  assert.match(trackTable, /<TrackContextMenu/);
  assert.match(trackTable, /@play="playFromList\(item\.data, true\)"/);
  assert.match(
    trackTable,
    /playCollection\(\s*props\.tracks\.filter\(\(candidate\) => !isUnavailable\(candidate\)\),\s*track\.id,?\s*\)/,
    "Playing a row queues the complete playable displayed track list",
  );

  for (const [name, source, variant] of [
    ["library", library, "library"],
    ["album", album, "album"],
    ["artist", artist, "artist"],
  ] as const) {
    assert.match(
      source,
      new RegExp(`<TrackTable[^>]*variant="${variant}"`),
      `${name} uses the shared track table`,
    );
  }
});

test("album and artist cards expose collection-aware context menus", async () => {
  const [albumMenu, artistMenu, albumCard, artistCard] = await Promise.all([
    readFile(
      new URL("../app/components/AlbumContextMenu.vue", import.meta.url),
      "utf8",
    ),
    readFile(
      new URL("../app/components/ArtistContextMenu.vue", import.meta.url),
      "utf8",
    ),
    readFile(
      new URL("../app/components/AlbumCard.vue", import.meta.url),
      "utf8",
    ),
    readFile(
      new URL("../app/components/ArtistCard.vue", import.meta.url),
      "utf8",
    ),
  ]);

  for (const menu of [albumMenu, artistMenu]) {
    assert.match(menu, /@peridot\/ui\/components\/ui\/context-menu/);
    assert.match(menu, /<ContextMenuTrigger as-child>/);
    assert.match(menu, /useLikes\(\)/);
    assert.match(menu, /useLibraryPlayer\(\)/);
    assert.match(menu, /loadCollectionTracks\(/);
  }

  assert.match(albumMenu, /albumId: props\.album\.id/);
  assert.match(albumMenu, /context\.likeAlbum/);
  assert.match(albumMenu, /context\.unlikeAlbum/);
  assert.match(albumMenu, /albumRoute\(album\)/);
  assert.match(albumMenu, /context\.openAlbum/);
  assert.match(
    albumMenu,
    /<NuxtLink :to="albumRoute\(album\)">\s+<Icon :icon="icons\.album"/,
  );
  assert.match(albumMenu, /useOfflineAlbum\(\(\) => props\.album\)/);
  assert.match(albumMenu, /@select="toggleAlbumOffline"/);
  assert.match(albumMenu, /t\("albumOffline\.remove"\)/);

  assert.match(artistMenu, /artistId: props\.artist\.id/);
  assert.match(artistMenu, /context\.likeArtist/);
  assert.match(artistMenu, /context\.unlikeArtist/);
  assert.match(artistMenu, /artistRoute\(artist\)/);
  assert.match(artistMenu, /context\.openArtist/);
  assert.match(artistMenu, /listArtistMetadataCandidates\(/);
  assert.match(artistMenu, /applyArtistMetadata\(/);
  assert.match(artistMenu, /revertArtistMetadata\(/);
  assert.match(artistMenu, /context\.artistMetadataMatch/);
  assert.match(artistMenu, /context\.artistPortraitAvailable/);

  assert.match(
    albumCard,
    /<AlbumContextMenu[\s\S]*<article[\s\S]*<NuxtLink/,
    "The entire album card is the context-menu trigger",
  );
  assert.doesNotMatch(
    albumCard,
    /<AlbumOfflineButton[\s\S]*:album="album"[\s\S]*compact[\s\S]*overlay/,
    "Album cards do not duplicate the album-header offline action",
  );
  assert.match(
    artistCard,
    /<ArtistContextMenu[\s\S]*<article[\s\S]*<NuxtLink/,
    "The entire artist card is the context-menu trigger",
  );
});
