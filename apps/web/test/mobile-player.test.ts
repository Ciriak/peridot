import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("the compact mobile player anchors metadata and actions separately", async () => {
  const [layout, player] = await Promise.all([
    readFile(new URL("../app/layouts/default.vue", import.meta.url), "utf8"),
    readFile(
      new URL("../app/components/MobilePlayer.vue", import.meta.url),
      "utf8",
    ),
  ]);

  assert.match(
    layout,
    /<MobilePlayer\s+@open-queue="openQueueFromMobilePlayer"\s*\/>/,
  );
  assert.match(
    layout,
    /class="flex min-h-0 flex-1 touch-(?:pan-y|manipulation) overscroll-x-none pb-20 md:pb-28"/,
  );
  assert.match(
    layout,
    /class="fixed inset-x-0 bottom-0 z-30 isolate h-20 overflow-hidden border-t bg-card text-card-foreground md:h-28"/,
  );
  assert.doesNotMatch(layout, /mobilePlayerOpen/);

  const compactStart = player.indexOf("<div data-mobile-player");
  const metadataStart = player.indexOf(
    '<div class="flex min-h-0 flex-1">',
    compactStart,
  );
  assert.ok(metadataStart > compactStart);
  const compactProgress = player.slice(compactStart, metadataStart);
  assert.match(
    compactProgress,
    /<Slider[\s\S]*:model-value="\[elapsed\]"[\s\S]*:disabled="!currentTrackPlayable \|\| durationSeconds <= 0"[\s\S]*:aria-busy="loading"[\s\S]*class="absolute inset-x-0 top-0 z-10 h-5 items-start"[\s\S]*track-class="rounded-none"[\s\S]*hide-thumb[\s\S]*@update:model-value="seek\(\$event\?\.\[0\] \?\? 0\)"/,
    "the compact player places an edge-to-edge interactive progress line at its top",
  );
  assert.doesNotMatch(compactProgress, /\bpx-\d|\bpy-\d/);
  const actionsStart = player.indexOf(
    'class="flex shrink-0 items-center gap-2 pr-3"',
    metadataStart,
  );
  assert.ok(actionsStart > metadataStart);
  const metadata = player.slice(metadataStart, actionsStart);
  assert.equal(
    metadata.match(/t\('player\.openFullscreen'\)/g)?.length,
    2,
    "the artwork and title open the fullscreen player",
  );
  assert.match(
    metadata,
    /class="flex h-full w-0 min-w-0 max-w-full flex-1 items-center gap-3 overflow-hidden px-3"/,
    "the compact metadata trigger shrinks before the fixed action group",
  );
  assert.match(
    metadata,
    /<span class="w-0 min-w-0 max-w-full flex-1 overflow-hidden">/,
    "the compact metadata text is clipped before the actions",
  );
  assert.match(metadata, /class="relative size-14 shrink-0/);
  assert.match(metadata, /active\.title/);
  assert.match(
    metadata,
    /<\/Button>\s*<\/DialogTrigger>\s*<ScrollingText[\s\S]*?<TrackArtistLinks[\s\S]*?:artists="trackArtistNames\(active\)"/,
    "artist credits sit outside the fullscreen trigger and open artist pages",
  );
  const actionsEnd = player.indexOf("</div>", actionsStart);
  assert.ok(actionsStart >= 0 && actionsEnd > actionsStart);
  const actions = player.slice(actionsStart, actionsEnd);
  assert.ok(
    actions.indexOf("t('player.next')") >= 0 &&
      actions.indexOf("t('player.next')") < actions.indexOf("<LikeButton") &&
      actions.indexOf("<LikeButton") <
        actions.indexOf('@click="togglePlayback"'),
    "the compact actions place next before like and play/pause",
  );
  assert.match(
    actions,
    /class="size-12 transition-none hover:bg-transparent hover:text-current active:bg-transparent active:text-current dark:hover:bg-transparent dark:active:bg-transparent"[\s\S]*class="-ml-1\.5 transition-none hover:bg-transparent hover:text-current active:bg-transparent active:text-current dark:hover:bg-transparent dark:active:bg-transparent"[\s\S]*class="size-12 rounded-full transition-none hover:bg-primary active:bg-primary"/,
    "the compact action buttons keep their resting appearance on hover and touch and tighten next-to-like spacing",
  );
});

test("the fullscreen mobile player exposes accessible complete controls", async () => {
  const [player, panel] = await Promise.all([
    readFile(
      new URL("../app/components/MobilePlayer.vue", import.meta.url),
      "utf8",
    ),
    readFile(
      new URL("../app/components/MobilePlayerTrackPanel.vue", import.meta.url),
      "utf8",
    ),
  ]);

  assert.match(
    player,
    /const open = computed<boolean>\(\{\s+get: \(\) => isMobilePlayerRoute\(route\.query\),/,
  );
  assert.match(
    player,
    /router\.push\(\{ query: withMobilePlayerRoute\(route\.query\) \}\)/,
  );
  assert.match(
    player,
    /if \(historyState\?\.back\) \{\s+router\.back\(\);\s+return;/,
  );
  assert.match(player, /<DialogRoot v-model:open="open">/);
  assert.match(
    player,
    /<DialogOverlay[\s\S]*class="fixed inset-0 z-40[\s\S]*:style="playerOverlayStyle"/,
  );
  assert.match(
    player,
    /<DialogContent\s+data-mobile-player-dialog\s+class="fixed inset-0 z-40 isolate flex h-dvh flex-col[\s\S]*:style="playerSurfaceStyle"/,
  );
  assert.match(player, /ref="playerGestureSurface"/);
  assert.match(player, /ref="playerScrollArea"/);
  assert.match(player, /useSwipePlayer\(\{/);
  assert.match(
    player,
    /target: playerGestureSurface,[\s\S]*scrollArea: playerScrollArea,[\s\S]*open,/,
  );
  assert.match(player, /nextTrack: nextTrackPreview/);
  assert.match(player, /previousTrack: previousTrackPreview/);
  assert.match(player, /prepareNextTrack: prepareNextTrackPreview/);
  assert.match(player, /<DialogTitle class="text-base font-semibold">/);
  assert.match(player, /<DialogDescription class="sr-only">/);
  assert.match(player, /t\('player\.closeFullscreen'\)/);
  assert.match(player, /icons\.caretDown/);
  assert.match(player, /@click="openQueue"/);
  assert.match(player, /closeFullscreen\(\);\s+emit\("openQueue"\)/);
  assert.match(
    player,
    /data-mobile-player-carousel[\s\S]*class="flex h-full min-h-0 w-full"[\s\S]*:style="playerCarouselStyle"/,
  );
  assert.equal(
    player.match(/<MobilePlayerTrackPanel/g)?.length,
    3,
    "previous, active, and next tracks occupy the carousel positions",
  );
  assert.match(
    player,
    /class="flex h-full min-h-0 w-full shrink-0 overflow-hidden transition-opacity[\s\S]*'opacity-0'[\s\S]*inert\s+aria-hidden="true"[\s\S]*:track="previousTrackPreview"/,
  );
  assert.match(
    player,
    /:track="active"[\s\S]*interactive[\s\S]*@play="playActiveTrack"/,
  );
  assert.match(
    player,
    /class="flex h-full min-h-0 w-full shrink-0 overflow-hidden transition-opacity[\s\S]*'opacity-0'[\s\S]*inert\s+aria-hidden="true"[\s\S]*:track="nextTrackPreview"/,
  );
  assert.match(
    player,
    /class="flex h-full min-h-0 w-full shrink-0 overflow-hidden"[\s\S]*:track="active"/,
  );
  assert.match(
    player,
    /ref="playerScrollArea"\s+class="flex min-h-0 flex-1 flex-col overflow-hidden px-4 py-4 sm:px-6"/,
    "the fullscreen player never becomes a scroll container",
  );
  assert.match(
    player,
    /data-mobile-player-carousel\s+class="min-h-0 flex-1 overflow-hidden"/,
    "the artwork area absorbs only the height left by the controls",
  );
  assert.match(
    panel,
    /class="flex h-full min-w-0 flex-col overflow-hidden text-center"/,
  );
  assert.match(
    panel,
    /class="flex min-h-0 w-full flex-1 items-end justify-center pt-2"/,
    "the shrinking cover stays above its title instead of separating from it",
  );
  assert.match(
    panel,
    /class="relative mx-auto flex aspect-square h-full max-h-72 w-auto max-w-full shrink-0 items-center justify-center overflow-hidden rounded-xl bg-muted text-muted-foreground shadow-lg sm:max-h-96"/,
    "the square cover shrinks to fit the remaining vertical space and caps its width",
  );
  assert.match(panel, /TrackContextMenu/);
  assert.match(panel, /<TrackArtistLinks/);
  assert.match(panel, /v-if="interactive && track"/);
  assert.match(
    player,
    /v-if="loading"[\s\S]*class="pointer-events-none absolute inset-x-0 top-0 z-30 h-1 overflow-hidden"[\s\S]*bg-primary\/40 motion-reduce:block[\s\S]*from-transparent via-primary to-transparent transition-transform duration-1000 ease-in-out motion-reduce:hidden[\s\S]*loadingRayAtRight \? 'translate-x-full' : '-translate-x-full'/,
    "the fullscreen player uses the desktop loading ray at the top edge",
  );
  assert.doesNotMatch(player, /player\.buffering|PeridotSpinner/);
  assert.match(player, /const loadingRayAtRight = ref\(false\)/);
  assert.match(player, /loadingRayTimeout = setTimeout\(\(\) =>/);
  assert.match(player, /:thumb-label="t\('player\.position'\)"/);
  assert.match(player, /@click="toggleRandomization"/);
  assert.match(player, /@click="previous"/);
  assert.match(player, /@click="togglePlayback"/);
  assert.match(player, /@click="next\(\)"/);
  assert.match(player, /@click="cycleRepeatMode"/);
  assert.match(
    player,
    /class="size-12"\s+:aria-label="t\('player\.closeFullscreen'\)"/,
  );
  assert.match(
    player,
    /class="ml-auto size-12"\s+:aria-label="t\('player\.openQueue'\)"/,
  );
  assert.match(
    panel,
    /class="mt-2 flex w-full shrink-0 justify-end"[\s\S]*<LikeButton\s+large/,
    "the fullscreen like control sits on the right",
  );
  assert.match(
    player,
    /class="flex shrink-0 items-center justify-center gap-2 sm:gap-4"/,
  );
  assert.equal(
    player.match(/class="group(?: relative)? size-12"/g)?.length,
    4,
    "shuffle, previous, next, and repeat use 48px targets",
  );
  assert.match(player, /class="size-16 rounded-full"/);
  assert.match(player, /class="size-8"/);
  assert.doesNotMatch(player, /class="[^"]*\bvolume\b|id="volume"/);
  assert.match(
    panel,
    /t\("player\.noTrack"\)[\s\S]*t\("player\.scanLibrary"\)/,
  );
});
