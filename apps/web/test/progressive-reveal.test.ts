import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { ref } from "vue";
import {
  PROGRESSIVE_BATCH_SIZE,
  useProgressiveReveal,
} from "../app/composables/use-progressive-reveal.ts";

const catalog = Array.from({ length: 10_000 }, (_, index) => ({
  id: `track-${index}`,
}));

test("progressive reveal bounds the first card batch", () => {
  const state = useProgressiveReveal(catalog);

  assert.equal(PROGRESSIVE_BATCH_SIZE, 60);
  assert.equal(state.visibleItems.value.length, 60);
  assert.equal(state.total.value, 10_000);
  assert.equal(state.hasMore.value, true);
});

test("progressive reveal appends batches and stops at the collection end", () => {
  const state = useProgressiveReveal(catalog, { initial: 2, step: 3 });

  state.revealMore();
  assert.deepEqual(
    state.visibleItems.value.map((item) => item.id),
    ["track-0", "track-1", "track-2", "track-3", "track-4"],
  );

  const smallCatalog = catalog.slice(0, 4);
  const smallState = useProgressiveReveal(smallCatalog, {
    initial: 2,
    step: 3,
  });
  smallState.revealMore();
  assert.equal(smallState.visibleItems.value.length, 4);
  assert.equal(smallState.hasMore.value, false);
  smallState.revealMore();
  assert.equal(smallState.visibleItems.value.length, 4);
});

test("progressive reveal can expose a specific target without shrinking", () => {
  const state = useProgressiveReveal(catalog, { initial: 2, step: 3 });

  state.revealThrough(5);
  assert.equal(state.visibleItems.value.length, 6);
  assert.equal(state.visibleItems.value.at(-1)?.id, "track-5");

  state.revealThrough(1);
  assert.equal(state.visibleItems.value.length, 6);
});

test("progressive reveal resets when the filtered source changes", () => {
  const source = ref(catalog.slice(0, 8));
  const state = useProgressiveReveal(source, { initial: 2, step: 2 });

  state.revealMore();
  state.revealMore();
  assert.equal(state.visibleItems.value.length, 6);

  source.value = catalog.slice(8, 15);
  assert.equal(state.visibleItems.value.length, 2);
  assert.deepEqual(
    state.visibleItems.value.map((item) => item.id),
    ["track-8", "track-9"],
  );
});

test("catalog pages load bounded cursor pages", async () => {
  const [home, albums, artists, artistDetail, search] = await Promise.all(
    [
      "../app/pages/index.vue",
      "../app/pages/albums/index.vue",
      "../app/pages/artists/index.vue",
      "../app/pages/artists/[artist].vue",
      "../app/pages/search.vue",
    ].map((path) => readFile(new URL(path, import.meta.url), "utf8")),
  );

  for (const page of [home, albums, artists, artistDetail, search]) {
    assert.match(page, /useCatalog(?:Album|Artist|Track)Query/);
  }
  assert.match(home, /useCatalogTrackQuery/);
  assert.match(home, /useCatalogAlbumQuery/);
  assert.match(home, /useCatalogArtistQuery/);
  assert.match(home, /limit: HOME_PREVIEW_LIMIT/);
  assert.match(home, /v-for="album in likedAlbumPreview"/);
  assert.match(home, /v-for="artist in likedArtistPreview"/);
  assert.match(albums, /v-for="album in albums"/);
  assert.match(artists, /v-for="artist in artists"/);
  assert.match(artistDetail, /v-for="album in albums"/);
  assert.match(search, /v-for="album in albumResults"/);
});
