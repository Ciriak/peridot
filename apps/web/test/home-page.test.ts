import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("home presents catalog suggestions with the shared album-card grid", async () => {
  const [homePage, albumPage] = await Promise.all([
    readFile(new URL("../app/pages/index.vue", import.meta.url), "utf8"),
    readFile(new URL("../app/pages/albums/index.vue", import.meta.url), "utf8"),
  ]);

  assert.match(homePage, /groupAlbums\(tracks\.value\)/);
  assert.match(homePage, /const albums = computed\(\(\) => groupAlbums/);
  assert.match(homePage, /<AlbumCard/);
  assert.match(homePage, /:album="album"/);
  assert.match(homePage, /void loadLikes\(\)/);
  assert.doesNotMatch(homePage, /\$\{albums\.length\} suggestions/);
  assert.doesNotMatch(homePage, /library-search/);
  assert.doesNotMatch(homePage, /<LibraryScreen/);

  const gridClass =
    /grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5/;
  assert.match(homePage, gridClass);
  assert.match(albumPage, gridClass);
});
