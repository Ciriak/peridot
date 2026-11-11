import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function readSource(relativePath: string): Promise<string> {
  return readFile(new URL(relativePath, import.meta.url), "utf8");
}

test("settings is a fullscreen routed area with administrator-only management categories", async () => {
  const layout = await readSource("../app/layouts/settings.vue");
  for (const category of [
    "account",
    "library",
    "playback",
    "plugins",
    "sources",
    "metadata",
    "administration",
  ]) {
    assert.match(layout, new RegExp(`to: "/settings/${category}"`));
  }
  assert.match(layout, /user\.value\?\.role === "admin"/);
  for (const page of ["sources", "metadata", "administration"]) {
    const source = await readSource(`../app/pages/settings/${page}.vue`);
    assert.match(source, /layout: "settings"/);
  }
});

test("/settings redirects to administration and /plugins redirects into settings", async () => {
  const index = await readSource("../app/pages/settings/index.vue");
  assert.match(index, /navigateTo\("\/settings\/administration"/);
  const plugins = await readSource("../app/pages/plugins.vue");
  assert.match(plugins, /navigateTo\("\/settings\/plugins"/);
});

test("the main sidebar has bottom settings access and the avatar opens account settings", async () => {
  const layout = await readSource("../app/layouts/default.vue");
  const sidebar = layout.slice(
    layout.indexOf('id="sidebar"'),
    layout.indexOf("</aside>"),
  );
  const header = layout.slice(
    layout.indexOf("<header"),
    layout.indexOf("</header>"),
  );

  assert.doesNotMatch(layout, /name: "Plugins"/);
  assert.doesNotMatch(layout, /<Badge/);
  assert.doesNotMatch(layout, /Change server/);
  assert.doesNotMatch(layout, /\{\{ label \}\}/);
  assert.match(sidebar, /<div class="border-t border-sidebar-border p-3">/);
  assert.match(sidebar, /<NuxtLink to="\/settings">/);
  assert.match(
    sidebar,
    /:icon="icons\.settings"[\s\S]*?class="size-5"[\s\S]*?\/>Settings/,
  );
  assert.match(header, /to="\/settings\/account"/);
  assert.match(header, /aria-label="Open account settings"/);
  assert.doesNotMatch(header, /aria-label="Open settings"/);
  assert.match(layout, /gravatarUrl/);
  assert.match(layout, /@peridot\/ui\/assets\/brand\/logo\.svg/);
  assert.match(layout, /flex-1 justify-start text-lg font-semibold/);
  assert.match(
    layout,
    /<img\s+:src="logo"\s+alt=""\s+class="size-6"\s*\/>\s*peridot/,
  );
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

test("sources are managed on their own page with row action menus", async () => {
  const page = await readSource("../app/pages/settings/sources.vue");
  assert.match(page, /listSources/);
  assert.match(page, /createSource/);
  assert.match(page, /deleteSource/);
  assert.match(page, /reorderSources/);
  assert.match(page, /useSortable/);
  assert.doesNotMatch(page, /handle: "\.drag-handle"/);
  assert.match(page, /filter: "a, button, input"/);
  assert.match(page, /class="flex cursor-grab items-center/);
  assert.match(page, /AlertDialogRoot/);
  assert.match(page, /DialogRoot/);
  assert.match(page, /<FolderTree/);
  assert.match(page, /sourceFolderName\(source\.path \?\? ""\)/);
  assert.match(
    page,
    /:title="source\.kind === 'path' \? \(source\.path \?\? ''\) : undefined"/,
  );
  assert.match(page, /useLibraryScan/);
  assert.match(page, /DropdownMenuRoot/);
  assert.match(page, /DropdownMenuItem/);
  assert.match(page, /rescanSource|startSource/);
  assert.match(page, /source\.kind !== 'path' \|\| scanning/);
  assert.match(page, /Actions for/);
});

test("metadata providers have a dedicated sortable management page", async () => {
  const page = await readSource("../app/pages/settings/metadata.vue");
  const icons = await readSource("../app/lib/icons.ts");
  assert.match(page, /listMetadataProviders/);
  assert.match(page, /listMetadataProviderDefinitions/);
  assert.match(page, /createMetadataProvider/);
  assert.match(page, /updateMetadataProvider/);
  assert.match(page, /reorderMetadataProviders/);
  assert.match(page, /useSortable/);
  assert.doesNotMatch(page, /handle: "\.drag-handle"/);
  assert.match(page, /draggable: "\.sortable-item"/);
  assert.match(page, /'sortable-item cursor-grab active:cursor-grabbing'/);
  assert.match(page, /configurationFields/);
  assert.match(page, /credentialField/);
  assert.match(page, /@peridot\/ui\/components\/ui\/switch/);
  assert.match(page, /providerRows/);
  assert.match(page, /syncProviderRows/);
  assert.match(page, /v-for="row in providerRows"/);
  assert.match(page, /row\.definition\.name/);
  assert.match(page, /Not configured/);
  assert.match(page, /providerStatusLabel/);
  assert.match(page, /providerStatusClass/);
  assert.match(page, /text-warning/);
  assert.match(page, /text-success/);
  assert.match(page, /'opacity-60': !row\.provider/);
  assert.match(page, /providerNeedsConfiguration/);
  assert.match(page, /Configuration required/);
  assert.match(page, /TooltipRoot/);
  assert.match(page, /TooltipContent/);
  assert.match(page, /providerIcon\(row\.definition\.kind\)/);
  assert.match(page, /:aria-label="`Configure \$\{row\.definition\.name\}`"/);
  assert.match(page, /v-model="formEnabled"/);
  assert.match(page, /enabled: formEnabled\.value/);
  assert.doesNotMatch(page, />\s*Add provider\s*</);
  assert.doesNotMatch(page, /data-provider-option/);
  assert.doesNotMatch(page, /Coming soon/);
  assert.match(
    page,
    /href="https:\/\/www\.discogs\.com\/settings\/developers"/,
  );
  assert.match(page, /target="_blank"/);
  assert.match(page, /rel="noopener noreferrer"/);
  assert.match(
    page,
    /Discogs account settings\s*<Icon[\s\S]*?:icon="icons\.externalLink"[\s\S]*?<\/a\s*>/,
  );
  assert.match(page, /Create a personal access token in your/);
  assert.match(page, /:icon="icons\.externalLink"/);
  assert.match(page, /selectedDefinition\.credentialField\.helpText/);
  assert.match(
    icons,
    /import discogs from "@iconify-icons\/simple-icons\/discogs"/,
  );
  assert.match(
    icons,
    /import musicbrainz from "@iconify-icons\/simple-icons\/musicbrainz"/,
  );
  assert.match(page, /Refresh metadata/);
  assert.match(page, /startMetadataRefresh/);
  assert.match(page, /resetMetadata/);
  assert.match(page, /Reset all track metadata/);
  assert.match(page, /notifyMetadataReset/);
  assert.match(page, /reloadTracks/);
  assert.match(page, /Reset all track metadata\?/);
  assert.match(page, /Peridot will display the original tags/);
  assert.match(page, /Providers and audio files are not changed/);
  assert.doesNotMatch(page, /Disable metadata provider\?/);
  assert.doesNotMatch(page, /Display name/);
  assert.doesNotMatch(page, /provider-name/);
  assert.doesNotMatch(page, /Remove metadata provider/);
  assert.match(page, /AlertDialogRoot/);
});

test("administration no longer contains source or library status management", async () => {
  const page = await readSource("../app/pages/settings/administration.vue");
  assert.doesNotMatch(page, /Library status/);
  assert.doesNotMatch(page, /Rescan library/);
  assert.doesNotMatch(page, /listSources/);
  assert.doesNotMatch(page, /fetchServerSettings/);
  assert.match(page, /fetchLogs/);
  assert.match(page, /Server log/);
  assert.match(page, /Search server log/);
  assert.match(page, /Categories/);
});

test("administration confirms before disconnecting from the connected server", async () => {
  const page = await readSource("../app/pages/settings/administration.vue");
  const serverCard = page.slice(
    page.indexOf('<section aria-labelledby="server-heading"'),
    page.indexOf('<AlertDialogRoot v-model:open="disconnectOpen">'),
  );
  const disconnectDialog = page.slice(
    page.indexOf('<AlertDialogRoot v-model:open="disconnectOpen">'),
    page.indexOf('<section aria-labelledby="server-log-heading"'),
  );

  assert.match(page, /revokeSession/);
  assert.match(
    serverCard,
    /class="flex flex-col gap-4 rounded-lg border bg-card p-6 text-card-foreground sm:flex-row sm:items-center sm:justify-between"/,
  );
  assert.match(serverCard, /:disabled="disconnecting"/);
  assert.match(serverCard, /@click="requestDisconnect"/);
  assert.doesNotMatch(serverCard, /@click="confirmDisconnect"/);
  assert.match(disconnectDialog, /Disconnect from server\?/);
  assert.match(disconnectDialog, /This signs you out of/);
  assert.match(disconnectDialog, /<AlertDialogCancel as-child>/);
  assert.match(disconnectDialog, /@click="confirmDisconnect"/);
  assert.match(page, /address\.value = null/);
  assert.match(page, /token\.value = null/);
  assert.match(page, /user\.value = null/);
  assert.match(page, /navigateTo\("\/onboarding", \{ replace: true \}\)/);
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
