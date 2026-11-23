import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("search uses one full-content route with recent and local results", async () => {
  const [searchPage, layout, catalogCard, artistCard, mediaCollectionCard] =
    await Promise.all([
      readFile(new URL("../app/pages/search.vue", import.meta.url), "utf8"),
      readFile(new URL("../app/layouts/default.vue", import.meta.url), "utf8"),
      readFile(
        new URL("../app/components/CatalogCard.vue", import.meta.url),
        "utf8",
      ),
      readFile(
        new URL("../app/components/ArtistCard.vue", import.meta.url),
        "utf8",
      ),
      readFile(
        new URL("../app/components/MediaCollectionCard.vue", import.meta.url),
        "utf8",
      ),
    ]);

  assert.match(layout, /currentPath === '\/search' \? 'max-w-none'/);
  assert.doesNotMatch(layout, /library-search/);
  assert.match(
    layout,
    /<Input[\s\S]*v-model="searchQuery"[\s\S]*@focus="openSearch"/,
  );
  assert.match(layout, /await router\.push\("\/search"\)/);
  assert.doesNotMatch(
    searchPage,
    /<Input/,
    "The search page does not render a duplicate search input",
  );
  assert.match(searchPage, /useState\("search-query"/);
  assert.match(searchPage, /useCatalogArtistQuery/);
  assert.match(searchPage, /useCatalogAlbumQuery/);
  assert.match(searchPage, /usePlaylistList/);
  assert.match(searchPage, /useCatalogTrackQuery/);
  assert.match(searchPage, /useCatalogAudiobookQuery/);
  assert.match(searchPage, /useCatalogPodcastQuery/);
  assert.match(searchPage, /useTorznabSearch\(debouncedQuery\)/);
  assert.match(searchPage, /query: searchTerm\.value/);
  assert.match(searchPage, /page\.search\.recent/);
  assert.match(searchPage, /useSearchRecents\(\)/);
  assert.match(searchPage, /@open="openAlbum\(album\)"/);
  assert.match(searchPage, /<CatalogCard/);
  assert.match(searchPage, /albumCatalogCard\(album\)/);
  assert.match(searchPage, /playlistCatalogCard\(playlist\)/);
  assert.match(searchPage, /compact/);
  assert.match(searchPage, /<ArtistCard/);
  assert.match(searchPage, /<MediaCollectionCard/);
  assert.match(searchPage, /<TrackTable/);
  assert.match(searchPage, /variant="search"/);
  assert.match(searchPage, /layout="row"/);
  assert.match(searchPage, /page\.search\.noResults/);
  assert.doesNotMatch(searchPage, /page\.search\.externalTitle/);
  assert.doesNotMatch(searchPage, /<TorznabSearch/);
  assert.doesNotMatch(searchPage, /torznab\.search/);
  assert.match(catalogCard, /defineEmits<\{ open: \[\] \}>/);
  assert.match(artistCard, /artistRoute\(artist\)/);
  assert.match(mediaCollectionCard, /collection\.mediaType/);
});

test("external results use a counted tab and render only through the external panel", async () => {
  const searchPage = await readFile(
    new URL("../app/pages/search.vue", import.meta.url),
    "utf8",
  );

  assert.match(searchPage, /<Tabs v-model="activeSearchTab"/);
  assert.match(searchPage, /<TabsList/);
  assert.match(searchPage, /v-if="showSearchTabs"/);
  assert.match(searchPage, /<TabsTrigger value="library">/);
  assert.match(searchPage, /<TabsTrigger[\s\S]*value="external"/);
  assert.match(
    searchPage,
    /v-if="externalResultCount !== undefined"[\s\S]*\{\{ externalResultCount \}\}/,
  );
  assert.match(
    searchPage,
    /<TabsTrigger[\s\S]*value="external"[\s\S]*externalResultCount/,
    "The external result count remains visible while Library is active",
  );
  assert.match(
    searchPage,
    /v-if="!showSearchTabs \|\| activeSearchTab === 'library'"/,
    "Library category filters do not appear in the External tab",
  );
  assert.match(searchPage, /<TabsContent value="library"/);
  assert.match(
    searchPage,
    /<TabsContent v-if="showSearchTabs" value="external"/,
  );
  assert.match(searchPage, /<TorznabResults/);
  assert.match(
    searchPage,
    /watch\(searching,[\s\S]*?activeSearchTab\.value = "library"/,
  );
});

test("search lists tracks before albums and playlists without type headings", async () => {
  const searchPage = await readFile(
    new URL("../app/pages/search.vue", import.meta.url),
    "utf8",
  );
  const trackIndex = searchPage.indexOf('variant="search"');
  const albumIndex = searchPage.indexOf(
    'v-if="showAlbums && albumResults.length"',
  );
  const playlistIndex = searchPage.indexOf(
    'v-if="showPlaylists && playlistResults.length"',
  );

  assert.ok(trackIndex >= 0);
  assert.ok(albumIndex > trackIndex);
  assert.ok(playlistIndex > albumIndex);
  assert.doesNotMatch(searchPage, /page\.search\.localTracks/);
  assert.doesNotMatch(searchPage, /page\.search\.localAlbums/);
  assert.doesNotMatch(searchPage, /page\.search\.localPlaylists/);
  assert.match(
    searchPage,
    /const showArtists = computed\(\s*\(\) => resultFilter\.value === "artists"/,
  );
  assert.match(
    searchPage,
    /const showAudiobooks = computed\(\s*\(\) => resultFilter\.value === "audiobooks"/,
  );
  assert.match(
    searchPage,
    /const showPodcasts = computed\(\s*\(\) => resultFilter\.value === "podcasts"/,
  );
});

test("result-type tags are accessible quick filters", async () => {
  const searchPage = await readFile(
    new URL("../app/pages/search.vue", import.meta.url),
    "utf8",
  );

  assert.match(searchPage, /page\.search\.filters/);
  assert.match(searchPage, /role="group"/);
  assert.match(
    searchPage,
    /data-sidebar-swipe-ignore\s+role="group"[\s\S]*?class="scrollbar-hide flex flex-nowrap touch-pan-x items-center gap-2 overflow-x-auto overscroll-x-contain"/,
    "Quick filters stay on one horizontally scrollable line without a scrollbar",
  );
  assert.match(searchPage, /:aria-label="t\('page\.search\.filters'\)"/);
  assert.match(
    searchPage,
    /class="sticky -top-4 z-20 -mx-4 -mt-4 border-b bg-background px-4 py-3 md:-top-6 md:-mx-6 md:-mt-6 md:px-6"/,
    "The quick filters stay flush with the main scroll viewport while results scroll",
  );
  assert.match(searchPage, /aria-pressed="resultFilter === filter\.value"/);
  assert.match(searchPage, /\{ value: "all", labelKey: "page\.search\.all" \}/);
  assert.match(
    searchPage,
    /\{ value: "artists", labelKey: "page\.search\.artists" \}/,
  );
  assert.match(
    searchPage,
    /\{ value: "albums", labelKey: "page\.search\.albums" \}/,
  );
  assert.match(
    searchPage,
    /\{ value: "playlists", labelKey: "page\.search\.playlists" \}/,
  );
  assert.match(
    searchPage,
    /\{ value: "tracks", labelKey: "page\.search\.tracks" \}/,
  );
  assert.match(
    searchPage,
    /\{ value: "audiobooks", labelKey: "page\.search\.audiobooks" \}/,
  );
  assert.match(
    searchPage,
    /\{ value: "podcasts", labelKey: "page\.search\.podcasts" \}/,
  );
  assert.match(searchPage, /resultFilter\.value === "artists"/);
  assert.match(searchPage, /resultFilter\.value === "albums"/);
  assert.match(searchPage, /resultFilter\.value === "playlists"/);
  assert.match(searchPage, /resultFilter\.value === "tracks"/);
  assert.match(searchPage, /resultFilter\.value === "audiobooks"/);
  assert.match(searchPage, /resultFilter\.value === "podcasts"/);
});

test("catalog pages no longer depend on the removed header query state", async () => {
  const pages = await Promise.all(
    [
      "../app/pages/index.vue",
      "../app/pages/albums/index.vue",
      "../app/pages/artists/index.vue",
      "../app/pages/albums/[album].vue",
      "../app/pages/artists/[artist].vue",
      "../app/components/LibraryScreen.vue",
    ].map((path) => readFile(new URL(path, import.meta.url), "utf8")),
  );

  for (const page of pages) {
    assert.doesNotMatch(page, /library-search/);
  }
});
