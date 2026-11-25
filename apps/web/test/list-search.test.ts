import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("library list pages render an independent scoped search control", async () => {
  const pages = await Promise.all(
    [
      "../app/pages/albums/index.vue",
      "../app/pages/artists/index.vue",
      "../app/pages/audiobooks/index.vue",
      "../app/pages/podcasts/index.vue",
      "../app/pages/playlists/index.vue",
      "../app/components/LibraryScreen.vue",
    ].map((path) => readFile(new URL(path, import.meta.url), "utf8")),
  );

  for (const page of pages) {
    assert.match(page, /<ListSearchBar/);
    assert.match(page, /:clear-label="t\('components\.listSearch\.clear'\)"/);
    assert.match(page, /@clear="clear"/);
    assert.ok(
      page.indexOf("<h1") < page.indexOf("<ListSearchBar") &&
        page.indexOf("<ListSearchBar") < page.indexOf("<section"),
      "The scoped search belongs to the page-title row",
    );
  }

  assert.match(pages[0]!, /query: searchQuery\.value \|\| undefined/);
  assert.match(pages[1]!, /query: searchQuery\.value \|\| undefined/);
  assert.match(pages[2]!, /query: searchQuery\.value \|\| undefined/);
  assert.match(pages[3]!, /query: searchQuery\.value \|\| undefined/);
  assert.match(
    pages[4]!,
    /useVirtualPlaylists\(\(\) => \(\{ query: searchQuery\.value \|\| undefined \}\)\)/,
  );
  assert.match(pages[5]!, /query: searchQuery\.value \|\| undefined/);
});

test("list search debounces trimmed input and clears immediately", async () => {
  const [bar, search] = await Promise.all([
    readFile(
      new URL("../app/components/ListSearchBar.vue", import.meta.url),
      "utf8",
    ),
    readFile(
      new URL("../app/composables/use-list-search.ts", import.meta.url),
      "utf8",
    ),
  ]);

  assert.match(bar, /:icon="icons\.search"/);
  assert.match(bar, /:icon="icons\.close"/);
  assert.match(bar, /role="search"/);
  assert.doesNotMatch(bar, /md:ml-auto/);
  assert.match(bar, /@keydown\.esc="emit\('clear'\)"/);
  assert.match(bar, /:aria-label="label"/);
  assert.match(
    bar,
    /<Input[\s\S]*type="search"[\s\S]*autocomplete="off"/,
    "List search inputs disable native autocomplete",
  );
  assert.match(search, /LIST_SEARCH_DEBOUNCE_MS = 250/);
  assert.match(search, /searchQuery\.value = value\.trim\(\)/);
  assert.match(
    search,
    /function clear\(\) \{\s+query\.value = "";\s+searchQuery\.value = "";/,
  );
});

test("filtered empty states remain distinct from empty libraries", async () => {
  const sources = (
    await Promise.all(
      [
        "../app/pages/albums/index.vue",
        "../app/pages/artists/index.vue",
        "../app/pages/audiobooks/index.vue",
        "../app/pages/podcasts/index.vue",
        "../app/pages/playlists/index.vue",
        "../app/components/LibraryScreen.vue",
      ].map((path) => readFile(new URL(path, import.meta.url), "utf8")),
    )
  ).join("\n");

  for (const key of [
    "page.albums.noMatches",
    "page.artists.noMatches",
    "page.audiobooks.noMatches",
    "page.podcasts.noMatches",
    "page.playlists.noMatches",
    "page.liked.noMatches",
  ]) {
    assert.match(sources, new RegExp(key.replaceAll(".", "\\.")));
  }
});
