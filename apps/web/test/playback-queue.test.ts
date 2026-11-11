import assert from "node:assert/strict";
import test from "node:test";
import {
  addTrackAfterActive,
  addTrackNext,
  advanceShuffle,
  appendToShufflePool,
  compactQueueAfterShuffle,
  consumeQueue,
  moveTrackToFront,
  nextRepeatMode,
  normalizeQueueTrackIds,
  removeFromShufflePool,
  removeQueueTrack,
  reorderSourceQueue,
  restorePreviousTrack,
  restorePreviousShuffleTrack,
  shuffledPoolExcept,
  shuffleTrackIds,
  shuffleUpcoming,
} from "../app/lib/playback-queue.ts";

test("repeat mode cycles through off, all, and one", () => {
  assert.equal(nextRepeatMode("off"), "all");
  assert.equal(nextRepeatMode("all"), "one");
  assert.equal(nextRepeatMode("one"), "off");
});

test("queue helpers move, add, consume, and remove unique tracks", () => {
  assert.deepEqual(moveTrackToFront(["a", "b", "c"], "c"), ["c", "a", "b"]);
  assert.deepEqual(moveTrackToFront(["a", "b"], "new"), ["new", "a", "b"]);
  assert.deepEqual(addTrackNext(["a", "b", "c"], "c"), ["a", "c", "b"]);
  assert.deepEqual(addTrackNext(["a", "b", "c"], "a"), ["a", "b", "c"]);
  assert.deepEqual(addTrackNext([], "c"), ["c"]);
  assert.deepEqual(addTrackAfterActive(["a", "b", "c"], "c", "d"), [
    "a",
    "b",
    "c",
    "d",
  ]);
  assert.deepEqual(addTrackAfterActive(["a", "b", "c"], "b", "a"), [
    "b",
    "a",
    "c",
  ]);
  assert.deepEqual(consumeQueue(["a", "b", "c"]), ["b", "c"]);
  assert.deepEqual(consumeQueue(["a"]), []);
  assert.deepEqual(removeQueueTrack(["a", "b", "c"], "b"), ["a", "c"]);
});

test("queue normalization preserves order while dropping unavailable entries", () => {
  assert.deepEqual(
    normalizeQueueTrackIds(
      ["b", "missing", "a", "b"],
      new Set(["a", "b", "c"]),
    ),
    ["b", "a"],
  );
});

test("source-order edits preserve the active track position", () => {
  assert.deepEqual(reorderSourceQueue(["a", "b", "c", "d"], "b", ["d", "a"]), [
    "d",
    "b",
    "a",
    "c",
  ]);
  assert.deepEqual(
    shuffleUpcoming(["a", "b", "c", "d"], () => 0),
    ["a", "c", "d", "b"],
  );
  assert.deepEqual(restorePreviousTrack(["b", "c"], "a"), ["a", "b", "c"]);
  assert.deepEqual(restorePreviousTrack([], "a"), ["a"]);
});

test("randomized passes are unique, disjoint, and consumed once", () => {
  const source = ["a", "b", "c", "d"];
  const pool = shuffledPoolExcept(source, "b", () => 0);

  assert.deepEqual(pool, ["c", "d", "a"]);
  assert.deepEqual([...pool].sort(), ["a", "c", "d"]);
  assert.equal(new Set(pool).size, pool.length);
  assert.ok(!pool.includes("b"));
  assert.deepEqual(source, ["a", "b", "c", "d"]);
  assert.deepEqual(pool.slice(1), ["d", "a"]);
  assert.deepEqual(
    shuffleTrackIds(["a", "b", "a"], () => 0),
    ["b", "a"],
  );
});

test("random-pool edits never duplicate tracks or reorder the source queue", () => {
  assert.deepEqual(removeFromShufflePool(["c", "a", "d"], "a"), ["c", "d"]);
  assert.deepEqual(appendToShufflePool(["c", "a"], "d"), ["c", "a", "d"]);
  assert.deepEqual(appendToShufflePool(["c", "a"], "c"), ["a", "c"]);
  assert.deepEqual(restorePreviousShuffleTrack(["c", "d"], "a"), [
    "a",
    "c",
    "d",
  ]);
  assert.deepEqual(compactQueueAfterShuffle(["a", "b", "c", "d"], "c", ["d"]), [
    "c",
    "d",
  ]);
});

test("randomized advancement renews only after a completed pass", () => {
  assert.deepEqual(advanceShuffle(["a", "b", "c"], "a", ["c", "b"], false), {
    activeTrackId: "c",
    shuffleTrackIds: ["b"],
  });
  assert.deepEqual(advanceShuffle(["a", "b", "c"], "b", [], false), {
    activeTrackId: "b",
    shuffleTrackIds: [],
  });
  assert.deepEqual(
    advanceShuffle(["a", "b", "c"], "b", [], true, () => 0),
    {
      activeTrackId: "c",
      shuffleTrackIds: ["a"],
    },
  );
});
