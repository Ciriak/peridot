import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { navigateBack } from "../app/lib/navigation.ts";

test("back navigation goes to the previous browser history entry", () => {
  let backCalls = 0;
  let homeCalls = 0;

  navigateBack(
    {
      back() {
        backCalls += 1;
      },
    },
    () => {
      homeCalls += 1;
    },
    { length: 2, state: { back: "/artists" } },
  );

  assert.equal(backCalls, 1);
  assert.equal(homeCalls, 0);
});

test("back navigation falls back to home without previous app history", () => {
  for (const browserHistory of [
    undefined,
    { length: 1, state: { back: "/artists" } },
    { length: 2, state: { back: null } },
    { length: 2, state: null },
  ]) {
    let backCalls = 0;
    let homeCalls = 0;

    navigateBack(
      {
        back() {
          backCalls += 1;
        },
      },
      () => {
        homeCalls += 1;
      },
      browserHistory,
    );

    assert.equal(backCalls, 0);
    assert.equal(homeCalls, 1);
  }
});

test("catalog detail surfaces use the shared history-aware back button", async () => {
  const button = await readFile(
    new URL("../app/components/BackButton.vue", import.meta.url),
    "utf8",
  );
  const surfaces = await Promise.all(
    [
      "../app/pages/albums/[album].vue",
      "../app/pages/artists/[artist].vue",
      "../app/pages/playlists/[playlist].vue",
      "../app/components/MediaCollectionDetail.vue",
    ].map(async (path) => ({
      path,
      source: await readFile(new URL(path, import.meta.url), "utf8"),
    })),
  );

  for (const surface of surfaces) {
    assert.match(
      surface.source,
      /import BackButton from/,
      `${surface.path} imports the shared back button`,
    );
    assert.match(
      surface.source,
      /<BackButton \/>/,
      `${surface.path} renders the shared back button`,
    );
  }

  assert.match(
    button,
    /class="min-w-40 justify-start"/,
    "The shared back button has a wider hitbox",
  );
  assert.match(
    button,
    /v-if="iconOnly"[\s\S]*?size="icon"[\s\S]*?<Icon :icon="icons\.caretLeft" aria-hidden="true" class="size-6"/,
    "The shared back button supports a larger chevron-only compact mode",
  );
});
