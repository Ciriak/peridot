import assert from "node:assert/strict";
import { test } from "node:test";
import {
  effectiveTrackGenres,
  normalizeGenres,
  serializeGenres,
} from "../src/genres.js";

test("track genres are normalized, deduplicated, and preserve file fallback", () => {
  assert.deepEqual(
    normalizeGenres([
      "  Electronic ",
      "electronic",
      "Deep   House",
      "",
      42,
      "Ambient",
    ]),
    ["Electronic", "Deep House", "Ambient"],
  );

  const stored = serializeGenres(["Jazz", "jazz", " Fusion "]);
  assert.equal(stored, JSON.stringify(["Jazz", "Fusion"]));
  assert.deepEqual(
    effectiveTrackGenres({ genres: stored, metadataGenres: null }),
    ["Jazz", "Fusion"],
  );
  assert.deepEqual(
    effectiveTrackGenres({
      genres: stored,
      metadataGenres: JSON.stringify(["Electronic"]),
    }),
    ["Electronic"],
  );
});
