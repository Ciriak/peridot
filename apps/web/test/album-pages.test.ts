import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("albums have list and detail routes with derived groups", async () => {
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
  assert.match(listPage, /const albums = computed\(\(\) => groupAlbums/);
  assert.doesNotMatch(listPage, /library-search/);
  assert.match(listPage, /<AlbumCard/);
  assert.match(listPage, /:album="album"/);
  assert.match(albumCard, /:to="albumRoute\(album\)"/);
  assert.match(albumCard, /useLikes\(\)/);
  assert.match(albumCard, /<LikeButton/);
  assert.match(albumCard, /trackCoverUrl\(/);
  assert.match(albumCard, /<img[\s\S]*object-cover/);
  assert.match(albumCard, /@error="coverFailed = true"/);
  assert.match(albumCard, /<Icon\s+v-else\s+:icon="icons\.music"/);
  assert.match(albumCard, /useLibraryPlayer\(\)/);
  assert.match(albumCard, /playCollection\(props\.album\.trackIds\)/);
  assert.match(albumCard, /togglePlayback\(\)/);
  assert.match(
    albumCard,
    /albumActive && playing \? icons\.pause : icons\.play/,
  );
  assert.match(albumCard, /@click\.prevent\.stop="toggleAlbumPlayback"/);
  assert.match(albumCard, /group-hover:opacity-100/);
  assert.doesNotMatch(albumCard, /group-focus-within:opacity-100/);
  assert.match(albumCard, /focus-visible:opacity-100/);
  assert.match(albumCard, /cursor-pointer/);
  assert.match(albumCard, /compact \? 'icon-sm' : 'icon'/);
  assert.match(albumCard, /compact \? 'bottom-1 right-1' : 'bottom-2 right-2'/);
  assert.doesNotMatch(
    detailPage,
    /<AlbumCard/,
    "The album detail cover does not use the shared card play control",
  );
  assert.match(listPage, /No albums found/);
  assert.match(detailPage, /findAlbum\(/);
  assert.match(detailPage, /route\.query\.artist/);
  assert.match(detailPage, /playCollection\(/);
  assert.match(detailPage, /togglePlayback\(\)/);
  assert.match(
    detailPage,
    /albumActive && playing \? icons\.pause : icons\.play/,
  );
  assert.match(detailPage, /@click="toggleAlbumPlayback"/);
  assert.match(detailPage, /size="icon-lg"/);
  assert.match(detailPage, /:aria-label=/);
  assert.doesNotMatch(
    detailPage,
    />\s*Play album\s*</,
    "The album-detail playback control is icon-only",
  );
  assert.match(detailPage, /<img[\s\S]*object-cover/);
  assert.match(detailPage, /<Icon v-else :icon="icons\.music"/);
  assert.match(detailPage, /<LikeButton/);
  assert.match(
    trackTable,
    /@dblclick\.prevent="play\(track\.id\)"/,
    "Double-clicking a shared track row plays it",
  );
  assert.match(
    trackTable,
    /:class="isActive\(track\) && 'bg-primary\/10'"/,
    "The current track row has a subtle primary background",
  );
  assert.match(
    trackTable,
    /class="select-none border-b last:border-0 hover:bg-muted\/50"/,
    "Track rows prevent their text from being selected",
  );
  assert.match(
    trackTable,
    /function isActive\(track: TrackResponse\): boolean \{\s+return currentTrackId\.value === track\.id;/,
    "The row highlight follows the current track independently of playback",
  );
  assert.match(
    trackTable,
    /function isPlaying\(track: TrackResponse\): boolean \{\s+return isActive\(track\) && playing\.value;/,
    "The pause icon still follows actual playback state",
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
    /<\/Button>\s*<span class="truncate">\{\{ track\.title \}\}<\/span>/,
    "Track titles are plain text beside the play button",
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
