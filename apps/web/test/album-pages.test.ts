import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("albums have list and detail routes with derived groups", async () => {
  const [listPage, detailPage, libraryScreen, trackTable, catalogCard] =
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
        new URL("../app/components/CatalogCard.vue", import.meta.url),
        "utf8",
      ),
    ]);

  assert.match(listPage, /useVirtualAlbums/);
  assert.match(listPage, /items: albums/);
  assert.doesNotMatch(listPage, /library-search/);
  assert.match(listPage, /<VirtualCardGrid/);
  assert.match(listPage, /<CatalogCard/);
  assert.match(listPage, /albumCatalogCard\(item\)/);
  assert.match(listPage, /useTasks\(\)/);
  assert.match(listPage, /task\.kind === "library_scan"/);
  assert.match(listPage, /task\.status === "running"/);
  assert.match(listPage, /page\.albums\.indexing/);
  assert.match(
    listPage,
    /v-if="libraryIndexing" variant="outline" aria-live="polite"/,
  );
  assert.match(catalogCard, /:to="titleRoute"/);
  assert.match(
    catalogCard,
    /<\/h3>\s*<\/NuxtLink>\s*<ScrollingText[\s\S]*?<TrackArtistLinks :artists="album\.artists" \/>/,
    "Album card artist credits link to their artist pages",
  );
  assert.match(catalogCard, /useLikes\(\)/);
  assert.match(catalogCard, /<LikeButton/);
  assert.match(catalogCard, /trackCoverUrl\(/);
  assert.match(catalogCard, /<FadeInImage[\s\S]*:src="coverImageUrl"/);
  assert.match(catalogCard, /class="absolute inset-0"/);
  assert.match(catalogCard, /@error="coverFailed = true"/);
  assert.match(catalogCard, /const fallbackIcon = computed/);
  assert.match(catalogCard, /useLibraryPlayer\(\)/);
  assert.match(catalogCard, /loadCollectionTracks\(/);
  assert.match(catalogCard, /togglePlayback\(\)/);
  assert.match(
    catalogCard,
    /async function toggleAlbumPlayback\(retryUnavailable = false\) \{[\s\S]*?await toggleCollectionPlayback\(\s*albumTarget\.value,\s*async \(\) => \{/,
    "The album card starts the whole collection through the optimistic player target",
  );
  assert.match(
    catalogCard,
    /if \(serverStatus\.value === "lost" \|\| !address\.value \|\| !token\.value\) \{\s+return saved;\s+\}/,
    "Offline albums do not require live-server credentials to play saved tracks",
  );
  assert.match(
    catalogCard,
    /t\("card\.playAlbum", \{\s+album: album\.value\.title,\s+artist: album\.value\.artist,\s+\}\)/,
    "The album card play label explains that playback starts from the first track",
  );
  assert.match(
    catalogCard,
    /playbackActive\s+\?\s+icons\.pause\s+:\s+icons\.play/,
  );
  assert.doesNotMatch(
    catalogCard,
    /albumLoading|Loading \$\{album\.title\}/,
    "Album cards switch directly from play to pause",
  );
  assert.match(catalogCard, /@click\.prevent\.stop="toggleCardPlayback"/);
  assert.match(catalogCard, /group-hover:opacity-100/);
  assert.doesNotMatch(catalogCard, /group-focus-within:opacity-100/);
  assert.match(catalogCard, /focus-visible:opacity-100/);
  assert.match(catalogCard, /max-sm:pointer-events-auto/);
  assert.match(catalogCard, /max-sm:size-11/);
  assert.match(catalogCard, /max-sm:opacity-100/);
  assert.match(
    catalogCard,
    /compact\s*\?\s*'size-4 max-sm:size-5'\s*:\s*'size-5 max-sm:size-6'/,
    "The play icon grows on mobile-sized album cards",
  );
  assert.match(catalogCard, /cursor-pointer/);
  assert.match(catalogCard, /compact \? 'icon-sm' : 'icon'/);
  assert.match(
    catalogCard,
    /compact \? 'bottom-1 right-1' : 'bottom-2 right-2'/,
  );
  assert.match(
    catalogCard,
    /@click\.prevent\.stop="toggleCardPlayback"/,
    "Unavailable album cards expose an actionable unavailable control",
  );
  assert.doesNotMatch(
    catalogCard,
    /:aria-disabled="!controlEnabled"/,
    "Unavailable album controls remain actionable",
  );
  assert.match(
    catalogCard,
    /!controlEnabled\s+\? icons\.cloudOff\s+:\s+playbackActive\s+\? icons\.pause\s+:\s+icons\.play/,
    "Unavailable album cards replace the play glyph with the unavailable icon",
  );
  assert.match(
    catalogCard,
    /if \(album\.value\) return albumPlayable\.value \|\| activePlaying\.value;/,
    "An album that is currently playing can still be paused",
  );
  assert.match(
    catalogCard,
    /const albumFullySaved = computed/,
    "Offline playback requires the whole album to be saved",
  );
  assert.match(
    catalogCard,
    /const albumPlayable = computed\(\s+\(\) =>[\s\S]*albumFullySaved\.value[\s\S]*serverStatus\.value !== "lost"/,
    "A partially saved album is unavailable offline",
  );
  assert.match(
    catalogCard,
    /<TooltipProvider :delay-duration="150">\s+<TooltipRoot :disabled="controlEnabled">\s+<TooltipTrigger as-child>/,
  );
  assert.match(
    catalogCard,
    /<TooltipContent\s+v-if="!controlEnabled"[\s\S]*?\{\{ t\("trackTable\.unavailable"\) \}\}/,
    "Unavailable album cards explain the disabled play control in a tooltip",
  );
  assert.doesNotMatch(
    catalogCard,
    /<Badge\b/,
    "Catalog cards use their unavailable control instead of a status badge",
  );
  assert.doesNotMatch(
    detailPage,
    /<CatalogCard/,
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
  assert.match(detailPage, /toggleCollectionPlayback\(/);
  assert.match(detailPage, /togglePlayback\(\)/);
  assert.match(
    detailPage,
    /function toggleAlbumPlayback\(\) \{[\s\S]*?void playWholeAlbum\(\);/,
    "The album header pauses while playing but starts a collection from its first track otherwise",
  );
  assert.match(
    detailPage,
    /const albumPlayLabel = computed\([\s\S]*?t\("card\.playAlbum", \{[\s\S]*?album: album\.value\.title,[\s\S]*?artist: album\.value\.artist,/,
    "The album header play label explains that playback starts from the first track",
  );
  assert.match(
    detailPage,
    /:play-label="albumPlayLabel"[\s\S]*?:pause-label="albumPauseLabel"/,
    "The compact album header shares the full header play labels",
  );
  assert.match(detailPage, /albumPlaybackActive \? icons\.pause : icons\.play/);
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
  assert.match(
    detailPage,
    /<FadeInImage[\s\S]*:src="coverImageUrl"[\s\S]*loading="eager"/,
  );
  assert.match(detailPage, /<Icon :icon="icons\.album"/);
  assert.match(detailPage, /<LikeButton/);
  assert.match(
    detailPage,
    /<LikeButton\s+class="absolute right-4 top-4"/,
    "Album details place the like action at the top right of the header",
  );
  assert.match(
    detailPage,
    /<AlbumContextMenu :album="album">\s+<section\s+aria-labelledby="album-heading"/,
    "The whole album header is the context-menu trigger",
  );
  assert.doesNotMatch(
    detailPage,
    /<AlbumOfflineButton/,
    "The album header does not render a separate offline action",
  );
  assert.match(
    detailPage,
    /<template v-if="album\.releaseYear"[\s\S]*\{\{ formatTrackDuration\(album\.durationMs\) \}\}/,
    "The album header shows an available release year beside total duration",
  );
  assert.match(
    trackTable,
    /@dblclick\.prevent="playFromList\(item\.track\)"/,
    "Double-clicking a shared track row plays it in its list context",
  );
  assert.match(
    trackTable,
    /class="group\/track-artwork flex h-14 min-w-full select-none items-center whitespace-nowrap border-b motion-safe:transition-colors motion-safe:duration-300 motion-safe:ease-out motion-reduce:transition-none"[\s\S]*@dblclick\.prevent="playFromList\(item\.track\)"/,
    "Track rows use a fading background transition without selecting on double click",
  );
  assert.match(
    trackTable,
    /class="group\/track-artwork flex h-14 min-w-full select-none items-center whitespace-nowrap border-b motion-safe:transition-colors motion-safe:duration-300 motion-safe:ease-out motion-reduce:transition-none"/,
    "Track rows prevent their text from being selected",
  );
  assert.match(
    trackTable,
    /'bg-primary\/10': isTrackLinkHighlighted\(item\.track\)[\s\S]*?'hover:bg-muted\/50': !isTrackLinkHighlighted\(item\.track\)/,
    "Only the linked track receives the primary background highlight",
  );
  assert.match(
    trackTable,
    /const TRACK_LINK_HIGHLIGHT_DURATION_MS = 2000;[\s\S]*?trackLinkHighlightId\.value = mediaId;[\s\S]*?trackLinkHighlightId\.value = null;/,
    "A linked track keeps its highlight for two seconds before returning to its normal background",
  );
  assert.match(
    trackTable,
    /function isActive\(track: MediaResponse\): boolean \{\s+return currentTrackId\.value === track\.id;/,
    "The row highlight follows the current track independently of playback",
  );
  assert.match(
    trackTable,
    /function isPlaying\(track: MediaResponse\): boolean \{\s+return isActive\(track\) && playing\.value;/,
    "The pause icon still follows actual playback state",
  );
  assert.match(
    trackTable,
    /v-if="isActive\(item\.track\)"\s+:icon="icons\.waveform"\s+aria-hidden="true"\s+class="size-4 shrink-0 text-primary"/,
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
    /showArtists !== false[\s\S]*?item\.track\.mediaType === 'music'[\s\S]*?<TrackArtistLinks :artists="trackArtistNames\(item\.track\)" \/>/,
    "Album track-list artists use the shared menu-aware artist links",
  );
  assert.match(
    trackTable,
    /:id="trackTitleAnchorId\(item\.track\.id\)"/,
    "Track titles expose stable album-page anchors",
  );
  assert.match(
    trackTable,
    /<TrackArtwork[\s\S]*icons\.play[\s\S]*<\/TrackArtwork>\s*<div class="min-w-0 flex-1">\s*<div class="flex min-w-0 items-center gap-2">\s*<ScrollingText\s+:id="trackTitleAnchorId\(item\.track\.id\)"\s+class="min-w-0 scroll-mt-20"\s+:class="\{ 'opacity-60': isUnavailable\(item\.track\) \}"[\s\S]*?>\{\{ item\.track\.title \}\}<\/ScrollingText/,
    "The current-track indicator sits immediately after the track title",
  );
  assert.match(
    trackTable,
    /<AlbumLink :album="albumSummaryFromTrack\(item\.track\)" \/>/,
    "Track-list album names use the shared menu-aware album link in every table variant",
  );
  assert.match(
    trackTable,
    /v-if="variant !== 'album'"\s+role="columnheader"[\s\S]*?trackTable\.offline[\s\S]*?v-if="allowTrackLike !== false"[\s\S]*?trackTable\.favorite/,
    "The album track-list header replaces the offline column with the like column",
  );
  assert.match(
    trackTable,
    /v-if="variant !== 'album' && !isSearch"\s+:role="isSearch \? undefined : 'cell'"[\s\S]*?<DownloadProgressTooltip[\s\S]*?!isSearch &&\s*allowTrackLike !== false &&\s*item\.track\.mediaType === 'music'[\s\S]*?<LikeButton/,
    "The album track-list row replaces the offline action with the like button",
  );
  assert.match(
    trackTable,
    /const props = withDefaults\(\s*defineProps<\{[\s\S]*?\}>\(\),\s*\{\s*showArtists: true,\s*allowTrackLike: true,\s*\},?\s*\);/,
    "Omitted track-list flags enable artist links and like controls",
  );
  assert.doesNotMatch(
    trackTable,
    /variant === 'library' &&\s*track\.album/,
    "Album links are not hidden from artist track lists",
  );
  assert.match(detailPage, /t\("page\.album\.unavailable"\)/);
  assert.match(
    detailPage,
    /<BackButton \/>/,
    "The album back control uses the shared history-aware button",
  );
  assert.doesNotMatch(
    detailPage,
    /Album order/,
    "The album tracks heading does not render an album-order tag",
  );
  assert.match(
    detailPage,
    /mediaIdFromTitleHash\(route\.hash\)/,
    "Album pages translate title hashes into track targets",
  );
  assert.match(
    detailPage,
    /:scroll-to-track-id="scrollToTrackId"/,
    "Album pages pass the track target to the shared track table",
  );
  assert.match(
    trackTable,
    /v-for="item in virtualRows"/,
    "Table rows render through the main-scroll virtualizer",
  );
  assert.match(trackTable, /useMainScrollVirtualizer/);
});

test("albums are available in persistent navigation", async () => {
  const [layout, app] = await Promise.all([
    readFile(new URL("../app/layouts/default.vue", import.meta.url), "utf8"),
    readFile(new URL("../app/app.vue", import.meta.url), "utf8"),
  ]);
  assert.match(
    layout,
    /labelKey: "navigation\.albums", to: "\/albums", icon: icons\.album/,
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
