import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { filterTorznabReleases } from "../app/lib/torznab-filters.ts";
import {
  torznabImportPercent,
  torznabImportShouldPoll,
  torznabTerminalImportState,
  torznabTransferPhase,
} from "../app/lib/torznab-import-status.ts";

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
  assert.match(composable, /useQueries/);
  assert.match(composable, /"torznab-import", scope\.value, id/);
  assert.match(composable, /torznabTerminalImportState/);
  assert.match(composable, /reason\.code === "release_already_added"/);
  assert.match(composable, /t\("torznab\.alreadyAddedError"\)/);
  assert.doesNotMatch(composable, /autoplay/i);
  assert.match(searchPage, /useTorznabSearch\(debouncedQuery\)/);
  assert.match(searchPage, /:import-states="externalImportStates"/);
  assert.match(searchPage, /:playable-track-ids="externalPlayableTrackIds"/);
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
  assert.match(row, /:aria-label="actionLabel"/);
  assert.match(row, /:title="actionLabel"/);
  assert.match(row, /v-else[\s\S]*:icon="icons\.download"/);
  assert.match(row, /<PeridotSpinner[\s\S]*class="size-6"/);
  assert.match(row, /<ProgressCircle[\s\S]*:value="progressPercent"/);
  assert.match(row, /:label="statusLabel"/);
  assert.match(row, /icons\.check/);
  assert.match(row, /icons\.warning/);
  assert.match(row, /:disabled="disabled"/);
  assert.match(row, /t\("torznab\.alreadyAdded"\)/);
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
  assert.match(results, /:import-state="importStateFor\(release\)"/);
  assert.match(results, /torrent\.progress >= 1/);
  assert.match(results, /kind: "already-added"/);
  assert.match(results, /state: torrent\.state/);
  assert.match(results, /playableTrackIds\.length/);
  assert.match(results, /t\("torznab\.play"\)/);
  assert.match(results, /\{\{ emptyMessage \}\}/);
  assert.match(results, /@click="emit\('play'\)"/);
  assert.doesNotMatch(results, /importStatus\.progress/);
  assert.doesNotMatch(results, /actionError|v-if="actionError"/);
  assert.doesNotMatch(results, /autoplay|Play when ready/);
});

test("external filters expose media types and sort by seeders", () => {
  const releases = [
    { mediaType: "music", title: "Music", seeders: 5 },
    { mediaType: "audiobook", title: "Book", seeders: 12 },
    { mediaType: "podcast", title: "Podcast", seeders: 100 },
    { mediaType: null, title: "Unknown", seeders: null },
    { mediaType: "music", title: "Unknown music", seeders: null },
  ].map((release) => ({
    ...release,
    id: release.title,
    sourceName: "Indexer",
    canImport: true,
    seeders: release.seeders,
    bytes: null,
  })) as Parameters<typeof filterTorznabReleases>[0];

  assert.deepEqual(
    filterTorznabReleases(releases, "all").map((release) => release.title),
    ["Podcast", "Book", "Music", "Unknown", "Unknown music"],
  );
  assert.deepEqual(
    filterTorznabReleases(releases, "music").map((release) => release.title),
    ["Music", "Unknown music"],
  );
  assert.deepEqual(
    filterTorznabReleases(releases, "audiobook").map(
      (release) => release.title,
    ),
    ["Book"],
  );
});

test("torznab transfer states map to stable inline progress labels", () => {
  assert.equal(torznabImportPercent(-0.2), 0);
  assert.equal(torznabImportPercent(0.426), 43);
  assert.equal(torznabImportPercent(1.2), 100);
  assert.equal(torznabTransferPhase("queuedDL", 0), "queued");
  assert.equal(torznabTransferPhase("metaDL", 0), "metadata");
  assert.equal(torznabTransferPhase("checkingResumeData", 0.4), "checking");
  assert.equal(torznabTransferPhase("stoppedDL", 0.3), "paused");
  assert.equal(torznabTransferPhase("downloading", 0.3), "downloading");
  assert.equal(torznabTransferPhase("uploading", 1), "indexing");
  assert.equal(torznabTerminalImportState("error"), true);
  assert.equal(torznabTerminalImportState("missingFiles"), true);
  assert.equal(torznabTerminalImportState("uploading"), false);
  assert.equal(torznabImportShouldPoll(undefined), true);
  assert.equal(
    torznabImportShouldPoll({ state: "downloading", trackIds: [] }),
    true,
  );
  assert.equal(
    torznabImportShouldPoll({ state: "uploading", trackIds: ["track"] }),
    false,
  );
  assert.equal(
    torznabImportShouldPoll({ state: "error", trackIds: [] }),
    false,
  );
});
