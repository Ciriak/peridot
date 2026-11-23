import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("query changes automatically trigger external search without a manual action", async () => {
  const [composable, searchPage, english] = await Promise.all([
    readFile(
      new URL("../app/composables/use-torznab-search.ts", import.meta.url),
      "utf8",
    ),
    readFile(new URL("../app/pages/search.vue", import.meta.url), "utf8"),
    readFile(new URL("../i18n/locales/en-US.json", import.meta.url), "utf8"),
  ]);

  assert.match(
    composable,
    /const searchTerm = computed\(\(\) => toValue\(query\)\.trim\(\)\)/,
  );
  assert.match(
    composable,
    /queryKey: computed\(\(\) => \[\s*"torznab-results",\s*scope\.value,\s*searchTerm\.value/,
  );
  assert.match(composable, /enabled: computed\(/);
  assert.match(composable, /searchTerm\.value/);
  assert.match(composable, /staleTime: 0/);
  assert.match(composable, /notifyReleaseDownloadFailed/);
  assert.doesNotMatch(composable, /autoplay/i);
  assert.match(searchPage, /useTorznabSearch\(debouncedQuery\)/);
  assert.match(searchPage, /:import-failed="externalImportFailed"/);
  assert.doesNotMatch(searchPage, /torznab\.search/);
  assert.doesNotMatch(english, /"torznab\.search"/);
  assert.doesNotMatch(english, /"torznab\.autoplay"/);
});

test("external rows mirror library rows with placeholder art and a download action", async () => {
  const row = await readFile(
    new URL("../app/components/TorznabReleaseRow.vue", import.meta.url),
    "utf8",
  );

  assert.match(
    row,
    /role="listitem"[\s\S]*class="group flex min-h-14 min-w-0 items-center gap-2 px-2 py-1 text-card-foreground"/,
  );
  assert.match(
    row,
    /class="relative flex size-10 items-center justify-center overflow-hidden rounded-md bg-muted text-muted-foreground/,
  );
  assert.match(
    row,
    /<Icon :icon="placeholderIcon" class="size-5" \/>/,
    "External results use a type-aware placeholder without remote artwork",
  );
  assert.match(row, /<SearchResultTag class="shrink-0" :type="resultType" \/>/);
  assert.match(
    row,
    /props\.release\.mediaType === "audiobook"\) return "audiobook"/,
  );
  assert.match(
    row,
    /props\.release\.mediaType === "podcast"\) return "podcast"/,
  );
  assert.match(row, /props\.release\.mediaType === "music"\) return "music"/);
  assert.match(row, /return "release"/);
  assert.match(row, /resultType\.value === "audiobook"\) return icons\.book/);
  assert.match(row, /resultType\.value === "podcast"\) return icons\.podcast/);
  assert.match(row, /resultType\.value === "music"\) return icons\.music/);
  assert.match(row, /return icons\.album/);
  assert.match(row, /<SearchSourceIcons :source-kinds="\['torznab'\]" \/>/);
  assert.match(row, /:aria-label="t\('torznab\.add'\)"/);
  assert.match(row, /:title="t\('torznab\.add'\)"/);
  assert.match(row, /<Icon\s+:icon="icons\.download"/);
  assert.match(row, /:disabled="busy \|\| imported"/);
  assert.doesNotMatch(row, /icons\.(?:play|pause)/);
  assert.doesNotMatch(row, /autoplay|torznab\.play/);
  assert.equal(
    row.match(/<Button/g)?.length,
    1,
    "Add to library is the row's only action",
  );
});

test("external results use the shared list surface and keep completion playback outside rows", async () => {
  const results = await readFile(
    new URL("../app/components/TorznabResults.vue", import.meta.url),
    "utf8",
  );

  assert.match(
    results,
    /role="list"[\s\S]*class="divide-y overflow-hidden rounded-lg border"/,
  );
  assert.match(results, /<TorznabReleaseRow[\s\S]*v-for="release in releases"/);
  assert.match(results, /importStatus\.trackIds\.length/);
  assert.match(results, /t\("torznab\.play"\)/);
  assert.match(results, /@click="emit\('play'\)"/);
  assert.doesNotMatch(results, /actionError|v-if="actionError"/);
  assert.doesNotMatch(results, /autoplay|Play when ready/);
});
