import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  shouldSettleSidebarOpen,
  sidebarProgressAfterDrag,
} from "../app/lib/sidebar-swipe.ts";

test("sidebar drag progress follows the finger from either edge state", () => {
  assert.equal(
    sidebarProgressAfterDrag({
      startProgress: 0,
      deltaX: 112,
      width: 224,
    }),
    0.5,
  );
  assert.equal(
    sidebarProgressAfterDrag({
      startProgress: 1,
      deltaX: -112,
      width: 224,
    }),
    0.5,
  );
  assert.equal(
    sidebarProgressAfterDrag({
      startProgress: 0,
      deltaX: -40,
      width: 224,
    }),
    0,
  );
  assert.equal(
    sidebarProgressAfterDrag({
      startProgress: 1,
      deltaX: 40,
      width: 224,
    }),
    1,
  );
});

test("sidebar settles open after crossing the midpoint", () => {
  assert.equal(shouldSettleSidebarOpen(0.49), false);
  assert.equal(shouldSettleSidebarOpen(0.5), true);
});

test("both navigation layouts share swipe handling and a closing backdrop", async () => {
  const [swipeSource, defaultLayout, settingsLayout] = await Promise.all([
    readFile(
      new URL("../app/composables/use-swipe-sidebar.ts", import.meta.url),
      "utf8",
    ),
    readFile(new URL("../app/layouts/default.vue", import.meta.url), "utf8"),
    readFile(new URL("../app/layouts/settings.vue", import.meta.url), "utf8"),
  ]);

  assert.match(
    swipeSource,
    /import \{ useEventListener, useMediaQuery, useSwipe \}/,
  );
  assert.match(swipeSource, /useSwipe\(target,/);
  assert.match(swipeSource, /passive: true/);
  assert.match(swipeSource, /\[swipe\.lengthX, swipe\.lengthY\]/);
  assert.match(swipeSource, /sidebarProgressAfterDrag\(/);
  assert.match(swipeSource, /shouldSettleSidebarOpen\(/);
  assert.match(swipeSource, /drawerStyle,/);

  for (const layout of [defaultLayout, settingsLayout]) {
    assert.match(
      layout,
      /dragging: mobileNavigationDragging[\s\S]*interactive: mobileNavigationInteractive[\s\S]*drawerStyle: mobileNavigationTransform[\s\S]*backdropStyle: mobileNavigationBackdropStyle[\s\S]*\} = useSwipeSidebar\(\s*navigationSwipeArea,\s*navigationDrawer,\s*mobileNavigation,?\s*\)/,
    );
    assert.match(layout, /ref="navigationSwipeArea"/);
    assert.match(layout, /ref="navigationDrawer"/);
    assert.match(layout, /data-sidebar-backdrop/);
    assert.match(layout, /:style="mobileNavigationBackdropStyle"/);
    assert.match(
      layout,
      /class="fixed [^"]*bg-background\/80 backdrop-blur-sm md:hidden"/,
    );
    assert.match(layout, /bottom-20 z-40|inset-0 z-40/);
    assert.match(layout, /z-50 flex w-56/);
    assert.match(layout, /:style="mobileNavigationTransform"/);
    assert.match(layout, /mobileNavigationDragging[\s\S]*transition-none/);
    assert.match(layout, /transition-transform duration-300 ease-out/);
    assert.match(layout, /:inert="navigationInert"/);
    assert.match(layout, /@click="mobileNavigation = false"/);
  }
  assert.match(
    defaultLayout,
    /touch-manipulation overscroll-x-none/,
    "Horizontal controls can consume their own touch gestures",
  );
  assert.match(settingsLayout, /touch-pan-y[^"]*overscroll-x-none/);
});
