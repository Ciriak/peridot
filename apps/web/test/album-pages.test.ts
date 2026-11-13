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

  assert.match(listPage, /useCatalogAlbumQuery/);
  assert.match(listPage, /items: albums/);
  assert.doesNotMatch(listPage, /library-search/);
  assert.match(listPage, /<AlbumCard/);
  assert.match(listPage, /:album="album"/);
  assert.match(albumCard, /:to="albumRoute\(album\)"/);
  assert.match(
    albumCard,
    /<\/NuxtLink>\s+<p class="truncate text-xs text-muted-foreground">\s+<TrackArtistLinks :artists="album\.artists" \/>/,
    "Album card artist credits link to their artist pages",
  );
  assert.match(albumCard, /useLikes\(\)/);
  assert.match(albumCard, /<LikeButton/);
  assert.match(albumCard, /trackCoverUrl\(/);
  assert.match(albumCard, /<img[\s\S]*object-cover/);
  assert.match(albumCard, /@error="coverFailed = true"/);
  assert.match(albumCard, /loading="lazy"/);
  assert.match(albumCard, /decoding="async"/);
  assert.match(albumCard, /<Icon\s+v-else\s+:icon="icons\.music"/);
  assert.match(albumCard, /useLibraryPlayer\(\)/);
  assert.match(albumCard, /loadCollectionTracks\(/);
  assert.match(albumCard, /togglePlayback\(\)/);
  assert.match(
    albumCard,
    /async function toggleAlbumPlayback\(\) \{\s+if \(albumActive\.value && playing\.value\) \{\s+togglePlayback\(\);\s+return;\s+\}\s+if \(!address\.value[^\n]*!albumPlayable\.value\) return;/,
    "The album card pauses while playing but starts a collection from its first track otherwise",
  );
  assert.match(
    albumCard,
    /t\('card\.playAlbum', \{\s+album: album\.title,\s+artist: album\.artist,\s+\}\)/,
    "The album card play label explains that playback starts from the first track",
  );
  assert.match(
    albumCard,
    /albumActive && playing \? icons\.pause : icons\.play/,
  );
  assert.doesNotMatch(
    albumCard,
    /albumLoading|Loading \$\{album\.title\}/,
    "Album cards switch directly from play to pause",
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
  assert.match(listPage, /t\("page\.albums\.empty"\)/);
  assert.match(detailPage, /useCatalogAlbumQuery/);
  assert.match(detailPage, /albumMatches/);
  assert.match(
    detailPage,
    /const albumLoading = computed\(\s*\(\) =>\s*albumMatchesLoading\.value && !album\.value,?\s*\);/,
    "Album detail loading is blocking only until cached matches resolve",
  );
  assert.match(detailPage, /function loadAlbum\(force = false\)/);
  assert.match(
    detailPage,
    /onMounted\(\(\) => \{\s+loadAlbum\(\);/,
    "Album detail mounts without forcing a background catalog refresh",
  );
  assert.doesNotMatch(
    detailPage,
    /albumLoading\.value = true/,
    "Album detail does not override cached query loading state",
  );
  assert.match(detailPage, /route\.query\.artist/);
  assert.match(detailPage, /playCollection\(/);
  assert.match(detailPage, /togglePlayback\(\)/);
  assert.match(
    detailPage,
    /function toggleAlbumPlayback\(\) \{\s+if \(albumActive\.value && playing\.value\) \{\s+togglePlayback\(\);\s+return;\s+\}\s+void playWholeAlbum\(\);/,
    "The album header pauses while playing but starts a collection from its first track otherwise",
  );
  assert.match(
    detailPage,
    /t\('card\.playAlbum', \{\s+album: album\.title,\s+artist: album\.artist,\s+\}\)/,
    "The album header play label explains that playback starts from the first track",
  );
  assert.match(
    detailPage,
    /albumActive && playing \? icons\.pause : icons\.play/,
  );
  assert.doesNotMatch(
    detailPage,
    /albumPlaybackLoading/,
    "The album header switches directly from play to pause",
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
    detailPage,
    /<AlbumOfflineButton\s+:album="album"\s+class="absolute right-4 top-4"\s+\/>/,
    "Album details place an icon-only whole-album offline action at the top right",
  );
  assert.match(
    detailPage,
    /<template v-if="album\.releaseYear"[\s\S]*\{\{ formatTrackDuration\(album\.durationMs\) \}\}/,
    "The album header shows an available release year beside total duration",
  );
  assert.match(
    trackTable,
    /@dblclick\.prevent="playFromList\(item\.data\)"/,
    "Double-clicking a shared track row plays it in its list context",
  );
  assert.match(
    trackTable,
    /class="group\/track-artwork flex h-14 min-w-full select-none items-center whitespace-nowrap border-b hover:bg-muted\/50"[\s\S]*@dblclick\.prevent="playFromList\(item\.data\)"/,
    "The current track row does not add an active background effect",
  );
  assert.match(
    trackTable,
    /class="group\/track-artwork flex h-14 min-w-full select-none items-center whitespace-nowrap border-b hover:bg-muted\/50"/,
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
    trackTable,
    /v-if="isActive\(item\.data\)"\s+:icon="icons\.waveform"\s+aria-hidden="true"\s+class="size-4 shrink-0 text-primary"/,
    "The primary waveform follows the current track even while paused",
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
    /:id="trackTitleAnchorId\(item\.data\.id\)"/,
    "Track titles expose stable album-page anchors",
  );
  assert.match(
    trackTable,
    /<TrackArtwork[\s\S]*icons\.play[\s\S]*<\/TrackArtwork>\s*<div class="min-w-0 flex-1">\s*<div class="flex min-w-0 items-center gap-2">\s*<span\s+:id="trackTitleAnchorId\(item\.data\.id\)"\s+class="scroll-mt-4 truncate"\s+:class="\{ 'opacity-60': isUnavailable\(item\.data\) \}"\s+>\{\{ item\.data\.title \}\}<\/span\s*>/,
    "Track titles remain plain text beside artwork that embeds the play control",
  );
  assert.match(
    trackTable,
    /:to="trackAlbumRoute\(item\.data\)"/,
    "Track-list album names link to their album in every table variant",
  );
  assert.doesNotMatch(
    trackTable,
    /variant === 'library' &&\s*track\.album/,
    "Album links are not hidden from artist track lists",
  );
  assert.match(detailPage, /t\("page\.album\.unavailable"\)/);
  assert.match(
    detailPage,
    /<div class="mb-2">\s+<Button as-child variant="ghost" size="lg"/,
    "The album back control is large with tighter page spacing",
  );
  assert.doesNotMatch(
    detailPage,
    /Album order/,
    "The album tracks heading does not render an album-order tag",
  );
  assert.match(
    detailPage,
    /trackIdFromTitleHash\(route\.hash\)/,
    "Album pages translate title hashes into track targets",
  );
  assert.match(
    detailPage,
    /:scroll-to-track-id="scrollToTrackId"/,
    "Album pages pass the track target to the shared track table",
  );
  assert.match(
    trackTable,
    /v-for="item in visibleRows"/,
    "Table rows remain in the full-page scroll flow",
  );
  assert.match(trackTable, /const TRACK_BATCH_SIZE = 30/);
});

test("albums are available in persistent navigation", async () => {
  const [layout, app] = await Promise.all([
    readFile(new URL("../app/layouts/default.vue", import.meta.url), "utf8"),
    readFile(new URL("../app/app.vue", import.meta.url), "utf8"),
  ]);
  assert.match(
    layout,
    /labelKey: "navigation\.albums", to: "\/albums", icon: icons\.music/,
  );
  assert.match(layout, /currentPath\.value\.startsWith\(`\$\{target\}\/`\)/);
  assert.match(layout, /useLibraryPlayer\(\)/);
  assert.match(layout, /trackAlbumTitleRoute\(active\.value\)/);
  assert.match(
    layout,
    /<NuxtLink\s+v-if="currentTrackTitleRoute"\s+:to="currentTrackTitleRoute"/,
  );
  assert.match(app, /useLibraryPlayer\(\{ audio: true \}\)/);
});
