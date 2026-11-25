import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function readSource(relativePath: string): Promise<string> {
  return readFile(new URL(relativePath, import.meta.url), "utf8");
}

test("settings is a fullscreen routed area with a separate administrator group", async () => {
  const layout = await readSource("../app/layouts/settings.vue");
  const commonCategories = layout.slice(
    layout.indexOf("const commonCategories"),
    layout.indexOf("const adminCategories"),
  );
  const adminCategories = layout.slice(
    layout.indexOf("const adminCategories"),
    layout.indexOf("];", layout.indexOf("const adminCategories")) + 2,
  );
  const connectorCategories = layout.slice(
    layout.indexOf("const connectorCategories"),
    layout.indexOf("];", layout.indexOf("const connectorCategories")) + 2,
  );
  for (const category of ["account", "library", "tasks", "playback"]) {
    assert.match(layout, new RegExp(`to: "/settings/${category}"`));
  }
  assert.match(commonCategories, /labelKey: "settings\.profile"/);
  assert.doesNotMatch(commonCategories, /settings\.account"/);
  for (const category of ["medias", "users", "server"]) {
    assert.match(adminCategories, new RegExp(`to: "/settings/${category}"`));
  }
  assert.doesNotMatch(adminCategories, /to: "\/settings\/connectors"/);
  for (const category of [
    "library-sources",
    "release-indexers",
    "download-clients",
    "metadata-providers",
  ]) {
    assert.match(
      connectorCategories,
      new RegExp(`to: "/settings/connectors/${category}"`),
    );
  }
  assert.match(
    connectorCategories,
    /labelKey: "settings\.connectors\.librarySources"/,
  );
  assert.match(
    connectorCategories,
    /labelKey: "settings\.connectors\.releaseIndexers"/,
  );
  assert.match(
    connectorCategories,
    /to: "\/settings\/connectors\/release-indexers",\s*icon: icons\.globe,/,
  );
  assert.match(
    connectorCategories,
    /labelKey: "settings\.connectors\.downloadClients"/,
  );
  assert.match(
    connectorCategories,
    /labelKey: "settings\.connectors\.metadataProviders"/,
  );
  assert.match(layout, /v-for="connector in connectorCategories"/);
  assert.doesNotMatch(layout, /to: "\/settings\/connectors"/);
  assert.doesNotMatch(layout, /t\("settings\.connectors\.title"\)/);
  assert.ok(
    layout.indexOf('v-for="connector in connectorCategories"') <
      layout.indexOf('v-for="item in adminCategories"'),
  );
  assert.match(adminCategories, /labelKey: "settings\.users"/);
  assert.match(adminCategories, /labelKey: "settings\.medias"/);
  assert.match(commonCategories, /labelKey: "settings\.tasks"/);
  assert.doesNotMatch(adminCategories, /to: "\/settings\/tasks"/);
  assert.doesNotMatch(commonCategories, /to: "\/settings\/plugins"/);
  assert.match(layout, /user\?\.role === 'admin'/);
  assert.match(layout, /aria-labelledby="admin-settings-heading"/);
  assert.match(layout, /class="space-y-1 border-t border-sidebar-border pt-4"/);
  assert.match(layout, /t\("navigation\.admin"\)/);
  assert.doesNotMatch(layout, /name: "Administration"/);
  assert.match(layout, /import ServerConnectionIndicator/);
  assert.match(layout, /<ServerConnectionIndicator \/>/);
  assert.match(layout, /useAdminSourcesQuery/);
  assert.match(layout, /sourceCount/);
  assert.match(layout, /computed\(\(\) => sources\.value\.length\)/);
  assert.doesNotMatch(layout, /source\.fileCount/);
  assert.match(
    layout,
    /connector\.to ===\s*'\/settings\/connectors\/library-sources'/,
  );
  assert.match(
    layout,
    /connector\.to ===\s*'\/settings\/connectors\/metadata-providers'/,
  );
  assert.match(layout, /variant="secondary"/);
  assert.match(layout, /n\(sourceCount, "integer"\)/);
  assert.doesNotMatch(layout, /activeSourceTasks/);
  assert.doesNotMatch(layout, /sourceTaskProgress/);
  assert.match(
    layout,
    /connector\.to ===\s*'\/settings\/connectors\/library-sources'\s*&&\s*sourcesLoaded/,
  );
  assert.match(layout, /activeMetadataTasks/);
  assert.match(layout, /activeTasks/);
  assert.match(layout, /metadataTaskProgress/);
  assert.match(layout, /activeTaskCount/);
  assert.match(layout, /combinedTaskProgress/);
  assert.match(layout, /useOfflineDownloadTasks/);
  assert.match(layout, /item\.to === '\/settings\/tasks'/);
  assert.match(
    layout,
    /connector\.to ===\s*'\/settings\/connectors\/metadata-providers'/,
  );
  assert.match(layout, /settings\.tasks\.progressFor/);
  for (const page of [
    "tasks",
    "medias",
    "users",
    "connectors/index",
    "connectors/library-sources",
    "connectors/release-indexers",
    "connectors/download-clients",
    "connectors/metadata-providers",
    "server",
  ]) {
    const source = await readSource(`../app/pages/settings/${page}.vue`);
    assert.match(source, /layout: "settings"/);
  }
});

test("/settings redirects to account", async () => {
  const index = await readSource("../app/pages/settings/index.vue");
  assert.match(index, /navigateTo\("\/settings\/account"/);
});

test("Jellyfin is a direct built-in source integration", async () => {
  const [page, client, contracts] = await Promise.all([
    readSource("../app/pages/settings/connectors/library-sources.vue"),
    readSource("../app/lib/peridot-client.ts"),
    readSource("../../../packages/contracts/src/index.ts"),
  ]);
  assert.match(page, /chooseKind\('jellyfin'\)/);
  assert.match(page, /discoverJellyfinLibraries/);
  assert.match(page, /discoverConnectorInstances/);
  assert.match(page, /scanJellyfinInstances/);
  assert.match(page, /selectJellyfinInstance/);
  assert.match(page, /newJellyfinUrl/);
  assert.match(page, /newJellyfinApiKey/);
  assert.match(page, /newJellyfinLibraryId/);
  assert.match(page, /kind: "jellyfin"/);
  assert.match(client, /source-integrations\/\$\{encodeURIComponent\(kind\)\}/);
  assert.match(
    client,
    /connectors\/\$\{encodeURIComponent\(kind\)\}\/discover-instances/,
  );
  assert.doesNotMatch(client, /api\/admin\/plugins|api\/plugins/);
  assert.match(contracts, /LibrarySourceKind = "path" \| "jellyfin"/);
  assert.match(contracts, /CreateJellyfinLibrarySourceRequest/);
  assert.match(contracts, /interface ConnectorInstanceResponse/);
  assert.match(contracts, /DiscoverConnectorInstancesResponse/);
});

test("Jellyfin uses only an explicitly selected scanner result", async () => {
  const page = await readSource(
    "../app/pages/settings/connectors/library-sources.vue",
  );

  assert.match(
    page,
    /if \(kind === "jellyfin"\) void scanJellyfinInstances\(\)/,
  );
  assert.match(page, /newJellyfinUrl\.value = instance\.url/);
  assert.match(page, /url: instance\.url/);
  assert.match(page, /configuration: \{ url: instance\.url \}/);
  assert.match(page, /Boolean\(selectedJellyfinInstance\.value\)/);
  assert.match(page, /inputmode="url"/);
  assert.match(page, /type="text"/);
  assert.doesNotMatch(page, /aria-pressed=/);
  assert.doesNotMatch(page, /icons\.check/);
  assert.match(page, /animate-ping rounded-full bg-success/);
  assert.match(page, /t\("common\.active"\)/);
  assert.doesNotMatch(page, /configuration: \{ url: newJellyfinUrl\.value \}/);
});

test("qBittorrent uses verified instances on its default port", async () => {
  const [page, translations, connectors] = await Promise.all([
    readSource("../app/pages/settings/connectors/download-clients.vue"),
    readSource("../i18n/locales/en-US.json"),
    readSource("../../../apps/server/src/connectors.ts"),
  ]);

  assert.match(page, /discoverConnectorInstances/);
  assert.match(page, /scanQbittorrentInstances/);
  assert.match(page, /selectQbittorrentInstance/);
  assert.match(page, /void scanQbittorrentInstances\(\)/);
  assert.match(
    page,
    /blank\(clientKind === "qbittorrent" \? "qBittorrent" : ""\)/,
  );
  assert.match(page, /form\.value\.url = instance\.url/);
  assert.match(
    page,
    /if \(!form\.value\.name\.trim\(\)\) form\.value\.name = instance\.label/,
  );
  assert.match(
    page,
    /:disabled="\s*busy \|\| !selectedQbittorrentInstance \|\| serverLost\s*"[\s\S]*?type="submit"/,
  );
  assert.doesNotMatch(page, /act\('test'\)|clients\.test"/);
  assert.match(page, /selectedQbittorrentInstance/);
  assert.match(page, /inputmode="url"/);
  assert.match(page, /type="text"/);
  assert.doesNotMatch(page, /aria-pressed=/);
  assert.doesNotMatch(page, /icons\.check/);
  assert.match(page, /animate-ping rounded-full bg-success/);
  assert.match(page, /t\("common\.active"\)/);
  assert.match(page, /icons\.qbittorrent/);
  assert.match(page, /icons\.settings/);
  assert.match(page, /t\('clients\.edit', \{ client: client\.name \}\)/);
  assert.match(page, /@click="edit\(client\)"/);
  assert.doesNotMatch(page, /t\("common\.edit"\)/);
  assert.match(page, /DropdownMenuRoot/);
  assert.match(page, /@select="askRemove\(client\)"/);
  assert.match(page, /AlertDialogRoot/);
  assert.match(page, /@click="confirmRemove"/);
  assert.match(page, /text-destructive/);
  assert.doesNotMatch(page, /@click="act\('remove', client\.id\)"/);
  assert.ok(
    page.indexOf("icons.qbittorrent") < page.indexOf("{{ client.name }}"),
    "The qBittorrent icon leads each saved client row",
  );
  assert.ok(
    page.indexOf('id="qbittorrent-url"') < page.indexOf('t("indexer.name")'),
    "Server scanning appears before the remaining client fields",
  );
  assert.match(
    translations,
    /"clients\.urlPlaceholder": "http:\/\/localhost:8080"/,
  );
  assert.match(connectors, /instance-discovery/);
});

test("release indexers are added and configured in a dialog", async () => {
  const page = await readSource(
    "../app/pages/settings/connectors/release-indexers.vue",
  );

  assert.match(page, /@click="beginAdd"/);
  assert.match(page, /<DialogRoot v-model:open="open">/);
  assert.match(page, /<DialogContent/);
  assert.match(page, /<DialogTitle/);
  assert.match(page, /<form class="mt-4 space-y-4" @submit\.prevent="save">/);
  assert.match(
    page,
    /<DownloadClientLink v-model="form" :sources="sources" \/>/,
  );
  assert.match(page, /v-if="formError"/);
  assert.doesNotMatch(page, /v-if="open"\s+class="space-y-4 rounded-lg border/);
});

test("settings shows app metadata and profile owns confirmed logout", async () => {
  const [layout, page, config, packageSource] = await Promise.all([
    readSource("../app/layouts/settings.vue"),
    readSource("../app/pages/settings/account.vue"),
    readSource("../nuxt.config.ts"),
    readSource("../../../package.json"),
  ]);
  const metadataFooter = layout.slice(
    layout.indexOf(
      'class="shrink-0 border-t border-sidebar-border p-3 text-xs',
    ),
    layout.indexOf("</aside>"),
  );
  const logoutControl = page.slice(
    page.indexOf('<div class="mt-auto flex justify-end">'),
    page.indexOf("<AlertDialogRoot"),
  );
  const logoutDialog = page.slice(
    page.indexOf('<AlertDialogRoot v-model:open="logoutOpen">'),
    page.indexOf("</AlertDialogRoot>"),
  );

  assert.match(layout, /useRuntimeConfig/);
  assert.match(layout, /runtimeConfig\.public\.appVersion/);
  assert.match(layout, /runtimeConfig\.public\.environment/);
  assert.match(
    metadataFooter,
    /text-xs leading-tight text-muted-foreground\/60/,
  );
  assert.match(metadataFooter, /navigation\.version/);
  assert.match(metadataFooter, /\{\{ appVersion \}\}/);
  assert.match(metadataFooter, /navigation\.environment/);
  assert.match(metadataFooter, /\{\{ environment \}\}/);
  assert.doesNotMatch(metadataFooter, /icons\.logout/);
  assert.doesNotMatch(metadataFooter, /navigation\.logOut/);
  assert.doesNotMatch(layout, /revokeSession|AlertDialogRoot/);

  const runtimeConfig = config.slice(
    config.indexOf("runtimeConfig:"),
    config.indexOf("modules:"),
  );
  const packageJson = JSON.parse(packageSource) as { version?: string };
  assert.match(packageJson.version ?? "", /^\d+\.\d+\.\d+$/);
  assert.match(config, /readFileSync\(new URL\("\.\.\/\.\.\/package\.json"/);
  assert.match(runtimeConfig, /appVersion: rootPackage\.version/);
  assert.match(runtimeConfig, /environment: appEnvironment/);
  assert.match(config, /process\.env\.PERIDOT_ENVIRONMENT\?\.trim\(\)/);
  assert.match(
    config,
    /process\.env\.NODE_ENV === "production" \? "production" : "development"/,
  );

  assert.match(logoutControl, /:icon="icons\.logout"/);
  assert.match(logoutControl, /size="sm"/);
  assert.match(logoutControl, /class="text-muted-foreground"/);
  assert.match(logoutControl, /class="size-4"/);
  assert.match(logoutControl, /navigation\.loggingOut/);
  assert.match(logoutControl, /navigation\.logOut/);
  assert.match(logoutControl, /:disabled="loggingOut"/);
  assert.match(logoutControl, /@click="requestLogout"/);
  assert.doesNotMatch(logoutControl, /@click="confirmLogout"/);
  assert.match(page, /useServer/);
  assert.match(page, /useSession/);
  assert.match(page, /revokeSession/);
  assert.match(page, /token\.value = null/);
  assert.match(page, /user\.value = null/);
  assert.doesNotMatch(page, /address\.value = null/);
  assert.match(page, /query: \{ auth: "login", redirect: route\.fullPath \}/);
  assert.match(page, /AlertDialogRoot/);
  assert.match(logoutDialog, /navigation\.logOutTitle/);
  assert.match(logoutDialog, /navigation\.logOutDescription/);
  assert.match(logoutDialog, /<AlertDialogCancel as-child>/);
  assert.match(logoutDialog, /@click="confirmLogout"/);
});

test("the header places connection status before the account avatar", async () => {
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
  assert.doesNotMatch(layout, /@peridot\/ui\/components\/ui\/badge/);
  assert.doesNotMatch(layout, /@peridot\/ui\/components\/ui\/progress-circle/);
  assert.match(
    layout,
    /import ServerConnectionIndicator from "\.\.\/components\/ServerConnectionIndicator\.vue"/,
  );
  assert.doesNotMatch(layout, /PeridotSpinner/);
  assert.doesNotMatch(layout, /Change server/);
  assert.doesNotMatch(layout, /\{\{ label \}\}/);
  assert.doesNotMatch(sidebar, /to="\/settings"/);
  assert.doesNotMatch(sidebar, /Fetching metadata/);
  assert.doesNotMatch(header, /to="\/settings"/);
  assert.doesNotMatch(header, /aria-label="Open settings"/);
  assert.match(
    header,
    /<ServerConnectionIndicator \/>[\s\S]*?to="\/settings\/account"/,
  );
  assert.match(header, /to="\/settings\/account"/);
  assert.match(header, /t\('navigation\.profileSettings'\)/);
  assert.match(header, /:icon="icons\.settings"/);
  assert.match(header, /group-hover\/avatar:opacity-100/);
  assert.match(header, /group-focus-visible\/avatar:opacity-100/);
  assert.match(layout, /gravatarUrl/);
  assert.match(layout, /@peridot\/ui\/assets\/brand\/logo\.svg/);
  assert.match(layout, /@peridot\/ui\/assets\/brand\/logo-nop\.png\?inline/);
  assert.match(layout, /flex-1 justify-start text-lg font-semibold/);
  assert.match(
    layout,
    /<img\s+:src="logoNop"\s+alt=""\s+class="size-6 p-0\.5"\s*\/>\s*\{\{\s*t\("app\.name"\)\s*\}\}/,
  );
});

test("the settings sidebar omits server details and its brand links back home", async () => {
  const layout = await readSource("../app/layouts/settings.vue");
  assert.doesNotMatch(layout, /\{\{ label \}\}/);
  assert.doesNotMatch(layout, /Change server/);
  assert.doesNotMatch(layout, /Back to Peridot/);
  assert.doesNotMatch(layout, /Connected server/);
  assert.doesNotMatch(layout, /aria-label="Close settings"/);
  assert.doesNotMatch(layout, />peridot<\/NuxtLink>/);
  assert.match(layout, /t\('navigation\.backHome'\)/);
  assert.match(layout, /flex-1 justify-start font-semibold/);
  assert.match(layout, /<NuxtLink to="\/"/);
  assert.match(layout, /:icon="icons\.arrowLeft"/);
  assert.match(layout, /t\("common\.back"\)/);
});

test("sources are managed on their own page with row action menus", async () => {
  const page = await readSource(
    "../app/pages/settings/connectors/library-sources.vue",
  );
  assert.match(page, /useAdminSourcesQuery/);
  assert.match(page, /createSource/);
  assert.match(page, /deleteSource/);
  assert.match(page, /await deleteSource\(/);
  assert.match(page, /source\.removal\.progress/);
  assert.match(page, /sourceRemovalLabel\(source\)/);
  assert.match(page, /reorderSources/);
  assert.match(page, /useSortable/);
  assert.match(page, /handle: "\.drag-handle"/);
  assert.doesNotMatch(page, /filter: "a, button, input"/);
  assert.match(page, /class="flex items-center/);
  assert.match(
    page,
    /class="drag-handle cursor-grab rounded-md p-1 text-muted-foreground active:cursor-grabbing"[\s\S]*?:aria-label="t\('settings\.sources\.drag'\)"/,
  );
  assert.match(page, /AlertDialogRoot/);
  assert.match(page, /DialogRoot/);
  assert.match(page, /<FolderTree/);
  assert.match(page, /sourceFolderName\(source\.path \?\? ""\)/);
  assert.match(page, /sourceFileCount\(source\)/);
  assert.match(
    page,
    /class="font-semibold text-foreground">\{\{\s*sourceFileCount\(source\)/,
  );
  assert.match(page, /settings\.sources\.lastSync/);
  assert.match(page, /settings\.sources\.notSynced/);
  assert.match(page, /useServerSettingsQuery/);
  assert.match(page, /sourceRefreshEnabled/);
  assert.match(page, /sourceRefreshCron/);
  assert.match(page, /saveSourceRefresh/);
  assert.match(page, /@update:model-value="changeSourceRefreshEnabled"/);
  assert.match(page, /@blur="saveSourceRefresh"/);
  assert.doesNotMatch(page, /@click="saveSourceRefresh"/);
  assert.match(page, /settings\.server\.scheduleTitle/);
  assert.match(page, /settings\.server\.scheduleCronHelp/);
  assert.match(page, /https:\/\/crontab\.guru\//);
  assert.match(page, /settings\.server\.scheduleCronHelpLink/);
  assert.match(
    page,
    /v-else class="text-sm text-muted-foreground">[\s\S]*?<\/div>\s*<section aria-labelledby="source-refresh-heading"/,
  );
  assert.match(page, /:datetime="source\.lastSyncedAt"/);
  assert.match(page, /sourceKindIcon\(source\.kind\)/);
  assert.match(page, /sourceKindLabel\(source\)/);
  assert.match(page, /:title="sourceKindLabel\(source\)"/);
  assert.match(page, /block font-medium/);
  assert.match(page, /block break-all text-xs text-muted-foreground/);
  assert.doesNotMatch(page, /Badge variant="secondary">\{\{ source\.kind/);
  assert.match(
    page,
    /<Icon :icon="icons\.folder" aria-hidden="true" class="size-5" \/>\s*\{\{ t\("settings\.sources\.path"\) \}\}/,
  );
  assert.doesNotMatch(page, /chooseKind\('url'\)/);
  assert.doesNotMatch(page, /settings\.sources\.externalUrl/);
  assert.doesNotMatch(page, /id="source-url"/);
  assert.doesNotMatch(page, /chooseKind\('integration'\)/);
  assert.match(page, /chooseKind\('jellyfin'\)/);
  assert.match(page, /newJellyfinUrl/);
  assert.match(page, /newJellyfinApiKey/);
  assert.match(page, /discoverJellyfinLibraries/);
  assert.match(page, /kind: "jellyfin"/);
  assert.match(page, /libraryId: newJellyfinLibraryId\.value/);
  assert.match(
    page,
    /:title="source\.kind === 'path' \? \(source\.path \?\? ''\) : undefined"/,
  );
  assert.match(page, /useTasks/);
  assert.doesNotMatch(page, /hasActiveTasks/);
  assert.match(page, /queueLibraryScan/);
  assert.match(
    page,
    /if \(source\.kind === "path"\)[\s\S]*?trackTask\(source\.task\)/,
  );
  assert.match(page, /await queueLibraryScan\(\)/);
  assert.match(page, /settings\.sources\.rescanAll/);
  assert.match(page, /@click="rescanAll"/);
  assert.match(page, /DropdownMenuRoot/);
  assert.match(page, /DropdownMenuItem/);
  assert.match(
    page,
    /<DropdownMenuItem[\s\S]*?class="flex cursor-pointer[\s\S]*?settings\.sources\.rescan/,
  );
  assert.match(
    page,
    /<DropdownMenuItem[\s\S]*?class="flex cursor-pointer[\s\S]*?common\.remove/,
  );
  assert.match(page, /data-disabled:cursor-default/);
  assert.match(page, /queueSourceScan/);
  assert.match(page, /source\.kind !== 'jellyfin'/);
  assert.match(page, /settings\.sources\.actions/);
  assert.match(
    page,
    /import \{ ProgressCircle \} from "@peridot\/ui\/components\/ui\/progress-circle"/,
  );
  assert.match(page, /activeTaskForSource\(tasks\.value, source\.id\)/);
  assert.match(page, /sourceTaskProgress\(task\)/);
  assert.match(
    page,
    /v-if="sourceTask\(source\) && !sourceIsRemoving\(source\)"/,
  );
  assert.match(page, /:value="sourceProgress\(source\)"/);
  assert.match(page, /settings\.sources\.progress/);
  assert.match(page, /TooltipProvider/);
  assert.match(page, /TooltipTrigger as-child/);
  assert.match(page, /tabindex="0"/);
  assert.match(page, /side="bottom"/);
  assert.match(page, /translate\(task\.titleMessage\)/);
  assert.match(page, /taskStatusMessage\(task\)/);
  assert.match(page, /taskProgressMessage\(task\)/);
  assert.match(page, /settings\.sources\.removeDescription/);
});

test("metadata providers have a dedicated sortable management page", async () => {
  const page = await readSource(
    "../app/pages/settings/connectors/metadata-providers.vue",
  );
  const icons = await readSource("../app/lib/icons.ts");
  assert.match(page, /useMetadataProvidersQuery/);
  assert.match(page, /createMetadataProvider/);
  assert.match(page, /updateMetadataProvider/);
  assert.match(page, /reorderMetadataProviders/);
  assert.match(page, /useSortable/);
  assert.match(page, /handle: "\.drag-handle"/);
  assert.match(page, /draggable: "\.sortable-item"/);
  assert.match(page, /'sortable-item': row\.provider/);
  assert.match(
    page,
    /class="drag-handle cursor-grab rounded-md p-1 text-muted-foreground active:cursor-grabbing"\s*:aria-label="t\('settings\.metadata\.drag'\)"/,
  );
  assert.match(
    page,
    /variant="destructive"[\s\S]*?settings\.metadata\.resetAction/,
  );
  assert.match(page, /configurationFields/);
  assert.match(page, /credentialField/);
  assert.match(page, /@peridot\/ui\/components\/ui\/switch/);
  assert.match(page, /providerRows/);
  assert.match(page, /syncProviderRows/);
  assert.match(page, /v-for="row in providerRows"/);
  assert.match(page, /row\.definition\.nameMessage/);
  assert.match(page, /common\.notConfigured/);
  assert.match(page, /providerStatusLabel/);
  assert.match(page, /providerStatusClass/);
  assert.match(page, /text-warning/);
  assert.match(page, /text-success/);
  assert.match(page, /'opacity-60': !row\.provider/);
  assert.match(page, /providerNeedsConfiguration/);
  assert.match(page, /settings\.metadata\.configurationRequired/);
  assert.match(page, /TooltipRoot/);
  assert.match(page, /TooltipContent/);
  assert.match(page, /providerIcon\(row\.definition\.kind\)/);
  assert.match(page, /settings\.metadata\.configure/);
  assert.match(page, /v-model="formEnabled"/);
  assert.match(page, /enabled: formEnabled\.value/);
  assert.match(
    page,
    /import \{ ProgressCircle \} from "@peridot\/ui\/components\/ui\/progress-circle"/,
  );
  assert.match(page, /runningMetadataTask\(tasks\.value\)/);
  assert.match(
    page,
    /return provider\?\.enabled \? metadataTask\.value : null/,
    "Every enabled provider shares the stable running metadata task",
  );
  assert.match(
    page,
    /<TooltipRoot\s+v-if="row\.provider && providerTask\(row\.provider\)"/,
  );
  assert.match(
    page,
    /<TooltipProvider\s+v-else-if="providerRows\.length"\s+:delay-duration="150"/,
  );
  assert.match(page, /tabindex="0"/);
  assert.match(page, /side="bottom"/);
  assert.match(page, /providerTaskTitle\(row\.provider\)/);
  assert.match(page, /providerTaskStatus\(row\.provider\)/);
  assert.match(page, /providerTaskProgressLabel\(row\.provider\)/);
  assert.match(page, /taskStatusMessage\(task\)/);
  assert.match(page, /taskProgressMessage\(task\)/);
  assert.match(page, /:value="providerProgress\(row\.provider\)"/);
  assert.match(page, /settings\.metadata\.progress/);
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
    /settings\.metadata\.discogsSettings[\s\S]*?:icon="icons\.externalLink"[\s\S]*?<\/a\s*>/,
  );
  assert.match(page, /settings\.metadata\.createToken/);
  assert.match(page, /:icon="icons\.externalLink"/);
  assert.match(page, /selectedDefinition\.credentialField\.helpMessage/);
  assert.match(
    icons,
    /import discogs from "@iconify-icons\/simple-icons\/discogs"/,
  );
  assert.match(
    icons,
    /import musicbrainz from "@iconify-icons\/simple-icons\/musicbrainz"/,
  );
  assert.match(page, /settings\.metadata\.refresh/);
  assert.match(
    page,
    /:disabled="!activeProviders\.length \|\| hasActiveTasks \|\| serverLost"/,
  );
  assert.match(
    page,
    /hasActiveTasks[\s\S]*?common\.processing[\s\S]*?settings\.metadata\.refresh/,
  );
  assert.match(page, /queueMetadataRefresh/);
  assert.match(page, /resetMetadata/);
  assert.match(page, /settings\.metadata\.resetTitle/);
  assert.match(page, /notifyMetadataReset/);
  assert.match(page, /invalidateCatalog/);
  assert.match(page, /settings\.metadata\.resetConfirmTitle/);
  assert.match(page, /settings\.metadata\.resetConfirmDescription/);
  assert.doesNotMatch(page, /Disable metadata provider\?/);
  assert.doesNotMatch(page, /Display name/);
  assert.doesNotMatch(page, /provider-name/);
  assert.doesNotMatch(page, /Remove metadata provider/);
  assert.match(page, /AlertDialogRoot/);
});

test("tasks have a settings view for active work and paginated history", async () => {
  const page = await readSource("../app/pages/settings/tasks.vue");
  assert.match(page, /useUser/);
  assert.match(page, /canManageTasks/);
  assert.doesNotMatch(page, /v-if="!canManageTasks"/);
  assert.doesNotMatch(page, /settings\.tasks\.adminRequired/);
  assert.match(page, /useOfflineDownloadTasks/);
  assert.match(page, /isDownloadTaskTerminal/);
  assert.match(page, /downloadActiveRow/);
  assert.match(page, /downloadHistoryRow/);
  assert.match(page, /downloadTasks\.cancel/);
  assert.match(page, /downloadTasks\.retry/);
  assert.match(page, /downloadTasks\.progressForTask/);
  assert.match(
    page,
    /onMounted\(\(\) => \{\s+void downloadTasks\.refresh\(\);[\s\S]*?void refresh\(\)[\s\S]*?if \(canManageTasks\.value\) void refreshHistory\(\)/,
  );
  assert.match(page, /useTasks/);
  assert.match(page, /isCancellingTask/);
  assert.match(page, /cancelTask/);
  assert.match(page, /settings\.tasks\.cancelTask/);
  assert.match(page, /icons\.close/);
  assert.match(page, /v-if="row\.action === 'cancel'"/);
  assert.match(page, /size="icon-sm"/);
  assert.match(page, /class="size-5"/);
  assert.match(page, /settings\.tasks\.stop/);
  assert.match(page, /settings\.tasks\.stopping/);
  assert.match(page, /runRowAction\(row\)/);
  assert.match(page, /orderedActiveTasks\(visibleServerActiveTasks\.value\)/);
  assert.match(page, /task\.kind === "release_import"/);
  assert.match(page, /task\.ownerUserId === user\.value\?\.id/);
  assert.match(page, /useTaskHistoryQuery/);
  assert.match(page, /historyQuery\.loadMore\(\)/);
  assert.match(page, /settings\.tasks\.inProgress/);
  assert.match(page, /<h3 id="task-history-heading"/);
  assert.match(page, /settings\.tasks\.history/);
  assert.match(page, /taskProgressMessage\(task\)/);
  assert.match(page, /taskStatusMessage\(task\)/);
  assert.match(page, /settings\.tasks\.artworkFetch/);
  assert.match(page, /task\.failureMessage/);
  assert.match(page, /TASK_ACTIVE_METADATA_PROVIDER_DETAIL_KEY/);
  assert.match(page, /settings\.tasks\.loadingOlder/);
  assert.match(page, /<AutoLoadMore/);
  assert.match(page, /@load="loadMoreHistory"/);
  assert.doesNotMatch(page, /@click="loadMoreHistory"/);
  assert.match(page, /visibleDetails\(task\)/);
  assert.match(page, /estimatedTaskRemainingMs/);
  assert.match(page, /formatRemainingDuration/);
  assert.match(page, /serverRemainingLabel\(task\)/);
  assert.match(page, /serverQueuedLabel\(task\)/);
  assert.match(page, /downloadRemainingLabel\(task\)/);
  assert.match(page, /downloadQueuedLabel\(task\)/);
  assert.match(page, /settings\.tasks\.remaining/);
  assert.match(page, /settings\.tasks\.lessThanMinute/);
  assert.match(page, /useIntervalFn\(update, 10_000/);
  assert.match(page, /formatTimeAgo/);
  assert.match(page, /useNow/);
  assert.match(page, /formatTimeAgo\(timestamp, now\.value, locale\.value\)/);
  assert.match(
    page,
    /<time\s+v-if="row\.timeLabel && row\.timeDateTime"\s+:datetime="row\.timeDateTime"\s+:title="row\.timeTitle \?\? undefined"/,
  );
});

test("administrators can create, edit, promote, and delete managed accounts", async () => {
  const page = await readSource("../app/pages/settings/users.vue");

  assert.match(page, /layout: "settings"/);
  assert.match(page, /useAdminUsersQuery/);
  assert.match(page, /createManagedUser/);
  assert.match(page, /updateManagedUser/);
  assert.match(page, /deleteManagedUser/);
  assert.match(page, /canManageUsers/);
  assert.match(page, /settings\.users\.adminRequired/);
  assert.match(page, /settings\.users\.title/);
  assert.match(page, /id="user-accounts-heading"/);
  assert.match(page, /settings\.users\.add/);
  assert.match(page, /v-for="account in users"/);
  assert.match(page, /gravatarUrl\(account\.email, 80\)/);
  assert.match(page, /{{ account\.email }}/);
  assert.match(page, /:src="avatarSource\(account\)"/);
  assert.match(page, /@error="markAvatarFailed\(account\)"/);
  assert.match(page, /class="size-10 shrink-0 rounded-full object-cover"/);
  assert.match(page, /roleLabel\(account\.role\)/);
  assert.match(page, /account\.role === 'admin' \? 'default' : 'secondary'/);
  assert.match(page, /@click="openEditDialog\(account\)"/);
  assert.match(page, /@click="requestDelete\(account\)"/);
  assert.match(page, /account\.id === user\?\.id/);
  assert.match(page, /settings\.users\.accounts/);
  assert.match(page, /settings\.users\.description/);
  assert.match(page, /settings\.users\.addDescription/);
  assert.match(page, /@click="setRole\('member'\)"/);
  assert.match(page, /@click="setRole\('admin'\)"/);
  assert.match(page, /settings\.users\.ownRole/);
  assert.match(page, /settings\.users\.passwordEditHelp/);
  assert.match(page, /managedPasswordPairValid\(/);
  assert.match(page, /dialogMode === 'create' \|\| formPassword/);
  assert.match(
    page,
    /id="managed-user-password-confirmation"[\s\S]*?required[\s\S]*?minlength="12"/,
  );
  assert.match(page, /managedPasswordConfirmationMismatch/);
  assert.match(page, /settings\.users\.deleteTitle/);
  assert.match(page, /settings\.users\.deleteDescription/);
  assert.match(page, /settings\.users\.newPassword/);
});

test("server settings leave source refresh without library status management", async () => {
  const page = await readSource("../app/pages/settings/server.vue");
  assert.doesNotMatch(page, /Library status/);
  assert.doesNotMatch(page, /Rescan library/);
  assert.doesNotMatch(page, /listSources/);
  assert.match(page, /useServerSettingsQuery/);
  assert.doesNotMatch(page, /sourceRefreshEnabled/);
  assert.doesNotMatch(page, /sourceRefreshCron/);
  assert.doesNotMatch(page, /saveSourceRefresh/);
  assert.doesNotMatch(page, /settings\.server\.scheduleTitle/);
  assert.doesNotMatch(page, /settings\.server\.scheduleCronHelp/);
  assert.doesNotMatch(page, /https:\/\/crontab\.guru\//);
  assert.doesNotMatch(page, /settings\.server\.scheduleCronHelpLink/);
  assert.match(page, /useServerLogsQuery/);
  assert.match(page, /settings\.server\.log/);
  assert.match(page, /settings\.server\.search/);
  assert.match(page, /settings\.server\.categories/);
  assert.match(page, /settings\.server\.fileLogging\.enabled/);
  assert.match(page, /settings\.server\.fileLogging\.enabledHelp/);
  assert.match(page, /settings\.server\.fileLogging\.retentionDays/);
  assert.match(page, /settings\.server\.fileLogging\.retentionDaysHelp/);
  assert.match(page, /settings\.server\.fileLogging\.path/);
  assert.match(page, /@update:model-value="changeFileLogging"/);
  assert.doesNotMatch(page, /@click="saveFileLogging"/);
  assert.match(page, /@blur="saveFileLogging"/);
  assert.match(page, /@keydown\.enter\.prevent="saveFileLogging"/);
  assert.match(
    page,
    /fileLogging:\s*\{\s*enabled:\s*fileLoggingEnabled\.value,\s*retentionDays,\s*\}/,
  );
  assert.match(page, /settings\.server\.scanning\.workerCount/);
  assert.match(page, /settings\.server\.scanning\.warning/);
  assert.match(page, /scanning: \{ workerCount \}/);
  assert.match(page, /@blur="saveScanWorkerCount"/);
  assert.match(page, /@keydown\.enter\.prevent="saveScanWorkerCount"/);
  assert.doesNotMatch(page, /@click="saveScanWorkerCount"/);
});

test("server settings confirm before restarting the connected server", async () => {
  const page = await readSource("../app/pages/settings/server.vue");
  const serverCard = page.slice(
    page.indexOf('<section aria-labelledby="server-heading"'),
    page.indexOf('<AlertDialogRoot v-model:open="restartOpen">'),
  );
  const restartDialog = page.slice(
    page.indexOf('<AlertDialogRoot v-model:open="restartOpen">'),
    page.indexOf('<AlertDialogRoot v-model:open="disconnectOpen">'),
  );

  assert.match(page, /requestServerRestart/);
  assert.match(serverCard, /@click="requestRestart"/);
  assert.match(
    serverCard,
    /variant="destructive"[\s\S]*?@click="requestRestart"/,
  );
  assert.match(
    serverCard,
    /:disabled="restarting \|\| connectionStatus === 'lost'"/,
  );
  assert.match(page, /useServerConnection/);
  assert.match(page, /status === "lost"/);
  assert.match(page, /status === "connected" && restartSawDisconnect/);
  assert.match(page, /settings\.server\.restartComplete/);
  assert.doesNotMatch(serverCard, /@click="confirmRestart"/);
  assert.match(restartDialog, /settings\.server\.restartTitle/);
  assert.match(restartDialog, /settings\.server\.restartDescription/);
  assert.match(restartDialog, /<AlertDialogCancel as-child>/);
  assert.match(restartDialog, /variant="destructive"/);
  assert.match(restartDialog, /@click="confirmRestart"/);
  assert.match(page, /settings\.server\.restartRequested/);
});

test("server settings expose channel update checks without automatic installation", async () => {
  const page = await readSource("../app/pages/settings/server.vue");
  const updateCard = page.slice(
    page.indexOf('<section aria-labelledby="software-updates-heading"'),
    page.indexOf('<section aria-labelledby="server-heading"'),
  );

  assert.match(page, /useUpdatesQuery/);
  assert.match(page, /useRuntimeConfig/);
  assert.match(page, /runtimeConfig\.public\.clientVersion/);
  assert.match(updateCard, /settings\.server\.updates\.serverVersion/);
  assert.match(updateCard, /settings\.server\.updates\.clientVersion/);
  assert.match(updateCard, /\{\{ updateStatus\?\.version \?\? "—" \}\}/);
  assert.match(updateCard, /\{\{ clientVersion \}\}/);
  assert.match(updateCard, /settings\.server\.updates\.channel/);
  assert.match(updateCard, /settings\.server\.updates\.revision/);
  assert.match(updateCard, /@click="checkUpdates"/);
  assert.match(updateCard, /updateStatus\?\.state === 'available'/);
  assert.match(updateCard, /settings\.server\.updates\.manualHelp/);
  assert.doesNotMatch(
    updateCard,
    /requestInstall|installOpen|installAvailable/,
  );
});

test("server settings confirm before disconnecting from the connected server", async () => {
  const page = await readSource("../app/pages/settings/server.vue");
  const serverCard = page.slice(
    page.indexOf('<section aria-labelledby="server-heading"'),
    page.indexOf('<AlertDialogRoot v-model:open="restartOpen">'),
  );
  const disconnectControl = page.slice(
    page.indexOf(
      '<div id="server-disconnect" class="mt-auto flex justify-end">',
    ),
    page.indexOf("</template>", page.indexOf('id="server-disconnect"')),
  );
  const disconnectDialog = page.slice(
    page.indexOf('<AlertDialogRoot v-model:open="disconnectOpen">'),
  );

  assert.match(page, /revokeSession/);
  assert.match(
    serverCard,
    /class="flex flex-col gap-4 rounded-lg border bg-card p-6 text-card-foreground sm:flex-row sm:items-center sm:justify-between"/,
  );
  assert.doesNotMatch(serverCard, /@click="requestDisconnect"/);
  assert.match(disconnectControl, /variant="destructive"/);
  assert.match(
    disconnectControl,
    /variant="destructive"[\s\S]*?:disabled="disconnecting"/,
  );
  assert.match(disconnectControl, /@click="requestDisconnect"/);
  assert.doesNotMatch(disconnectControl, /@click="confirmDisconnect"/);
  assert.match(disconnectDialog, /settings\.server\.disconnectTitle/);
  assert.match(disconnectDialog, /settings\.server\.disconnectDescription/);
  assert.match(disconnectDialog, /<AlertDialogCancel as-child>/);
  assert.match(disconnectDialog, /@click="confirmDisconnect"/);
  assert.match(page, /address\.value = null/);
  assert.match(page, /token\.value = null/);
  assert.match(page, /user\.value = null/);
  assert.match(page, /navigateTo\("\/onboarding", \{ replace: true \}\)/);
});

test("profile settings omit email and update the editable display name", async () => {
  const page = await readSource("../app/pages/settings/account.vue");

  assert.match(page, /settings\.account\.title/);
  assert.match(page, /updateUserProfile/);
  assert.match(
    page,
    /const displayName = ref\(user\.value\?\.displayName \?\? ""\)/,
  );
  assert.doesNotMatch(page, /id="account-email"/);
  assert.doesNotMatch(page, /settings\.account\.email/);
  assert.doesNotMatch(page, /settings\.account\.emailHelp/);
  assert.match(page, /id="account-display-name"/);
  assert.match(page, /autocomplete="nickname"/);
  assert.match(page, /minlength="2"/);
  assert.match(page, /maxlength="80"/);
  assert.match(page, /user\.value = updated/);
  assert.match(page, /settings\.account\.updated/);
  assert.match(page, /@submit\.prevent="saveProfile"/);
  assert.match(page, /@blur="saveProfile"/);
  assert.doesNotMatch(page, /common\.saveChanges/);
  assert.doesNotMatch(page, /username|Username/);
});

test("the local-files picker includes accessible deep folder search", async () => {
  const folderTree = await readSource("../app/components/FolderTree.vue");
  assert.match(folderTree, /v-model="searchQuery"/);
  assert.match(folderTree, /t\('components\.folder\.search'\)/);
  assert.match(folderTree, /searchDirectories/);
  assert.match(folderTree, /components\.folder\.searching/);
  assert.match(folderTree, /searchError/);
  assert.match(folderTree, /searchTruncated/);
  assert.match(folderTree, /components\.folder\.noMatches/);
});
