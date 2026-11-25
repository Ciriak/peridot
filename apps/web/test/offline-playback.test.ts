import assert from "node:assert/strict";
import test from "node:test";
import { playbackSourcePlan } from "../app/lib/offline-playback.ts";

test("saved audio is tried before streaming while the server is connected", () => {
  assert.deepEqual(
    playbackSourcePlan({
      saved: true,
      serverLost: false,
      trackAvailable: true,
    }),
    {
      trySaved: true,
      allowStreaming: true,
    },
  );
});

test("connected playback streams directly when no saved copy is known", () => {
  assert.deepEqual(
    playbackSourcePlan({
      saved: false,
      serverLost: false,
      trackAvailable: true,
    }),
    {
      trySaved: false,
      allowStreaming: true,
    },
  );
});

test("lost servers and unavailable tracks never attempt streaming", () => {
  assert.deepEqual(
    playbackSourcePlan({
      saved: false,
      serverLost: true,
      trackAvailable: true,
    }),
    {
      trySaved: true,
      allowStreaming: false,
    },
  );
  assert.deepEqual(
    playbackSourcePlan({
      saved: true,
      serverLost: false,
      trackAvailable: false,
    }),
    {
      trySaved: true,
      allowStreaming: false,
    },
  );
});
