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
  assert.match(searchPage, /useCatalogTrackQuery/);
  assert.match(searchPage, /useCatalogAudiobookQuery/);
  assert.match(searchPage, /useCatalogPodcastQuery/);
  assert.match(searchPage, /query: searchTerm\.value/);
  assert.match(searchPage, /page\.search\.recent/);
  assert.match(searchPage, /useSearchRecents\(\)/);
  assert.match(searchPage, /@open="openAlbum\(album\)"/);
  assert.match(searchPage, /<CatalogCard/);
  assert.match(searchPage, /albumCatalogCard\(item\)/);
  assert.match(searchPage, /compact/);
  assert.match(searchPage, /<ArtistCard/);
  assert.match(searchPage, /<MediaCollectionCard/);
  assert.match(searchPage, /<TrackTable/);
  assert.match(searchPage, /page\.search\.externalSources/);
  assert.match(searchPage, /page\.search\.externalTitle/);
  assert.match(catalogCard, /defineEmits<\{ open: \[\] \}>/);
  assert.match(artistCard, /artistRoute\(artist\)/);
  assert.match(mediaCollectionCard, /collection\.mediaType/);
});

test("result-type tags are accessible quick filters", async () => {
  const searchPage = await readFile(
    new URL("../app/pages/search.vue", import.meta.url),
    "utf8",
  );

  assert.match(searchPage, /page\.search\.filters/);
  assert.match(searchPage, /role="group"/);
  assert.match(searchPage, /:aria-label="t\('page\.search\.filters'\)"/);
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
