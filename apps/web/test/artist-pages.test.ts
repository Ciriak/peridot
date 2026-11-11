import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("artists have list and detail routes with artist-scoped content", async () => {
  const [listPage, detailPage, artistCard] = await Promise.all([
    readFile(
      new URL("../app/pages/artists/index.vue", import.meta.url),
      "utf8",
    ),
    readFile(
      new URL("../app/pages/artists/[artist].vue", import.meta.url),
      "utf8",
    ),
    readFile(
      new URL("../app/components/ArtistCard.vue", import.meta.url),
      "utf8",
    ),
  ]);

  assert.match(listPage, /groupArtists\(tracks\.value\)/);
  assert.match(listPage, /const artists = computed\(\(\) => groupArtists/);
  assert.doesNotMatch(listPage, /library-search/);
  assert.match(listPage, /<ArtistCard/);
  assert.match(listPage, /:artist="artist"/);
  assert.match(artistCard, /:to="artistRoute\(artist\)"/);
  assert.match(artistCard, /useLikes\(\)/);
  assert.match(artistCard, /<LikeButton/);
  assert.match(listPage, /No artists found/);
  assert.match(detailPage, /findArtist\(/);
  assert.match(detailPage, /route\.params\.artist/);
  assert.match(detailPage, /groupAlbums\(artist\.value\.tracks\)/);
  assert.match(detailPage, /<AlbumCard/);
  assert.match(detailPage, /:album="album"/);
  assert.match(detailPage, /playCollection\(/);
  assert.match(detailPage, /Play artist/);
  assert.match(detailPage, /<LikeButton/);
  assert.match(
    detailPage,
    /This artist is not available in your current library/,
  );
  assert.match(
    detailPage,
    /<div class="mb-2">\s+<Button as-child variant="ghost" size="lg"/,
    "The artist back control is large with tighter page spacing",
  );
});

test("artist names link from navigation and track lists", async () => {
  const [layout, albumDetail, libraryScreen, trackTable] = await Promise.all([
    readFile(new URL("../app/layouts/default.vue", import.meta.url), "utf8"),
    readFile(
      new URL("../app/pages/albums/[album].vue", import.meta.url),
      "utf8",
    ),
    readFile(
      new URL("../app/components/LibraryScreen.vue", import.meta.url),
      "utf8",
    ),
    readFile(
      new URL("../app/components/TrackTable.vue", import.meta.url),
      "utf8",
    ),
  ]);

  assert.match(layout, /name: "Artists", to: "\/artists", icon: icons\.user/);
  assert.match(layout, /currentPath\.value\.startsWith\(`\$\{target\}\/`\)/);
  assert.match(albumDetail, /<TrackArtistLinks :artists="album\.artists" \/>/);
  assert.match(
    trackTable,
    /<TrackArtistLinks :artists="trackArtistNames\(track\)" \/>/,
  );
  assert.match(
    trackTable,
    /:to="trackAlbumRoute\(track\)"/,
    "Artist-page track lists link their album names",
  );
  assert.match(libraryScreen, /variant="library"/);
  assert.match(trackTable, /@dblclick\.stop/);
});
