import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("the persistent player controls a native audio element", async () => {
  const [player, layout, app] = await Promise.all([
    readFile(
      new URL("../app/composables/use-library-player.ts", import.meta.url),
      "utf8",
    ),
    readFile(new URL("../app/layouts/default.vue", import.meta.url), "utf8"),
    readFile(new URL("../app/app.vue", import.meta.url), "utf8"),
  ]);

  assert.match(player, /new Audio\(\)/);
  assert.match(player, /createPlaybackToken\(/);
  assert.match(player, /trackAudioUrl\(/);
  assert.match(player, /downloadTrack\(trackId = currentTrackId\.value\)/);
  assert.match(player, /anchor\.download = trackDownloadFileName\(track\)/);
  assert.match(player, /notifyTrackDownloadFailed\(/);
  assert.match(player, /addEventListener\("timeupdate"/);
  assert.match(player, /addEventListener\("loadedmetadata"/);
  assert.match(player, /addEventListener\("ended"/);
  assert.match(player, /audio\.currentTime = elapsed\.value/);
  assert.match(player, /audio\.volume = value \/ 100/);
  assert.match(
    player,
    /watch\(elapsed, \(position\)/,
    "Changing the shared position seeks the native media",
  );
  assert.match(player, /audio\.currentTime = position/);
  assert.match(player, /readPersistedPlayerState\(window\.localStorage/);
  assert.match(player, /savePersistedPlayerState\(window\.localStorage/);
  assert.match(
    player,
    /watch\(\s*\[queueTrackIds, activeTrackId, shuffleEnabled, shuffleTrackIds, elapsed\]/,
    "Queue changes and progress updates are mirrored to local storage",
  );
  assert.match(
    player,
    /positionSeconds: elapsed\.value/,
    "The persisted snapshot includes playback progress",
  );
  assert.match(
    player,
    /queueTrackIds: queueTrackIds\.value/,
    "The persisted snapshot includes the complete queue",
  );
  assert.match(
    player,
    /previous !== undefined && trackId !== previousTrackId/,
    "Remounting the player preserves the current elapsed position",
  );
  assert.match(
    app,
    /useLibraryPlayer\(\{ audio: true \}\)/,
    "Audio playback is mounted at the persistent application root",
  );
  assert.doesNotMatch(
    layout,
    /useLibraryPlayer\(\{ audio: true \}\)/,
    "Changing layouts must not tear down audio playback",
  );
  assert.match(layout, /currentCoverUrl = computed\(/);
  assert.match(layout, /<img[\s\S]*object-cover/);
  assert.match(layout, /<Icon v-else :icon="icons\.music"/);
  assert.match(
    layout,
    /<TrackArtistLinks v-if="active" :artists="active\.artists" \/>/,
    "The active track's credited artists link from the persistent player",
  );
  assert.match(layout, /@click="togglePlayback"/);
  assert.match(layout, /@click="cycleRepeatMode"/);
  assert.match(layout, /@update:model-value="seek\(\$event\?\.\[0\] \?\? 0\)"/);
  assert.match(
    layout,
    /class="min-h-11 flex-1"[\s\S]*thumb-label="Playback position"/,
    "The playback progress uses a taller invisible hit target than its track",
  );
  assert.match(
    layout,
    /@update:model-value="setVolume\(\$event\?\.\[0\] \?\? 0\)"/,
  );
  assert.match(
    layout,
    /:icon="icons\.volume"[\s\S]*thumb-label="Playback volume"/,
  );
  assert.doesNotMatch(layout, /<Spinner/);
  assert.match(
    layout,
    /:icon="playing \? icons\.pause : icons\.play"/,
    "The player switches directly from play to pause",
  );
  assert.match(layout, /role="alert"/);
  assert.match(player, /useState<RepeatMode>\("player-repeat-mode"/);
  assert.match(
    player,
    /repeatMode\.value === "one"[\s\S]*playbackRequest\.value\+\+/,
  );
  assert.match(
    player,
    /repeatMode\.value === "all"[\s\S]*repeatCycleTrackIds\.value/,
  );
  assert.match(
    layout,
    /repeatMode === 'one' \? icons\.repeatOne : icons\.repeat/,
  );
  assert.match(layout, /:aria-pressed="repeatMode !== 'off'"/);
  assert.match(
    layout,
    /repeatMode === 'off'\s*\?\s*'text-muted-foreground'\s*:\s*'text-primary group-hover:text-primary group-active:text-primary'/,
    "Enabled repeat modes color the icon primary",
  );
  assert.match(
    layout,
    /absolute right-1 top-1 text-xs font-semibold leading-none text-primary/,
    "The repeat-one marker floats at the icon's top-right",
  );
  assert.doesNotMatch(
    layout,
    /active:bg-primary|bg-primary text-primary-foreground/,
    "Player hover and press states color the icon instead of the button",
  );
});
