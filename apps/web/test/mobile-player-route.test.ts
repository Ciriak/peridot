import assert from "node:assert/strict";
import test from "node:test";
import {
  isMobilePlayerRoute,
  mobilePlayerNavigationForLaunchUrl,
  MOBILE_PLAYER_DEEP_LINK,
  MOBILE_PLAYER_QUERY_KEY,
  MOBILE_PLAYER_QUERY_VALUE,
  withMobilePlayerRoute,
  withoutMobilePlayerRoute,
} from "../app/lib/mobile-player-route.ts";
import { readFile } from "node:fs/promises";

test("mobile fullscreen player state adds a reversible route query entry", () => {
  const viewQuery = { filter: "recent", page: 2 };
  const playerQuery = withMobilePlayerRoute(viewQuery);

  assert.deepEqual(playerQuery, {
    filter: "recent",
    page: 2,
    [MOBILE_PLAYER_QUERY_KEY]: MOBILE_PLAYER_QUERY_VALUE,
  });
  assert.equal(isMobilePlayerRoute(playerQuery), true);
  assert.deepEqual(withoutMobilePlayerRoute(playerQuery), viewQuery);
  assert.equal(isMobilePlayerRoute(viewQuery), false);
});

test("mobile player route detection handles repeated query values", () => {
  assert.equal(
    isMobilePlayerRoute({
      [MOBILE_PLAYER_QUERY_KEY]: ["compact", MOBILE_PLAYER_QUERY_VALUE],
    }),
    true,
  );
});

test("the media session deep link opens the fullscreen mobile player", () => {
  assert.deepEqual(
    mobilePlayerNavigationForLaunchUrl(MOBILE_PLAYER_DEEP_LINK, {
      path: "/albums/one",
      query: { filter: "recent" },
      layout: undefined,
    }),
    {
      path: "/albums/one",
      query: {
        filter: "recent",
        [MOBILE_PLAYER_QUERY_KEY]: MOBILE_PLAYER_QUERY_VALUE,
      },
    },
  );
  assert.equal(
    mobilePlayerNavigationForLaunchUrl("peridot://player", {
      path: "/",
      query: {
        [MOBILE_PLAYER_QUERY_KEY]: MOBILE_PLAYER_QUERY_VALUE,
      },
      layout: "default",
    }),
    null,
  );
});

test("the media session deep link leaves layouts without a player", () => {
  assert.deepEqual(
    mobilePlayerNavigationForLaunchUrl(MOBILE_PLAYER_DEEP_LINK, {
      path: "/settings/tasks",
      query: { filter: "running" },
      layout: "settings",
    }),
    {
      path: "/",
      query: {
        [MOBILE_PLAYER_QUERY_KEY]: MOBILE_PLAYER_QUERY_VALUE,
      },
    },
  );
  assert.equal(
    mobilePlayerNavigationForLaunchUrl("https://example.com/player", {
      path: "/",
      query: {},
      layout: "default",
    }),
    null,
  );
});

test("the Android shell handles cold and warm media session launches", async () => {
  const source = await readFile(
    new URL("../app/plugins/android-shell.client.ts", import.meta.url),
    "utf8",
  );

  assert.match(source, /CapacitorApp\.getLaunchUrl\(\)/);
  assert.match(source, /CapacitorApp\.addListener\(\s*"appUrlOpen"/);
  assert.match(source, /mobilePlayerNavigationForLaunchUrl/);
});
