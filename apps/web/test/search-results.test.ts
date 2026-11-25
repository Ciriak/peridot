import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  limitSearchResults,
  searchResultBudgets,
  searchResultTypeLabelKey,
  SEARCH_RESULTS_LIMIT,
  trackSearchResultType,
} from "../app/lib/search-results.ts";

test("search result groups share a 50-element display budget", () => {
  const items = Array.from(
    { length: SEARCH_RESULTS_LIMIT + 5 },
    (_, index) => index,
  );

  assert.equal(SEARCH_RESULTS_LIMIT, 50);
  assert.deepEqual(limitSearchResults(items), items.slice(0, 50));
  assert.deepEqual(searchResultBudgets([60, 20, 10]), [50, 0, 0]);
  assert.deepEqual(searchResultBudgets([20, 40, 10]), [20, 30, 0]);
  assert.deepEqual(searchResultBudgets([10, 10, 10]), [10, 10, 10]);
});

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
  assert.equal(
    searchResultTypeLabelKey("release"),
    "page.search.resultType.release",
  );
  assert.equal(
    searchResultTypeLabelKey("music"),
    "page.search.resultType.music",
  );
  assert.equal(
    searchResultTypeLabelKey("audiobook"),
    "page.search.resultType.audiobook",
  );
  assert.equal(
    searchResultTypeLabelKey("podcast"),
    "page.search.resultType.podcast",
  );
});

test("search cards place category tags by titles and sources in actions", async () => {
  const [table, card, tag, sourceIcons] = await Promise.all([
    readFile(
      new URL("../app/components/TrackTable.vue", import.meta.url),
      "utf8",
    ),
    readFile(
      new URL("../app/components/CatalogCard.vue", import.meta.url),
      "utf8",
    ),
    readFile(
      new URL("../app/components/SearchResultTag.vue", import.meta.url),
      "utf8",
    ),
    readFile(
      new URL("../app/components/SearchSourceIcons.vue", import.meta.url),
      "utf8",
    ),
  ]);
  assert.match(
    table,
    /const isSearch = computed\(\(\) => props\.variant === "search"\)/,
  );
  assert.match(table, /v-if="!isSearch" role="rowgroup"/);
  assert.match(
    table,
    /:source-kinds="\s*item\.track\.sourceKind \? \[item\.track\.sourceKind\] : \[\]\s*"/,
  );
  assert.match(card, /:source-kinds="searchLibrarySourceKinds"/);
  assert.match(
    card,
    /if \(album\.value\) return album\.value\.sourceKinds \?\? \[\]/,
  );
  assert.ok(
    table.indexOf('<SearchResultTag\n                  v-if="isSearch"') <
      table.indexOf("<SearchSourceIcons"),
    "Track categories render with the title while source icons stay in the action slot",
  );
  assert.ok(
    card.indexOf('<SearchResultTag class="shrink-0" :type="resultType" />') <
      card.indexOf('<div class="ml-auto flex shrink-0 items-center gap-2">'),
    "Album categories render beside the title while source icons stay in the action slot",
  );
  assert.doesNotMatch(tag, /sourceKind|source-kinds/);
  assert.match(sourceIcons, /v-for="source in sources"/);
  assert.match(sourceIcons, /page\.search\.sourceProvided/);
  assert.match(sourceIcons, /page\.search\.sourcesMultiple/);
  assert.match(
    table,
    /v-if="variant !== 'album' && !isSearch"[\s\S]*?<DownloadProgressTooltip/,
    "Search rows keep the inline offline save control out of the trailing action slot",
  );
  assert.match(table, /<SearchResultTag/);
  assert.match(table, /<LikeButton/);
  assert.match(
    table,
    /class="ml-auto flex shrink-0 items-center justify-end gap-2 p-2"[\s\S]*?<SearchSourceIcons[\s\S]*?<LikeButton[\s\S]*?<\/div>\s*<\/div>\s*<\/TrackContextMenu>/,
    "The like control follows the source icons in the final trailing search-row group",
  );
  assert.match(
    table,
    /:role="isSearch \? 'listitem' : 'row'"/,
    "Search rows use list semantics while catalog tables keep table semantics",
  );
});
