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
  for (const category of ["account", "library", "playback"]) {
    assert.match(layout, new RegExp(`to: "/settings/${category}"`));
  }
  assert.match(commonCategories, /name: "Profile"/);
  assert.doesNotMatch(commonCategories, /name: "Account"/);
  for (const category of [
    "plugins",
    "tasks",
    "users",
    "sources",
    "metadata",
    "server",
  ]) {
    assert.match(adminCategories, new RegExp(`to: "/settings/${category}"`));
  }
  assert.match(adminCategories, /name: "User Management"/);
  assert.doesNotMatch(commonCategories, /to: "\/settings\/tasks"/);
  assert.doesNotMatch(commonCategories, /to: "\/settings\/plugins"/);
  assert.match(layout, /user\?\.role === 'admin'/);
  assert.match(layout, /aria-labelledby="admin-settings-heading"/);
  assert.match(layout, /class="space-y-1 border-t border-sidebar-border pt-4"/);
  assert.match(layout, />\s*Admin\s*</);
  assert.doesNotMatch(layout, /name: "Administration"/);
  assert.match(layout, /import TaskProgressIndicator/);
  assert.match(layout, /<TaskProgressIndicator \/>/);
  for (const page of [
    "plugins",
    "tasks",
    "users",
    "sources",
    "metadata",
    "server",
  ]) {
    const source = await readSource(`../app/pages/settings/${page}.vue`);
    assert.match(source, /layout: "settings"/);
  }
});

test("/settings redirects to account and /plugins redirects into settings", async () => {
  const index = await readSource("../app/pages/settings/index.vue");
  assert.match(index, /navigateTo\("\/settings\/account"/);
  const plugins = await readSource("../app/pages/plugins.vue");
  assert.match(plugins, /navigateTo\("\/settings\/plugins"/);
});

test("settings sidebar confirms before logout and retains the selected server", async () => {
  const layout = await readSource("../app/layouts/settings.vue");
  const logoutFooter = layout.slice(
    layout.indexOf('<div class="shrink-0 border-t border-sidebar-border p-3">'),
    layout.indexOf("</aside>"),
  );
  const logoutDialog = layout.slice(
    layout.indexOf('<AlertDialogRoot v-model:open="logoutOpen">'),
    layout.indexOf("</AlertDialogRoot>"),
  );

  assert.match(layout, /useServer/);
  assert.match(layout, /useSession/);
  assert.match(layout, /revokeSession/);
  assert.match(layout, /token\.value = null/);
  assert.match(layout, /user\.value = null/);
  assert.doesNotMatch(layout, /address\.value = null/);
  assert.match(layout, /query: \{ auth: "login", redirect: route\.fullPath \}/);
  assert.match(logoutFooter, /:icon="icons\.logout"/);
  assert.match(logoutFooter, /Logging out…/);
  assert.match(logoutFooter, /Log out/);
  assert.match(logoutFooter, /:disabled="loggingOut"/);
  assert.match(logoutFooter, /@click="requestLogout"/);
  assert.doesNotMatch(logoutFooter, /@click="confirmLogout"/);
  assert.match(layout, /AlertDialogRoot/);
  assert.match(logoutDialog, /Log out of Peridot\?/);
  assert.match(logoutDialog, /Your current session will end\./);
  assert.match(logoutDialog, /<AlertDialogCancel as-child>/);
  assert.match(logoutDialog, /@click="confirmLogout"/);
});

test("the header places task progress before the account avatar", async () => {
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
    /import TaskProgressIndicator from "\.\.\/components\/TaskProgressIndicator\.vue"/,
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
    /<TaskProgressIndicator \/>[\s\S]*?to="\/settings\/account"/,
  );
  assert.match(header, /to="\/settings\/account"/);
  assert.match(header, /aria-label="Open profile settings"/);
  assert.match(header, /:icon="icons\.settings"/);
  assert.match(header, /group-hover\/avatar:opacity-100/);
  assert.match(header, /group-focus-visible\/avatar:opacity-100/);
  assert.match(layout, /gravatarUrl/);
  assert.match(layout, /@peridot\/ui\/assets\/brand\/logo\.svg/);
  assert.match(layout, /flex-1 justify-start text-lg font-semibold/);
  assert.match(
    layout,
    /<img\s+:src="logoNop"\s+alt=""\s+class="size-6 p-0\.5"\s*\/>\s*Peridot/,
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
  assert.match(
    page,
    /class="cursor-grab rounded-md p-1 text-muted-foreground active:cursor-grabbing"\s*aria-label="Drag to reorder source"/,
  );
  assert.match(page, /AlertDialogRoot/);
  assert.match(page, /DialogRoot/);
  assert.match(page, /<FolderTree/);
  assert.match(page, /sourceFolderName\(source\.path \?\? ""\)/);
  assert.match(page, /sourceKindIcon\(source\.kind\)/);
  assert.match(page, /sourceKindLabel\(source\.kind\)/);
  assert.match(page, /:title="sourceKindLabel\(source\.kind\)"/);
  assert.match(page, /block font-medium/);
  assert.match(page, /block break-all text-xs text-muted-foreground/);
  assert.doesNotMatch(page, /Badge variant="secondary">\{\{ source\.kind/);
  assert.match(
    page,
    /<Icon :icon="icons\.folder" aria-hidden="true" class="size-5" \/>\s*Local files/,
  );
  assert.match(
    page,
    /<Icon :icon="icons\.globe" aria-hidden="true" class="size-5" \/>\s*Remote URL/,
  );
  assert.match(
    page,
    /:title="source\.kind === 'path' \? \(source\.path \?\? ''\) : undefined"/,
  );
  assert.match(page, /useTasks/);
  assert.match(page, /queueLibraryScan/);
  assert.match(
    page,
    /if \(source\.kind === "path"\)[\s\S]*?trackTask\(source\.task\)/,
  );
  assert.match(page, /await queueLibraryScan\(\)/);
  assert.match(page, />\s*Rescan all\s*</);
  assert.match(page, /@click="rescanAll"/);
  assert.match(page, /DropdownMenuRoot/);
  assert.match(page, /DropdownMenuItem/);
  assert.match(
    page,
    /<DropdownMenuItem[\s\S]*?class="flex cursor-pointer[\s\S]*?Rescan/,
  );
  assert.match(
    page,
    /<DropdownMenuItem[\s\S]*?class="flex cursor-pointer[\s\S]*?Remove/,
  );
  assert.match(page, /data-disabled:cursor-default/);
  assert.match(page, /queueSourceScan/);
  assert.match(page, /:disabled="source\.kind !== 'path'"/);
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
  assert.match(
    page,
    /class="cursor-grab rounded-md p-1 text-muted-foreground active:cursor-grabbing"\s*aria-label="Drag to reorder metadata provider"/,
  );
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
  assert.match(
    page,
    /:disabled="!activeProviders\.length \|\| hasActiveTasks"/,
  );
  assert.match(page, /hasActiveTasks \? "Processing…" : "Refresh metadata"/);
  assert.match(page, /queueMetadataRefresh/);
  assert.match(page, /resetMetadata/);
  assert.match(page, /Reset all track metadata/);
  assert.match(page, /notifyMetadataReset/);
  assert.match(page, /invalidateCatalog/);
  assert.match(page, /Reset all track metadata\?/);
  assert.match(page, /Peridot will display the original tags/);
  assert.match(page, /Providers and audio files are not changed/);
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
  assert.match(page, /v-if="!canManageTasks"/);
  assert.match(page, /Administrator access is required\./);
  assert.match(
    page,
    /onMounted\(\(\) => \{\s+if \(!canManageTasks\.value\) return;/,
  );
  assert.match(page, /useTasks/);
  assert.match(page, /orderedActiveTasks\(activeTasks\.value\)/);
  assert.match(page, /status: "terminal"/);
  assert.match(page, /limit: HISTORY_PAGE_SIZE/);
  assert.match(page, /offset: history\.value\.length/);
  assert.match(page, /In progress/);
  assert.match(page, /<h3 id="task-history-heading"/);
  assert.match(page, />\s*History\s*</);
  assert.match(page, /taskProgressLabel\(task\)/);
  assert.match(page, /taskStatusLabel\(task\)/);
  assert.match(page, /task\.failureSummary/);
  assert.match(page, /Load older tasks/);
  assert.match(page, /@click="loadMoreHistory"/);
  assert.match(page, /visibleDetails\(task\)/);
  assert.match(page, /taskTimeLabel\(task\)/);
});

test("administrators can create, edit, promote, and delete managed accounts", async () => {
  const page = await readSource("../app/pages/settings/users.vue");

  assert.match(page, /layout: "settings"/);
  assert.match(page, /listUsers/);
  assert.match(page, /createManagedUser/);
  assert.match(page, /updateManagedUser/);
  assert.match(page, /deleteManagedUser/);
  assert.match(page, /canManageUsers/);
  assert.match(
    page,
    /Administrator access is required to manage user accounts\./,
  );
  assert.match(page, />User Management<\/h2>/);
  assert.match(page, /id="user-accounts-heading"/);
  assert.match(page, />\s*Add account\s*</);
  assert.match(page, /v-for="account in users"/);
  assert.match(page, /gravatarUrl\(account\.email, 80\)/);
  assert.match(page, /:src="avatarSource\(account\)"/);
  assert.match(page, /@error="markAvatarFailed\(account\)"/);
  assert.match(page, /class="size-10 shrink-0 rounded-full object-cover"/);
  assert.match(page, /roleLabel\(account\.role\)/);
  assert.match(page, /account\.role === 'admin' \? 'default' : 'secondary'/);
  assert.match(page, /@click="openEditDialog\(account\)"/);
  assert.match(page, /@click="requestDelete\(account\)"/);
  assert.match(page, /account\.id === user\?\.id/);
  assert.match(page, /User accounts/);
  assert.match(page, /Create accounts and control who can administer/);
  assert.match(page, /Create a user or another administrator account\./);
  assert.match(page, /@click="setRole\('member'\)"/);
  assert.match(page, /@click="setRole\('admin'\)"/);
  assert.match(page, /Your own administrator role cannot be changed here\./);
  assert.match(page, /Leave blank to keep the current password\./);
  assert.match(page, /managedPasswordPairValid\(/);
  assert.match(page, /dialogMode === 'create' \|\| formPassword/);
  assert.match(
    page,
    /id="managed-user-password-confirmation"[\s\S]*?required[\s\S]*?minlength="12"/,
  );
  assert.match(page, /managedPasswordConfirmationError/);
  assert.match(page, /Delete \{\{ pendingDelete\?\.displayName \}\}\?/);
  assert.match(page, /permanently deletes the account and its sessions/);
  assert.match(page, /dialogMode === "create"[\s\S]*?"New password"/);
});

test("server settings no longer contain source or library status management", async () => {
  const page = await readSource("../app/pages/settings/server.vue");
  assert.doesNotMatch(page, /Library status/);
  assert.doesNotMatch(page, /Rescan library/);
  assert.doesNotMatch(page, /listSources/);
  assert.doesNotMatch(page, /fetchServerSettings/);
  assert.match(page, /fetchLogs/);
  assert.match(page, /Server log/);
  assert.match(page, /Search server log/);
  assert.match(page, /Categories/);
});

test("server settings confirm before disconnecting from the connected server", async () => {
  const page = await readSource("../app/pages/settings/server.vue");
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

test("profile settings show email and update the editable display name", async () => {
  const page = await readSource("../app/pages/settings/account.vue");

  assert.match(page, />Profile<\/h2>/);
  assert.match(page, /updateUserProfile/);
  assert.match(
    page,
    /const displayName = ref\(user\.value\?\.displayName \?\? ""\)/,
  );
  assert.match(page, /id="account-email"/);
  assert.match(page, /readonly/);
  assert.match(page, /id="account-display-name"/);
  assert.match(page, /autocomplete="nickname"/);
  assert.match(page, /minlength="2"/);
  assert.match(page, /maxlength="80"/);
  assert.match(page, /user\.value = updated/);
  assert.match(page, /Display name updated\./);
  assert.match(page, /@submit\.prevent="saveProfile"/);
  assert.match(page, /:disabled="saving \|\| !displayNameValid"/);
  assert.doesNotMatch(page, /username|Username/);
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
