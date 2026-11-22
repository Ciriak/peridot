import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  buildSearchHistoryLocation,
  normalizeSearchQuery,
  SEARCH_QUERY_PARAM,
} from "../app/lib/search-history.ts";

test("search queries remove padding and accept the first repeated route value", () => {
  assert.equal(normalizeSearchQuery("  Night Sessions  "), "Night Sessions");
  assert.equal(
    normalizeSearchQuery(["Blue Hours", "Static Coast"]),
    "Blue Hours",
  );
  assert.equal(normalizeSearchQuery(null), "");
  assert.equal(normalizeSearchQuery(42), "");
});

test("completed searches build history entries without dropping route state", () => {
  assert.deepEqual(
    buildSearchHistoryLocation(
      {
        player: "fullscreen",
        q: "stale query",
      },
      "  Night Sessions  ",
    ),
    {
      path: "/search",
      query: {
        player: "fullscreen",
        [SEARCH_QUERY_PARAM]: "Night Sessions",
      },
    },
  );

  assert.deepEqual(
    buildSearchHistoryLocation({ player: "fullscreen", q: "old" }, "   "),
    {
      path: "/search",
      query: {
        player: "fullscreen",
      },
    },
  );
});

test("completed searches create URL-backed browser history entries", async () => {
  const layout = await readFile(
    new URL("../app/layouts/default.vue", import.meta.url),
    "utf8",
  );

  assert.match(
    layout,
    /watchDebounced\(\s*searchQuery,[\s\S]*?buildSearchHistoryLocation\(route\.query, normalized\)[\s\S]*?SEARCH_HISTORY_DEBOUNCE_MS/,
  );
  assert.match(
    layout,
    /watch\(\s*routeSearchQuery,[\s\S]*?searchQuery\.value = value;/,
  );
  assert.match(layout, /pendingSearchHistoryQueries = new Set<string>\(\)/);
});
