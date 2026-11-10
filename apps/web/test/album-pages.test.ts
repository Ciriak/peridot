import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("albums have list and detail routes with searchable derived groups", async () => {
  const [listPage, detailPage, libraryScreen, trackTable, albumCard] =
    await Promise.all([
      readFile(
        new URL("../app/pages/albums/index.vue", import.meta.url),
        "utf8",
      ),
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
      readFile(
        new URL("../app/components/AlbumCard.vue", import.meta.url),
        "utf8",
      ),
    ]);

  assert.match(listPage, /groupAlbums\(tracks\.value\)/);
  assert.match(listPage, /filterAlbums\(albums\.value, search\.value\)/);
  assert.match(listPage, /<AlbumCard/);
  assert.match(listPage, /:album="album"/);
  assert.match(albumCard, /:to="albumRoute\(album\)"/);
  assert.match(albumCard, /useLikes\(\)/);
  assert.match(albumCard, /<LikeButton/);
  assert.match(albumCard, /trackCoverUrl\(/);
  assert.match(albumCard, /<img[\s\S]*object-cover/);
  assert.match(albumCard, /@error="coverFailed = true"/);
  assert.match(albumCard, /<Icon v-else :icon="icons\.music"/);
  assert.match(listPage, /No albums found/);
  assert.match(detailPage, /findAlbum\(/);
  assert.match(detailPage, /route\.query\.artist/);
  assert.match(detailPage, /playCollection\(/);
  assert.match(detailPage, /<img[\s\S]*object-cover/);
  assert.match(detailPage, /<Icon v-else :icon="icons\.music"/);
  assert.match(detailPage, /<LikeButton/);
  assert.match(
    trackTable,
    /@dblclick\.prevent="play\(track\.id\)"/,
    "Double-clicking a shared track row plays it",
  );
  assert.match(
    libraryScreen,
    /variant="library"/,
    "The library uses the shared track table",
  );
  assert.match(
    detailPage,
    /variant="album"/,
    "Album detail uses the shared track table",
  );
  assert.match(
    trackTable,
    /@dblclick\.stop/,
    "Track controls do not also trigger row playback",
  );
  assert.match(
    trackTable,
    /:to="trackAlbumRoute\(track\)"/,
    "Track-list album names link to their album",
  );
  assert.match(
    detailPage,
    /This album is not available in your current library/,
  );
});

test("albums are available in persistent navigation", async () => {
  const [layout, app] = await Promise.all([
    readFile(new URL("../app/layouts/default.vue", import.meta.url), "utf8"),
    readFile(new URL("../app/app.vue", import.meta.url), "utf8"),
  ]);
  assert.match(layout, /name: "Albums", to: "\/albums", icon: icons\.music/);
  assert.match(layout, /currentPath\.value\.startsWith\(`\$\{target\}\/`\)/);
  assert.match(layout, /useLibraryPlayer\(\)/);
  assert.match(app, /useLibraryPlayer\(\{ audio: true \}\)/);
});
