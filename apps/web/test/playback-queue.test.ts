import assert from "node:assert/strict";
import test from "node:test";
import {
  addTrackNext,
  consumeQueue,
  moveTrackToFront,
  normalizeQueueTrackIds,
  removeQueueTrack,
  reorderUpcoming,
  restorePreviousTrack,
  shuffleUpcoming,
} from "../app/lib/playback-queue.ts";

test("queue helpers move, add, consume, and remove unique tracks", () => {
  assert.deepEqual(moveTrackToFront(["a", "b", "c"], "c"), ["c", "a", "b"]);
  assert.deepEqual(moveTrackToFront(["a", "b"], "new"), ["new", "a", "b"]);
  assert.deepEqual(addTrackNext(["a", "b", "c"], "c"), ["a", "c", "b"]);
  assert.deepEqual(addTrackNext(["a", "b", "c"], "a"), ["a", "b", "c"]);
  assert.deepEqual(addTrackNext([], "c"), ["c"]);
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

test("only the pinned active track survives upcoming-only edits", () => {
  assert.deepEqual(reorderUpcoming(["a", "b", "c", "d"], ["d", "b"]), [
    "a",
    "d",
    "b",
    "c",
  ]);
  assert.deepEqual(
    shuffleUpcoming(["a", "b", "c", "d"], () => 0),
    ["a", "c", "d", "b"],
  );
  assert.deepEqual(restorePreviousTrack(["b", "c"], "a"), ["a", "b", "c"]);
  assert.deepEqual(restorePreviousTrack([], "a"), ["a"]);
});
