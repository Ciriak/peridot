import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function readSource(relativePath: string): Promise<string> {
  return readFile(new URL(relativePath, import.meta.url), "utf8");
}

test("settings is a fullscreen routed area with the five categories", async () => {
  const layout = await readSource("../app/layouts/settings.vue");
  for (const category of [
    "account",
    "library",
    "playback",
    "plugins",
    "administration",
  ]) {
    assert.match(layout, new RegExp(`to: "/settings/${category}"`));
  }
  const administration = await readSource(
    "../app/pages/settings/administration.vue",
  );
  assert.match(administration, /layout: "settings"/);
});

test("/settings redirects to administration and /plugins redirects into settings", async () => {
  const index = await readSource("../app/pages/settings/index.vue");
  assert.match(index, /navigateTo\("\/settings\/administration"/);
  const plugins = await readSource("../app/pages/plugins.vue");
  assert.match(plugins, /navigateTo\("\/settings\/plugins"/);
});

test("the main sidebar drops Plugins and the header avatar opens settings", async () => {
  const layout = await readSource("../app/layouts/default.vue");
  assert.doesNotMatch(layout, /name: "Plugins"/);
  assert.doesNotMatch(layout, /<Badge/);
  assert.doesNotMatch(layout, />Settings</);
  assert.doesNotMatch(layout, /Change server/);
  assert.doesNotMatch(layout, /\{\{ label \}\}/);
  assert.match(layout, /aria-label="Open settings"/);
  assert.match(layout, /gravatarUrl/);
  assert.match(layout, /@peridot\/ui\/assets\/brand\/logo\.svg/);
  assert.match(layout, /flex-1 justify-start text-lg font-semibold/);
});

test("the settings sidebar omits server details and its brand links back home", async () => {
  const layout = await readSource("../app/layouts/settings.vue");
  assert.doesNotMatch(layout, /\{\{ label \}\}/);
  assert.doesNotMatch(layout, /Change server/);
  assert.doesNotMatch(layout, /Back to Peridot/);
  assert.doesNotMatch(layout, /useServer/);
  assert.doesNotMatch(layout, /aria-label="Close settings"/);
  assert.doesNotMatch(layout, />peridot<\/NuxtLink>/);
  assert.match(layout, /aria-label="Back to home"/);
  assert.match(layout, /flex-1 justify-start font-semibold/);
  assert.match(layout, /<NuxtLink to="\/"/);
  assert.match(layout, /:icon="icons\.arrowLeft"/);
  assert.match(layout, /Back\s*<\/NuxtLink/);
});

test("administration manages, sorts, and confirms removal of sources", async () => {
  const page = await readSource("../app/pages/settings/administration.vue");
  assert.match(page, /fetchServerSettings/);
  assert.match(page, /listSources/);
  assert.match(page, /createSource/);
  assert.match(page, /deleteSource/);
  assert.match(page, /reorderSources/);
  assert.match(page, /useSortable/);
  assert.match(page, /AlertDialogRoot/);
  assert.match(page, /DialogRoot/);
  assert.match(page, /<FolderTree/);
  assert.match(page, /useLibraryScan/);
  assert.match(page, /fetchLogs/);
  assert.match(page, /Server log/);
  assert.match(page, /DropdownMenuRoot/);
  assert.match(page, /Search server log/);
  assert.match(page, /Categories/);
});

test("the local-files picker includes accessible deep folder search", async () => {
  const folderTree = await readSource("../app/components/FolderTree.vue");
  assert.match(folderTree, /v-model="searchQuery"/);
  assert.match(folderTree, /aria-label="Search folders"/);
  assert.match(folderTree, /placeholder="Search folders"/);
  assert.match(folderTree, /searchDirectories/);
  assert.match(folderTree, /Searching all folders/);
  assert.match(folderTree, /searchError/);
  assert.match(folderTree, /searchTruncated/);
  assert.match(folderTree, /No folders match your search\./);
});
