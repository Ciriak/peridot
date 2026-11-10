import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("the player exposes randomize and a persistent right-side queue drawer", async () => {
  const [layout, drawer, player] = await Promise.all([
    readFile(new URL("../app/layouts/default.vue", import.meta.url), "utf8"),
    readFile(
      new URL("../app/components/QueueDrawer.vue", import.meta.url),
      "utf8",
    ),
    readFile(
      new URL("../app/composables/use-library-player.ts", import.meta.url),
      "utf8",
    ),
  ]);

  assert.match(layout, /aria-label="Randomize upcoming tracks"/);
  assert.match(layout, /:disabled="upcomingTracks\.length < 2"/);
  assert.match(layout, /@click="randomizeQueue"/);
  assert.match(
    layout,
    /:aria-label="queueOpen \? 'Close queue' : 'Open queue'"/,
  );
  assert.match(layout, /:aria-expanded="queueOpen"/);
  assert.match(layout, /data-queue-toggle/);
  assert.doesNotMatch(layout, /@pointerdown\.stop/);
  assert.match(layout, /@click="queueOpen = !queueOpen"/);
  assert.match(layout, /<QueueDrawer v-model:open="queueOpen" \/>/);
  assert.ok(
    layout.indexOf('aria-label="Open queue"') < layout.indexOf('id="volume"'),
    "queue control appears before the volume control",
  );

  assert.doesNotMatch(drawer, /from "reka-ui"/);
  assert.doesNotMatch(drawer, /DrawerRoot|DrawerContent|DrawerPortal/);
  assert.match(drawer, /<Teleport to="body">/);
  assert.match(drawer, /role="dialog"/);
  assert.match(drawer, /aria-modal="false"/);
  assert.match(drawer, /event\.key !== "Escape"/);
  assert.match(drawer, /fixed top-0 right-0 bottom-48/);
  assert.match(drawer, /md:bottom-28/);
  assert.doesNotMatch(drawer, /\bh-dvh\b/);
  assert.doesNotMatch(drawer, /\bpb-52\b|\bpb-32\b/);
  assert.match(layout, /fixed inset-x-0 bottom-0 z-30/);
  assert.match(drawer, />\s*Now playing\s*</);
  assert.match(drawer, /useSortable\(queueList, sortableTracks/);
  assert.doesNotMatch(drawer, /handle: "\.queue-drag-handle"/);
  assert.match(
    drawer,
    /onEnd: \(\{ oldIndex, newIndex \}\) => \{[\s\S]*sortableTracks\.value = next;[\s\S]*reorderQueue\(next\.map/,
  );
  assert.doesNotMatch(drawer, /data-reka-swipe-ignore/);
  assert.doesNotMatch(drawer, /@pointerdown\.stop/);
  assert.match(drawer, /removeFromQueue\(track\.id\)/);
  assert.match(drawer, /<TrackArtistLinks :artists="track\.artists" \/>/);
  assert.doesNotMatch(drawer, /@click="play\(track\.id/);

  assert.match(player, /fetchQueue\(/);
  assert.match(player, /replaceQueue\(/);
  assert.match(player, /queueWriteTail/);
  assert.match(player, /saveQueue\(normalized\)/);
  assert.match(player, /queueAuthScope/);
  assert.match(player, /queueHistory/);
});

test("track context menus add a selected track as the next queue entry", async () => {
  const menu = await readFile(
    new URL("../app/components/TrackContextMenu.vue", import.meta.url),
    "utf8",
  );
  assert.match(menu, /Add to queue/);
  assert.match(menu, /addTrackNext|addToQueue\(props\.track\.id\)/);
  assert.doesNotMatch(menu, /currentTrackId === track\.id/);
  assert.match(menu, /!queueLoaded/);
  assert.match(menu, /notifyAddedToQueue\(props\.track\.title\)/);
});
