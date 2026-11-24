import assert from "node:assert/strict";
import test from "node:test";
import {
  VIRTUAL_ALBUM_PAGE_SIZE,
  VIRTUAL_WINDOW_LOAD_DELAY_MS,
  virtualAlbumPageOffsets,
  virtualCardRowPlaceholderCount,
} from "../app/lib/virtual-albums.ts";

test("virtual card placeholders stop at the end of a short final row", () => {
  assert.equal(virtualCardRowPlaceholderCount(0, 5, 1, 1), 0);
  assert.equal(virtualCardRowPlaceholderCount(0, 5, 3, 3), 0);
  assert.equal(virtualCardRowPlaceholderCount(1, 5, 7, 2), 0);
  assert.equal(virtualCardRowPlaceholderCount(2, 5, 12, 2), 0);

  assert.equal(virtualCardRowPlaceholderCount(1, 5, 500, 0), 5);
  assert.equal(virtualCardRowPlaceholderCount(1, 5, 7, 0), 2);
  assert.equal(virtualCardRowPlaceholderCount(1, 5, 7, 1), 1);
});

test("virtual album windows fetch pages around the visible range", () => {
  assert.deepEqual(virtualAlbumPageOffsets(0, 24), [0, 100]);
  assert.deepEqual(
    virtualAlbumPageOffsets(4_500, 4_524),
    [4_400, 4_500, 4_600],
  );
  assert.deepEqual(
    virtualAlbumPageOffsets(4_950, 5_050),
    [4_800, 4_900, 5_000, 5_100],
  );
});

test("virtual album windows use bounded offset pages instead of cursor chains", async () => {
  const source = await import("node:fs/promises").then(({ readFile }) =>
    readFile(
      new URL("../app/composables/use-virtual-albums.ts", import.meta.url),
      "utf8",
    ),
  );

  assert.equal(VIRTUAL_ALBUM_PAGE_SIZE, 100);
  assert.equal(VIRTUAL_WINDOW_LOAD_DELAY_MS, 250);
  assert.match(source, /offset,/);
  assert.match(source, /useQueries/);
  assert.match(source, /queryClient\.removeQueries/);
  assert.match(source, /gcTime: 60_000/);
  assert.doesNotMatch(source, /useInfiniteQuery|fetchNextPage/);
});
