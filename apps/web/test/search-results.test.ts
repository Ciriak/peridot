import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  searchResultTypeLabelKey,
  trackSearchResultType,
} from "../app/lib/search-results.ts";

test("track media types map to readable search-result tags", () => {
  assert.equal(trackSearchResultType("music"), "song");
  assert.equal(trackSearchResultType("audiobook"), "chapter");
  assert.equal(trackSearchResultType("podcast"), "episode");
  assert.equal(searchResultTypeLabelKey("song"), "page.search.resultType.song");
  assert.equal(
    searchResultTypeLabelKey("album"),
    "page.search.resultType.album",
  );
  assert.equal(
    searchResultTypeLabelKey("playlist"),
    "page.search.resultType.playlist",
  );
});

test("the shared track table exposes search-only tags and source icons", async () => {
  const table = await readFile(
    new URL("../app/components/TrackTable.vue", import.meta.url),
    "utf8",
  );
  assert.match(
    table,
    /const isSearch = computed\(\(\) => props\.variant === "search"\)/,
  );
  assert.match(table, /v-if="!isSearch" role="rowgroup"/);
  assert.match(table, /:source-kind="item\.track\.sourceKind \?\? null"/);
  assert.match(
    table,
    /v-if="variant !== 'album' && !isSearch"[\s\S]*?<DownloadProgressTooltip/,
    "Search rows keep the inline offline save control out of the trailing action slot",
  );
  assert.match(table, /<SearchResultTag/);
  assert.match(table, /<LikeButton/);
  assert.match(
    table,
    /class="ml-auto flex shrink-0 items-center justify-end gap-2 p-2"[\s\S]*?<SearchResultTag[\s\S]*?<LikeButton[\s\S]*?<\/div>\s*<\/div>\s*<\/TrackContextMenu>/,
    "The like control follows the type tag in the final trailing search-row group",
  );
  assert.match(
    table,
    /:role="isSearch \? 'listitem' : 'row'"/,
    "Search rows use list semantics while catalog tables keep table semantics",
  );
});
