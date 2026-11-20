import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  nextPlaybackStartRetry,
  PLAYBACK_START_MAX_ATTEMPTS,
  PLAYBACK_START_MAX_RETRIES,
} from "../app/lib/playback-start-retry.ts";

test("playback start allows three total attempts", () => {
  assert.equal(PLAYBACK_START_MAX_ATTEMPTS, 3);
  assert.equal(PLAYBACK_START_MAX_RETRIES, 2);
  assert.equal(nextPlaybackStartRetry(0), 1);
  assert.equal(nextPlaybackStartRetry(1), 2);
  assert.equal(nextPlaybackStartRetry(2), null);
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
    /if \(!blocked && \(await retryTrackStart\(trackId, attempt, false\)\)\) \{\s+return;\s+\}\s+if \(!blocked && skipFailedTrack\(trackId, attempt\)\) return;\s+playing\.value = false;\s+error\.value = blocked/,
    "Non-policy play rejections retry, then skip before exposing an error",
  );

  const mediaFailure = player.slice(
    player.indexOf("const handleError = () =>"),
    player.indexOf("const handleWaiting = () =>"),
  );
  assert.match(
    mediaFailure,
    /if \(startFailed\) \{\s+void retryTrackStart\([\s\S]*?\.then\(\(retried\) => \{[\s\S]*?if \(skipFailedTrack\(failedTrackId, failedAttempt\)\) return;[\s\S]*?playing\.value = false;\s+error\.value = t\("error\.audioDecode"\)/,
    "Media errors retry, then skip before showing a decode failure",
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
    /if \(await retryTrackStart\(trackId, attempt, false\)\) return;[\s\S]*?if \(skipFailedTrack\(trackId, attempt\)\) return;[\s\S]*?playing\.value = false;[\s\S]*?error\.value = playbackError/,
    "Preparation failures retry, then skip before changing to the error state",
  );
  assert.match(
    player,
    /function skipFailedTrack\([\s\S]*?next\(true\);[\s\S]*?return currentTrackId\.value !== trackId;/,
    "An exhausted track start advances past the failed queue item",
  );
});
