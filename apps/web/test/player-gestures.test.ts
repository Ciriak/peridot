import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  playerDismissQualifies,
  playerGestureAxis,
  trackSwipeDirection,
  trackSwipeQualifies,
} from "../app/lib/player-gestures.ts";

test("player gestures lock to the first dominant axis", () => {
  assert.equal(playerGestureAxis(3, 2), null);
  assert.equal(playerGestureAxis(12, 5), "horizontal");
  assert.equal(playerGestureAxis(-5, 14), "vertical");
  assert.equal(playerGestureAxis(12, 12), null);
});

test("horizontal player swipes map left to next and right to previous", () => {
  assert.equal(trackSwipeDirection(-80), "next");
  assert.equal(trackSwipeDirection(80), "previous");
  assert.equal(trackSwipeDirection(0), null);
});

test("horizontal track changes accept distance or a fast flick", () => {
  assert.equal(
    trackSwipeQualifies({ distance: -83, width: 412, speed: 0.1 }),
    true,
  );
  assert.equal(
    trackSwipeQualifies({ distance: -50, width: 412, speed: 0.45 }),
    true,
  );
  assert.equal(
    trackSwipeQualifies({ distance: -47, width: 412, speed: 0.9 }),
    false,
  );
  assert.equal(
    trackSwipeQualifies({ distance: -40, width: 412, speed: 0.1 }),
    false,
  );
});

test("only sufficient downward movement dismisses the player", () => {
  assert.equal(
    playerDismissQualifies({ distance: 185, height: 924, speed: 0.1 }),
    true,
  );
  assert.equal(
    playerDismissQualifies({ distance: 50, height: 924, speed: 0.6 }),
    true,
  );
  assert.equal(
    playerDismissQualifies({ distance: 47, height: 924, speed: 1 }),
    false,
  );
});

test("fullscreen player gestures use VueUse distances and the live queue previews", async () => {
  const [gestureSource, playerSource, librarySource] = await Promise.all([
    readFile(
      new URL("../app/composables/use-swipe-player.ts", import.meta.url),
      "utf8",
    ),
    readFile(
      new URL("../app/components/MobilePlayer.vue", import.meta.url),
      "utf8",
    ),
    readFile(
      new URL("../app/composables/use-library-player.ts", import.meta.url),
      "utf8",
    ),
  ]);

  assert.match(gestureSource, /useSwipe\(target,/);
  assert.match(gestureSource, /passive: false/);
  assert.match(gestureSource, /swipe\.lengthX\.value/);
  assert.match(gestureSource, /swipe\.lengthY\.value/);
  assert.match(gestureSource, /gestureStartedInScroll/);
  assert.match(gestureSource, /scrollArea\.value\?\.scrollTop/);
  assert.match(gestureSource, /touchmove/);
  assert.match(gestureSource, /trackSwipeQualifies\(/);
  assert.match(gestureSource, /playerDismissQualifies\(/);
  assert.match(gestureSource, /setTimeout\([\s\S]*close\(\)/);
  assert.match(
    gestureSource,
    /watch\(open,[\s\S]*if \(isOpen\) animatePlayerOpen\(\);[\s\S]*else resetGestureSurface\(\)/,
  );
  assert.match(
    gestureSource,
    /function animatePlayerOpen\(\)[\s\S]*surfaceOffsetY\.value = gestureHeight[\s\S]*requestAnimationFrame[\s\S]*surfaceOffsetY\.value = 0/,
  );
  assert.match(
    gestureSource,
    /function resetGestureSurface\(\)[\s\S]*surfaceOffsetY\.value = 0[\s\S]*carouselOffsetX\.value = 0/,
  );
  assert.match(playerSource, /playerCarouselDragging/);
  assert.match(playerSource, /previousTrackPreview/);
  assert.match(playerSource, /nextTrackPreview/);
  assert.match(librarySource, /const nextTrackPreview = computed/);
  assert.match(librarySource, /const previousTrackPreview = computed/);
  assert.match(librarySource, /function prepareNextTrackPreview/);
  assert.match(librarySource, /player-queue-history-track-details/);
  assert.match(
    librarySource,
    /const previousTrack = trackForId\(previousTrackId\);[\s\S]*rememberQueueTrackDetails\([\s\S]*previousTrack \? \[previousTrack\] : \[\]/,
  );
});
