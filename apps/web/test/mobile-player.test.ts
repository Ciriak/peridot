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
    /<MobilePlayer\s+v-model:open="mobilePlayerOpen"\s+@open-queue="openQueueFromMobilePlayer"\s*\/>/,
  );
  assert.match(layout, /class="flex min-h-0 flex-1 pb-20 md:pb-28"/);
  assert.match(
    layout,
    /class="fixed inset-x-0 bottom-0 z-30 isolate h-20 overflow-hidden border-t bg-card text-card-foreground md:h-28"/,
  );
  assert.match(
    layout,
    /watch\(currentPath, \(path\) => \{\s+mobileNavigation\.value = false;\s+mobilePlayerOpen\.value = false;/,
    "route changes dismiss the mobile fullscreen player",
  );

  const triggerStart = player.indexOf("<DialogTrigger as-child>");
  const triggerEnd = player.indexOf("</DialogTrigger>");
  assert.ok(triggerStart >= 0 && triggerEnd > triggerStart);
  const compactStart = player.indexOf("<div data-mobile-player");
  const compactProgress = player.slice(compactStart, triggerStart);
  assert.match(
    compactProgress,
    /<Slider[\s\S]*:model-value="\[elapsed\]"[\s\S]*:disabled="!currentTrackPlayable \|\| durationSeconds <= 0"[\s\S]*:aria-busy="loading"[\s\S]*class="absolute inset-x-0 top-0 z-10 h-5 items-start"[\s\S]*track-class="rounded-none"[\s\S]*hide-thumb[\s\S]*@update:model-value="seek\(\$event\?\.\[0\] \?\? 0\)"/,
    "the compact player places an edge-to-edge interactive progress line at its top",
  );
  assert.doesNotMatch(compactProgress, /\bpx-\d|\bpy-\d/);
  const trigger = player.slice(triggerStart, triggerEnd);
  assert.match(trigger, /t\('player\.openFullscreen'\)/);
  assert.match(
    trigger,
    /class="h-full min-w-0 flex-1 justify-start gap-3 px-3 text-left transition-none hover:bg-transparent hover:text-current active:bg-transparent active:text-current dark:hover:bg-transparent dark:active:bg-transparent"/,
    "the compact metadata trigger does not show a hover or touch background",
  );
  assert.match(trigger, /class="relative flex size-14 shrink-0/);
  assert.match(trigger, /active\.title/);
  assert.match(trigger, /trackArtistNames\(active\)\.join/);
  assert.doesNotMatch(trigger, /NuxtLink|TrackArtistLinks|TrackContextMenu/);

  const actionsStart = player.indexOf(
    'class="flex shrink-0 items-center gap-2 pr-3"',
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
  const player = await readFile(
    new URL("../app/components/MobilePlayer.vue", import.meta.url),
    "utf8",
  );

  assert.match(player, /<DialogRoot v-model:open="open">/);
  assert.match(player, /<DialogOverlay class="fixed inset-0 z-40/);
  assert.match(
    player,
    /<DialogContent\s+data-mobile-player-dialog\s+class="fixed inset-0 z-40 isolate flex h-dvh flex-col/,
  );
  assert.match(player, /<DialogTitle class="text-base font-semibold">/);
  assert.match(player, /<DialogDescription class="sr-only">/);
  assert.match(player, /t\('player\.closeFullscreen'\)/);
  assert.match(player, /icons\.caretDown/);
  assert.match(player, /@click="openQueue"/);
  assert.match(player, /open\.value = false;\s+emit\("openQueue"\)/);
  assert.match(player, /<TrackContextMenu[\s\S]*:track="active"/);
  assert.match(player, /<TrackArtistLinks/);
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
  assert.match(player, /class="mt-3"\s+large/);
  assert.match(
    player,
    /class="flex items-center justify-center gap-2 sm:gap-4"/,
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
    player,
    /t\("player\.noTrack"\)[\s\S]*t\("player\.scanLibrary"\)/,
  );
});
