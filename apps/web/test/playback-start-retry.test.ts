import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  nextPlaybackStartRetry,
  PLAYBACK_START_MAX_RETRIES,
} from "../app/lib/playback-start-retry.ts";

test("playback start allows three retries after the initial attempt", () => {
  assert.equal(PLAYBACK_START_MAX_RETRIES, 3);
  assert.equal(nextPlaybackStartRetry(0), 1);
  assert.equal(nextPlaybackStartRetry(1), 2);
  assert.equal(nextPlaybackStartRetry(2), 3);
  assert.equal(nextPlaybackStartRetry(3), null);
});

test("the player retries start failures before exposing their error state", async () => {
  const player = await readFile(
    new URL("../app/composables/use-library-player.ts", import.meta.url),
    "utf8",
  );

  const playFailure = player.slice(
    player.indexOf("async function playLoadedTrack"),
    player.indexOf("async function loadOfflineTrack"),
  );
  assert.match(
    playFailure,
    /if \(!blocked && \(await retryTrackStart\(trackId, attempt, false\)\)\) \{\s+return;\s+\}\s+playing\.value = false;\s+error\.value = blocked/,
    "Non-policy play rejections retry before changing to the error state",
  );

  const mediaFailure = player.slice(
    player.indexOf("const handleError = () =>"),
    player.indexOf("const handleWaiting = () =>"),
  );
  assert.match(
    mediaFailure,
    /if \(startFailed\) \{\s+void retryTrackStart\([\s\S]*?\.then\(\(retried\) => \{[\s\S]*?playing\.value = false;\s+error\.value = t\("error\.audioDecode"\)/,
    "Media errors before the first playing event retry before showing decode failure",
  );
  assert.match(
    player,
    /playbackStartRetries = 0;\s+playbackStartedTrackId = loadedTrackId;/,
    "A successful playing event ends the bounded start retry window",
  );

  const prepareFailure = player.slice(
    player.indexOf("async function prepareTrack"),
    player.indexOf(
      "onMounted(() => {",
      player.indexOf("async function prepareTrack"),
    ),
  );
  assert.match(
    prepareFailure,
    /if \(await retryTrackStart\(trackId, attempt, false\)\) return;[\s\S]*?playing\.value = false;[\s\S]*?error\.value = playbackError/,
    "Preparation failures retry before changing to the error state",
  );
});
