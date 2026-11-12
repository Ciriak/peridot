import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("track rows expose a Reka context menu with playback, favorites, downloads, and navigation", async () => {
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
  assert.match(menu, /@select="emit\('play'\)"/);
  assert.match(menu, /useLikes\(\)/);
  assert.match(menu, /toggleLike\(\{ kind: 'track', trackId: track\.id \}\)/);
  assert.match(menu, /downloadTrack\(props\.track\.id\)/);
  assert.match(menu, /context\.goToAlbum/);
  assert.match(menu, /context\.goToArtist/);
  assert.match(menu, /context\.goToArtists/);
  assert.match(menu, /v-for="artist in artists"/);
  assert.match(menu, /v-else-if="artists\.length > 1"/);
  assert.match(menu, /context\.matchedWith/);
  assert.match(menu, /context\.metadataCorrect/);
  assert.match(menu, /context\.metadataRestore/);
  assert.match(menu, /listMetadataCandidates/);
  assert.match(menu, /applyTrackMetadata/);
  assert.match(menu, /revertTrackMetadata/);
  assert.match(menu, /context\.metadataSearchLabel/);
  assert.match(menu, /externalTrackId/);
  assert.match(menu, /candidate\.details/);

  assert.match(trackTable, /<TrackContextMenu/);
  assert.match(trackTable, /@play="playFromList\(item\.data, true\)"/);
  assert.match(
    trackTable,
    /playCollection\(props\.tracks, track\.id\)/,
    "Playing a row queues the complete displayed track list",
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
  assert.match(
    artistCard,
    /<ArtistContextMenu[\s\S]*<article[\s\S]*<NuxtLink/,
    "The entire artist card is the context-menu trigger",
  );
});
