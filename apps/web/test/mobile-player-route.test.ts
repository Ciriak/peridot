import assert from "node:assert/strict";
import test from "node:test";
import {
  isMobilePlayerRoute,
  MOBILE_PLAYER_QUERY_KEY,
  MOBILE_PLAYER_QUERY_VALUE,
  withMobilePlayerRoute,
  withoutMobilePlayerRoute,
} from "../app/lib/mobile-player-route.ts";

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
