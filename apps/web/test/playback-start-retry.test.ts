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
    /if \(!blocked && \(await retryTrackStart\(mediaId, attempt, false\)\)\) \{\s+return;\s+\}\s+if \(!blocked && skipFailedTrack\(mediaId, attempt\)\) return;\s+playing\.value = false;\s+error\.value = blocked/,
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
    /if \(await retryTrackStart\(mediaId, attempt, false\)\) return;[\s\S]*?if \(skipFailedTrack\(mediaId, attempt\)\) return;[\s\S]*?playing\.value = false;[\s\S]*?error\.value = playbackError/,
    "Preparation failures retry, then skip before changing to the error state",
  );
  assert.match(
    player,
    /function skipFailedTrack\([\s\S]*?next\(true\);[\s\S]*?unavailableTrackIds\.value = \[\.\.\.unavailableTrackIds\.value, mediaId\];[\s\S]*?return currentTrackId\.value !== mediaId;/,
    "An exhausted track start is marked unavailable, then advances",
  );
  assert.match(
    player,
    /const notifiedPlaybackFailureIds = new Set\(unavailableTrackIds\.value\);[\s\S]*?watch\(\s*unavailableTrackIds,[\s\S]*?notifyPlaybackFailed\(trackForId\(mediaId\)\?\.title\);[\s\S]*?flush: "post"/,
    "A newly unavailable track exposes one playback failure toast",
  );

  assert.match(
    player,
    /const repeatAll = repeatMode\.value === "all" && !forceAdvance;[\s\S]*?advanceShuffle\([\s\S]*?repeatAll,/,
    "Automatic skip does not renew a shuffled repeat-all cycle",
  );
});

test("playback-failed tracks use unavailable controls everywhere", async () => {
  const [player, table, playlist, card, quickPick, queue, menu] =
    await Promise.all([
      readFile(
        new URL("../app/composables/use-library-player.ts", import.meta.url),
        "utf8",
      ),
      readFile(
        new URL("../app/components/TrackTable.vue", import.meta.url),
        "utf8",
      ),
      readFile(
        new URL("../app/components/PlaylistTrackList.vue", import.meta.url),
        "utf8",
      ),
      readFile(
        new URL("../app/components/CatalogCard.vue", import.meta.url),
        "utf8",
      ),
      readFile(
        new URL("../app/components/QuickPickTile.vue", import.meta.url),
        "utf8",
      ),
      readFile(
        new URL("../app/components/QueueDrawer.vue", import.meta.url),
        "utf8",
      ),
      readFile(
        new URL("../app/components/TrackContextMenu.vue", import.meta.url),
        "utf8",
      ),
    ]);

  assert.match(
    player,
    /const unavailableTrackIds = useState<string\[\]>\(\s*"player-unavailable-track-ids"/,
    "Playback-failed tracks use shared player state",
  );
  assert.match(
    player,
    /const unavailableTrackIdSet = computed\(\s*\(\) => new Set\(unavailableTrackIds\.value\)/,
    "The player exposes one reactive unavailable-track set",
  );
  assert.match(
    player,
    /function isTrackPlayableForPlayer\(track: MediaResponse\): boolean \{[\s\S]*unavailableTrackIds: unavailableTrackIdSet\.value/,
    "Failed tracks are excluded from playback queue selection",
  );
  assert.match(
    player,
    /function retryUnavailableTrack\(track: PlayerTrack\) \{[\s\S]*?unavailableTrackIds\.value = unavailableTrackIds\.value\.filter\([\s\S]*?play\(track, true\);/,
    "An explicit unavailable-track retry clears its failed state before playback",
  );

  for (const [name, source] of [
    ["track table", table],
    ["playlist list", playlist],
    ["catalog card", card],
    ["quick pick", quickPick],
    ["queue", queue],
    ["track menu", menu],
  ] as const) {
    assert.match(
      source,
      /unavailableTrackIdSet/,
      `${name} consumes the shared unavailable-track state`,
    );
  }
});

test("unavailable tracks expose a native title label", async () => {
  const files = await Promise.all([
    ["track table", "../app/components/TrackTable.vue"],
    ["playlist list", "../app/components/PlaylistTrackList.vue"],
    ["catalog card", "../app/components/CatalogCard.vue"],
    ["quick pick", "../app/components/QuickPickTileContent.vue"],
    ["queue", "../app/components/QueueDrawer.vue"],
    ["track menu", "../app/components/TrackContextMenu.vue"],
    ["mobile player", "../app/components/MobilePlayer.vue"],
    ["desktop player", "../app/layouts/default.vue"],
  ] as const).then((sources) =>
    Promise.all(
      sources.map(async ([name, path]) => [
        name,
        await readFile(new URL(path, import.meta.url), "utf8"),
      ]),
    ),
  );

  for (const [name, source] of files) {
    assert.match(
      source,
      /trackTable\.unavailableTitle/,
      `${name} exposes the unavailable title label`,
    );
  }

  const locale = JSON.parse(
    await readFile(
      new URL("../i18n/locales/en-US.json", import.meta.url),
      "utf8",
    ),
  ) as Record<string, string>;
  assert.equal(
    locale["trackTable.unavailableTitle"],
    "This title is unavailable.",
  );
});
