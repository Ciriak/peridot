import assert from "node:assert/strict";
import test from "node:test";
import { findAlbums, toggleFavorite } from "../app/lib/demo-library.ts";

test("search finds titles, artists and genres regardless of case and surrounding spaces", () => {
  assert.equal(findAlbums("  BLUE HOURS  ")[0]?.artist, "Elliot Lake");
  assert.equal(findAlbums("north of june")[0]?.title, "After the rain");
  assert.equal(findAlbums("ambient").length, 2);
  assert.deepEqual(findAlbums("unknown artist"), []);
});
test("favorites narrow search while preserving original playback indexes", () => {
  assert.deepEqual(
    findAlbums("", [1, 3]).map((album) => album.index),
    [1, 3],
  );
  assert.equal(findAlbums("ambient", [1, 3]).length, 0);
  assert.equal(findAlbums("", []).length, 0);
});
test("liking and unliking changes the favorites view without mutating prior state", () => {
  const original = [1];
  const added = toggleFavorite(original, 3);
  assert.equal(findAlbums("Sunroom", added).length, 1);
  assert.equal(findAlbums("Sunroom", toggleFavorite(added, 3)).length, 0);
  assert.deepEqual(original, [1]);
});
