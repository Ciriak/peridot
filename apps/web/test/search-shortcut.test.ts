import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  isSearchShortcut,
  searchShortcutModifier,
} from "../app/lib/search-shortcut.ts";

function shortcutEvent(
  overrides: Partial<Parameters<typeof isSearchShortcut>[0]> = {},
) {
  return {
    altKey: false,
    ctrlKey: false,
    isComposing: false,
    key: "k",
    metaKey: false,
    shiftKey: false,
    ...overrides,
  };
}

test("search shortcut accepts Ctrl or Command plus K", () => {
  assert.equal(isSearchShortcut(shortcutEvent({ ctrlKey: true })), true);
  assert.equal(isSearchShortcut(shortcutEvent({ metaKey: true })), true);
  assert.equal(
    isSearchShortcut(shortcutEvent({ key: "K", ctrlKey: true })),
    true,
  );
});

test("search shortcut ignores incomplete or modified key combinations", () => {
  assert.equal(isSearchShortcut(shortcutEvent()), false);
  assert.equal(isSearchShortcut(shortcutEvent({ key: undefined })), false);
  assert.equal(
    isSearchShortcut(shortcutEvent({ key: "j", ctrlKey: true })),
    false,
  );
  assert.equal(
    isSearchShortcut(shortcutEvent({ altKey: true, ctrlKey: true, key: "k" })),
    false,
  );
  assert.equal(
    isSearchShortcut(
      shortcutEvent({ ctrlKey: true, key: "k", shiftKey: true }),
    ),
    false,
  );
  assert.equal(
    isSearchShortcut(
      shortcutEvent({ ctrlKey: true, isComposing: true, key: "k" }),
    ),
    false,
  );
});

test("search shortcut display follows the platform modifier", () => {
  assert.equal(searchShortcutModifier("MacIntel"), "command");
  assert.equal(searchShortcutModifier("iPhone"), "command");
  assert.equal(searchShortcutModifier("Win32"), "ctrl");
  assert.equal(searchShortcutModifier("Linux x86_64"), "ctrl");
});

test("top-bar search advertises and opens from the global shortcut", async () => {
  const [app, layout] = await Promise.all([
    readFile(new URL("../app/app.vue", import.meta.url), "utf8"),
    readFile(new URL("../app/layouts/default.vue", import.meta.url), "utf8"),
  ]);

  assert.match(
    layout,
    /import \{ Kbd, KbdGroup \} from "@peridot\/ui\/components\/ui\/kbd"/,
  );
  assert.match(
    app,
    /window\.addEventListener\("keydown", handleSearchShortcut\)/,
  );
  assert.match(
    app,
    /window\.removeEventListener\("keydown", handleSearchShortcut\)/,
  );
  assert.match(app, /event\.preventDefault\(\);[\s\S]*void openSearch\(\)/);
  assert.match(app, /if \(!token\.value\) return/);
  assert.match(
    app,
    /document\.querySelector<HTMLInputElement>\("#global-search"\)/,
  );
  assert.match(layout, /id="global-search"/);
  assert.match(layout, /aria-keyshortcuts="Control\+K Meta\+K"/);
  assert.match(
    layout,
    /<KbdGroup[\s\S]*?<Kbd>[\s\S]*?shortcutModifier === "command"/,
  );
  assert.match(
    layout,
    /<KbdGroup[\s\S]*?class="[^"]*hidden[^"]*md:flex/,
    "The shortcut keycaps stay hidden on mobile",
  );
  assert.match(
    layout,
    /class="pl-9 pr-3 md:pr-16"/,
    "The input only reserves keycap space on desktop",
  );
});
