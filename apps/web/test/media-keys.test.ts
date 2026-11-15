import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { desktopMediaKeyAction } from "../app/lib/desktop-media-keys.ts";

test("desktop media keys map pressed shortcuts to player actions", () => {
  assert.equal(
    desktopMediaKeyAction({
      shortcut: "MediaPlayPause",
      state: "Pressed",
    }),
    "playPause",
  );
  assert.equal(
    desktopMediaKeyAction({
      shortcut: "MEDIATRACKNEXT",
      state: "Pressed",
    }),
    "next",
  );
  assert.equal(
    desktopMediaKeyAction({
      shortcut: "MediaTrackPrevious",
      state: "Pressed",
    }),
    "previous",
  );
});

test("desktop media keys ignore releases and unrelated shortcuts", () => {
  assert.equal(
    desktopMediaKeyAction({
      shortcut: "MediaPlayPause",
      state: "Released",
    }),
    null,
  );
  assert.equal(
    desktopMediaKeyAction({
      shortcut: "CommandOrControl+K",
      state: "Pressed",
    }),
    null,
  );
});

test("desktop media keys use the existing app-level player", async () => {
  const [app, integration, runtime] = await Promise.all([
    readFile(new URL("../app/app.vue", import.meta.url), "utf8"),
    readFile(
      new URL("../app/composables/use-desktop-media-keys.ts", import.meta.url),
      "utf8",
    ),
    readFile(new URL("../app/lib/desktop-runtime.ts", import.meta.url), "utf8"),
  ]);

  assert.match(app, /const player = useLibraryPlayer\(\{ audio: true \}\)/);
  assert.match(app, /useDesktopMediaKeys\(player\)/);
  assert.match(integration, /isTauriRuntime\(\)/);
  assert.match(runtime, /__TAURI_INTERNALS__/);
  assert.match(integration, /MediaPlayPause/);
  assert.match(integration, /MediaTrackNext/);
  assert.match(integration, /MediaTrackPrevious/);
  assert.match(integration, /await unregister\(\[\.\.\.MEDIA_SHORTCUTS\]\)/);
  assert.match(
    integration,
    /await register\(\[\.\.\.MEDIA_SHORTCUTS\], handleShortcut\)/,
  );
  assert.match(integration, /player\.togglePlayback\(\)/);
  assert.match(integration, /player\.next\(\)/);
  assert.match(integration, /player\.previous\(\)/);
  assert.match(integration, /onBeforeUnmount/);
});
