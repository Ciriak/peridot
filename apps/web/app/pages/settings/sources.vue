<script setup lang="ts">
import {
  computed,
  definePageMeta,
  onMounted,
  ref,
  useI18n,
  watch,
} from "#imports";
import { Icon } from "@iconify/vue/offline";
import type {
  CreateSourceRequest,
  PluginResponse,
  PluginSourceFieldDefinition,
  PluginSourceOptionResponse,
  SourceResponse,
} from "@peridot/contracts";
import { Button } from "@peridot/ui/components/ui/button";
import { Input } from "@peridot/ui/components/ui/input";
import { ProgressCircle } from "@peridot/ui/components/ui/progress-circle";
import { Switch } from "@peridot/ui/components/ui/switch";
import { useSortable } from "@vueuse/integrations/useSortable";
import {
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogOverlay,
  AlertDialogPortal,
  AlertDialogRoot,
  AlertDialogTitle,
  DialogContent,
  DialogDescription,
  DialogOverlay,
  DialogPortal,
  DialogRoot,
  DialogTitle,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuPortal,
  DropdownMenuRoot,
  DropdownMenuTrigger,
  TooltipContent,
  TooltipPortal,
  TooltipProvider,
  TooltipRoot,
  TooltipTrigger,
} from "reka-ui";
import { useServer } from "../../composables/use-server";
import { useServerConnection } from "../../composables/use-server-connection";
import { useSession } from "../../composables/use-session";
import { useCatalogRevision } from "../../composables/use-catalog-query";
import {
  useAdminSourcesQuery,
  usePluginsQuery,
  useServerSettingsQuery,
} from "../../composables/use-admin-queries";
import { useTasks } from "../../composables/use-tasks";
import { useUser } from "../../composables/use-user";
import { useLocalizedMessage } from "../../composables/use-localized-message";
import { icons } from "../../lib/icons";
import {
  createSource,
  deleteSource,
  discoverPluginSources,
  isAuthenticationRedirectError,
  reorderSources,
} from "../../lib/peridot-client";
import { sourceFolderName } from "../../lib/source-label";
import {
  activeTaskForSource,
  sourceTaskProgress,
  taskProgressMessage,
  taskStatusMessage,
} from "../../lib/task-progress";
import { notifySourceMutation } from "../../lib/toasts";

definePageMeta({ layout: "settings" });

const { t, d } = useI18n();
const { errorMessage, translate } = useLocalizedMessage();
const { address } = useServer();
const { token } = useSession();
const { user } = useUser();
const { status: serverStatus } = useServerConnection();
const {
  queueLibraryScan,
  queueSourceScan,
  tasks,
  track: trackTask,
} = useTasks();
const allowed = computed(() => user.value?.role === "admin");
const serverLost = computed(() => serverStatus.value === "lost");

const sourcesQuery = useAdminSourcesQuery();
const pluginsQuery = usePluginsQuery();
const serverSettings = useServerSettingsQuery();
const { invalidate: invalidateCatalog, resetOfflineCatalog } =
  useCatalogRevision();
const sources = ref<SourceResponse[]>([]);
const sourceList = ref<HTMLElement | null>(null);
const loading = sourcesQuery.loading;
const pageError = ref("");
const addOpen = ref(false);
type SourceChoice = "path" | string;
const newKind = ref<SourceChoice | null>(null);
const newPath = ref("");
const newPlugin = ref<PluginResponse | null>(null);
const newConfiguration = ref<Record<string, string>>({});
const pluginOptions = ref<PluginSourceOptionResponse[]>([]);
const discoveringSources = ref(false);
const adding = ref(false);
const addError = ref("");
const removeOpen = ref(false);
const pendingDelete = ref<SourceResponse | null>(null);
const pendingSourceDeletions = ref<Set<string>>(new Set());
const sourceRefreshEnabled = ref(true);
const sourceRefreshCron = ref("0 3 * * *");
const sourceRefreshSaving = ref(false);
const sourceRefreshNotice = ref("");
const sourceRefreshError = ref("");

watch(
  serverSettings.settings,
  (settings) => {
    if (!settings) return;
    sourceRefreshEnabled.value = settings.sourceRefresh.enabled;
    sourceRefreshCron.value = settings.sourceRefresh.cron;
  },
  { immediate: true },
);

const nextSourceRefresh = computed(() => {
  const nextRunAt = serverSettings.settings.value?.sourceRefresh.nextRunAt;
  return nextRunAt ? d(new Date(nextRunAt), "medium") : null;
});

useSortable(sourceList, sources, {
  animation: 150,
  handle: ".drag-handle",
  watchElement: true,
  onEnd: () => void persistOrder(),
});

const installedSourcePlugins = computed(() =>
  pluginsQuery.items.value.filter(
    (plugin) =>
      plugin.installed &&
      plugin.enabled &&
      !plugin.restartRequired &&
      plugin.contributions.some(
        (contribution) => contribution.kind === "source",
      ),
  ),
);

const newPluginFields = computed<PluginSourceFieldDefinition[]>(() => {
  const contribution = newPlugin.value?.contributions.find(
    (candidate) => candidate.kind === "source",
  );
  return contribution?.kind === "source"
    ? contribution.configurationFields.filter((field) => field.visible)
    : [];
});

const newPluginDiscovery = computed(() => {
  const contribution = newPlugin.value?.contributions.find(
    (candidate) => candidate.kind === "source",
  );
  return contribution?.kind === "source" ? contribution.discovery : null;
});

function sourcePlugin(source: SourceResponse): PluginResponse | null {
  return (
    pluginsQuery.items.value.find((plugin) => plugin.id === source.pluginId) ??
    null
  );
}

function sourceLabel(source: SourceResponse | null): string {
  if (!source) return "";
  if (source.kind === "path") return source.path ?? "";
  if (source.kind === "url") return source.url ?? "";
  return source.name || source.pluginId || "";
}

function sourceKindIcon(source: SourceResponse) {
  if (source.kind === "path") return icons.folder;
  if (source.kind === "url") return icons.globe;
  if (sourcePlugin(source)?.icon === "jellyfin") return icons.jellyfin;
  return icons.plugins;
}

function sourceKindLabel(source: SourceResponse): string {
  if (source.kind === "path") return t("settings.sources.path");
  if (source.kind === "url") return t("settings.sources.url");
  return sourcePlugin(source)?.name ?? source.pluginId ?? t("settings.plugins");
}

function sourceDetail(source: SourceResponse): string | null {
  if (source.kind === "path") return source.path;
  if (source.kind === "url") return source.url;
  return source.configuration?.url ?? null;
}

function sourceTask(source: SourceResponse) {
  return activeTaskForSource(tasks.value, source.id);
}

function sourceProgress(source: SourceResponse): number | null {
  const task = sourceTask(source);
  return task ? sourceTaskProgress(task) : null;
}

function sourceTaskTitle(source: SourceResponse): string {
  const task = sourceTask(source);
  return task ? translate(task.titleMessage) : "";
}

function sourceTaskStatus(source: SourceResponse): string {
  const task = sourceTask(source);
  return task ? translate(taskStatusMessage(task)) : "";
}

function sourceTaskProgressLabel(source: SourceResponse): string {
  const task = sourceTask(source);
  return task ? translate(taskProgressMessage(task)) : "";
}

function sourceFileCount(source: SourceResponse): string {
  const count = Number.isFinite(source.fileCount) ? source.fileCount : 0;
  return t("count.file", { count }, count);
}

function sourceLastSync(source: SourceResponse): string {
  return source.lastSyncedAt
    ? t("settings.sources.lastSync", {
        date: d(new Date(source.lastSyncedAt), "medium"),
      })
    : t("settings.sources.notSynced");
}

async function loadSources() {
  if (!allowed.value) return;
  pageError.value = "";
  await Promise.all([sourcesQuery.load(true), pluginsQuery.load(true)]);
}

watch(
  sourcesQuery.items,
  (items) => {
    sources.value = items.filter(
      (source) => !pendingSourceDeletions.value.has(source.id),
    );
  },
  { immediate: true },
);
watch(sourcesQuery.error, (value) => {
  if (value) pageError.value = value;
});

function openAddDialog() {
  addError.value = "";
  newKind.value = null;
  newPath.value = "";
  newPlugin.value = null;
  newConfiguration.value = {};
  pluginOptions.value = [];
  addOpen.value = true;
}

function chooseKind(kind: SourceChoice) {
  addError.value = "";
  newKind.value = kind;
  if (kind === "path") {
    newPlugin.value = null;
    return;
  }
  const plugin =
    installedSourcePlugins.value.find((candidate) => candidate.id === kind) ??
    null;
  newPlugin.value = plugin;
  newConfiguration.value = {};
  const contribution = plugin?.contributions.find(
    (candidate) => candidate.kind === "source",
  );
  if (contribution?.kind === "source") {
    for (const field of contribution.configurationFields) {
      newConfiguration.value[field.key] =
        newConfiguration.value[field.key] ?? "";
    }
  }
}

function closeAddDialog() {
  addOpen.value = false;
  newKind.value = null;
  newPath.value = "";
  newPlugin.value = null;
  newConfiguration.value = {};
  pluginOptions.value = [];
}

function handleDialogBack() {
  if (newKind.value) {
    newKind.value = null;
    newPath.value = "";
    newPlugin.value = null;
    newConfiguration.value = {};
    pluginOptions.value = [];
    addError.value = "";
  } else {
    closeAddDialog();
  }
}

function canAdd(): boolean {
  if (newKind.value === "path") return Boolean(newPath.value.trim());
  if (!newPlugin.value) return false;
  const contribution = newPlugin.value.contributions.find(
    (candidate) => candidate.kind === "source",
  );
  return (
    contribution?.kind === "source" &&
    contribution.configurationFields
      .filter((field) => field.required)
      .every((field) => Boolean(newConfiguration.value[field.key]?.trim()))
  );
}

async function addSource() {
  if (!newKind.value) return;
  adding.value = true;
  addError.value = "";
  let body: CreateSourceRequest;
  if (newKind.value === "path") {
    body = {
      kind: "path",
      path: newPath.value,
    };
  } else {
    if (!newPlugin.value) return;
    body = {
      kind: "plugin",
      pluginId: newPlugin.value.id,
      configuration: newConfiguration.value,
    };
  }
  try {
    const source = await createSource(
      address.value ?? "",
      token.value ?? "",
      body,
    );
    closeAddDialog();
    notifySourceMutation("added", sourceLabel(source));
    await loadSources();
    if (source.kind === "path" || source.kind === "plugin") {
      if (source.task) {
        trackTask(source.task);
      } else {
        pageError.value = t("settings.sources.noScan");
      }
    }
  } catch (reason) {
    if (isAuthenticationRedirectError(reason)) return;
    addError.value = errorMessage(reason, "settings.sources.addError");
  } finally {
    adding.value = false;
  }
}

async function discoverPluginSourceOptions() {
  if (!address.value || !token.value || !newPlugin.value) return;
  discoveringSources.value = true;
  addError.value = "";
  try {
    const response = await discoverPluginSources(
      address.value,
      token.value,
      newPlugin.value.id,
      { configuration: newConfiguration.value },
    );
    pluginOptions.value = response.items;
    const first = response.items[0];
    if (first) {
      newConfiguration.value = {
        ...newConfiguration.value,
        ...first.configuration,
      };
    }
  } catch (reason) {
    if (isAuthenticationRedirectError(reason)) return;
    addError.value = errorMessage(reason, "settings.sources.addError");
  } finally {
    discoveringSources.value = false;
  }
}

function selectPluginSource(option: PluginSourceOptionResponse) {
  newConfiguration.value = {
    ...newConfiguration.value,
    ...option.configuration,
  };
}

async function rescan(source: SourceResponse) {
  if (source.kind !== "path" && source.kind !== "plugin") return;
  pageError.value = "";
  try {
    await queueSourceScan(source.id);
  } catch (reason) {
    if (isAuthenticationRedirectError(reason)) return;
    pageError.value = errorMessage(reason, "settings.sources.rescanError");
  }
}

async function rescanAll() {
  pageError.value = "";
  try {
    await queueLibraryScan();
  } catch (reason) {
    if (isAuthenticationRedirectError(reason)) return;
    pageError.value = errorMessage(reason, "settings.sources.rescanAllError");
  }
}

function askRemove(source: SourceResponse) {
  pendingDelete.value = source;
  removeOpen.value = true;
}

function confirmRemove() {
  if (!pendingDelete.value) return;
  const removedSource = pendingDelete.value;
  const rollback = sourcesQuery.removeOptimistically(removedSource.id);
  if (!rollback) {
    pageError.value = t("settings.sources.removeError");
    return;
  }

  pendingSourceDeletions.value = new Set([
    ...pendingSourceDeletions.value,
    removedSource.id,
  ]);
  sources.value = sources.value.filter(
    (source) => source.id !== removedSource.id,
  );
  pendingDelete.value = null;
  removeOpen.value = false;
  pageError.value = "";
  notifySourceMutation("removed", sourceLabel(removedSource));

  let removalFailed = false;
  void deleteSource(address.value ?? "", token.value ?? "", removedSource.id)
    .then(async () => {
      await resetOfflineCatalog();
      invalidateCatalog();
    })
    .catch((reason) => {
      if (isAuthenticationRedirectError(reason)) return;
      removalFailed = true;
      pageError.value = errorMessage(reason, "settings.sources.removeError");
    })
    .finally(() => {
      const remaining = new Set(pendingSourceDeletions.value);
      remaining.delete(removedSource.id);
      pendingSourceDeletions.value = remaining;

      if (removalFailed) rollback();
    });
}

async function persistOrder() {
  try {
    await reorderSources(
      address.value ?? "",
      token.value ?? "",
      sources.value.map((source) => source.id),
    );
  } catch (reason) {
    if (isAuthenticationRedirectError(reason)) return;
    pageError.value = errorMessage(reason, "settings.sources.orderError");
  }
}

async function saveSourceRefresh() {
  if (sourceRefreshSaving.value) return;
  sourceRefreshSaving.value = true;
  sourceRefreshNotice.value = "";
  sourceRefreshError.value = "";
  try {
    await serverSettings.save({
      sourceRefresh: {
        enabled: sourceRefreshEnabled.value,
        cron: sourceRefreshCron.value,
      },
    });
    sourceRefreshNotice.value = t("settings.server.scheduleSaved");
  } catch (reason) {
    if (isAuthenticationRedirectError(reason)) return;
    sourceRefreshError.value = errorMessage(
      reason,
      "settings.server.scheduleSaveError",
    );
  } finally {
    sourceRefreshSaving.value = false;
  }
}

function changeSourceRefreshEnabled(enabled: boolean) {
  sourceRefreshEnabled.value = enabled;
  void saveSourceRefresh();
}

onMounted(() => {
  void loadSources();
  void serverSettings.load();
});
</script>

<template>
  <div class="space-y-2">
    <h2 class="text-2xl font-semibold tracking-tight">
      {{ t("settings.sources.title") }}
    </h2>
    <p class="text-sm text-muted-foreground">
      {{ t("settings.sources.description") }}
    </p>
  </div>

  <section
    v-if="!allowed"
    role="alert"
    class="rounded-lg border bg-card p-6 text-sm text-card-foreground"
  >
    {{ t("settings.sources.adminRequired") }}
  </section>

  <section v-else aria-labelledby="sources-heading" class="space-y-4">
    <div class="flex items-center justify-between gap-4">
      <h3 id="sources-heading" class="text-lg font-semibold">
        {{ t("settings.sources.heading") }}
      </h3>
      <div class="flex items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          :disabled="serverLost"
          @click="rescanAll"
        >
          <Icon :icon="icons.restart" aria-hidden="true" />
          {{ t("settings.sources.rescanAll") }}
        </Button>
        <Button
          type="button"
          size="sm"
          :disabled="serverLost"
          @click="openAddDialog"
        >
          {{ t("settings.sources.add") }}
        </Button>
      </div>
    </div>
    <p v-if="pageError" role="alert" class="text-sm text-destructive">
      {{ pageError }}
    </p>
    <div class="rounded-lg border bg-card p-6 text-card-foreground">
      <p v-if="loading" class="text-sm text-muted-foreground">
        {{ t("settings.sources.loading") }}
      </p>
      <ul v-else-if="sources.length" ref="sourceList" class="space-y-2">
        <li
          v-for="source in sources"
          :key="source.id"
          class="flex items-center gap-2 rounded-md border p-2"
          :title="source.kind === 'path' ? (source.path ?? '') : undefined"
        >
          <button
            type="button"
            class="drag-handle cursor-grab rounded-md p-1 text-muted-foreground active:cursor-grabbing"
            :aria-label="t('settings.sources.drag')"
          >
            <Icon :icon="icons.drag" aria-hidden="true" class="size-4" />
          </button>
          <span
            role="img"
            :aria-label="sourceKindLabel(source)"
            :title="sourceKindLabel(source)"
            class="flex size-6 shrink-0 items-center justify-center text-muted-foreground"
          >
            <Icon
              :icon="sourceKindIcon(source)"
              aria-hidden="true"
              class="size-5"
            />
          </span>
          <div class="min-w-0 flex-1 text-sm">
            <template v-if="source.kind === 'path'">
              <span class="block font-medium">{{
                sourceFolderName(source.path ?? "")
              }}</span>
              <span class="block break-all text-xs text-muted-foreground">{{
                source.path
              }}</span>
            </template>
            <template v-else-if="source.kind === 'plugin'">
              <span class="block font-medium">{{
                source.name || source.pluginId
              }}</span>
              <span class="block truncate text-xs text-muted-foreground">{{
                sourceDetail(source)
              }}</span>
            </template>
            <span v-else class="block truncate">
              {{ sourceLabel(source) }}
            </span>
            <span
              class="mt-1 flex flex-wrap items-center gap-x-1 text-xs text-muted-foreground"
            >
              <span class="font-semibold text-foreground">{{
                sourceFileCount(source)
              }}</span>
              <span aria-hidden="true">·</span>
              <time v-if="source.lastSyncedAt" :datetime="source.lastSyncedAt">
                {{ sourceLastSync(source) }}
              </time>
              <span v-else>{{ sourceLastSync(source) }}</span>
            </span>
          </div>
          <TooltipProvider v-if="sourceTask(source)" :delay-duration="150">
            <TooltipRoot>
              <TooltipTrigger as-child>
                <ProgressCircle
                  tabindex="0"
                  size="sm"
                  :value="sourceProgress(source)"
                  :label="
                    t('settings.sources.progress', {
                      source: sourceFolderName(sourceLabel(source)),
                    })
                  "
                  class="size-5 rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                />
              </TooltipTrigger>
              <TooltipPortal>
                <TooltipContent
                  side="bottom"
                  align="end"
                  :side-offset="6"
                  class="z-50 w-64 rounded-md border bg-popover p-3 text-popover-foreground shadow-md"
                >
                  <p class="text-sm font-semibold">
                    {{ sourceTaskTitle(source) }}
                  </p>
                  <p class="mt-1 text-xs text-muted-foreground">
                    <span
                      :class="
                        sourceTask(source)?.status === 'running'
                          ? 'font-medium text-primary'
                          : 'font-medium'
                      "
                      >{{ sourceTaskStatus(source) }}</span
                    >
                    ·
                    {{ sourceTaskProgressLabel(source) }}
                  </p>
                </TooltipContent>
              </TooltipPortal>
            </TooltipRoot>
          </TooltipProvider>
          <DropdownMenuRoot>
            <DropdownMenuTrigger as-child>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                :aria-label="
                  t('settings.sources.actions', {
                    source: sourceFolderName(sourceLabel(source)),
                  })
                "
              >
                <span
                  aria-hidden="true"
                  class="flex flex-col items-center gap-0.5"
                >
                  <span class="size-1 rounded-full bg-current" />
                  <span class="size-1 rounded-full bg-current" />
                  <span class="size-1 rounded-full bg-current" />
                </span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuPortal>
              <DropdownMenuContent
                class="z-50 w-44 rounded-lg border bg-popover p-1 text-popover-foreground shadow-lg"
              >
                <DropdownMenuItem
                  :disabled="
                    (source.kind !== 'path' && source.kind !== 'plugin') ||
                    serverLost
                  "
                  class="flex cursor-pointer items-center gap-2 rounded-sm px-2 py-2 text-sm outline-none data-disabled:cursor-default data-disabled:opacity-50"
                  @select="rescan(source)"
                >
                  <Icon
                    :icon="icons.restart"
                    aria-hidden="true"
                    class="size-4"
                  />
                  {{ t("settings.sources.rescan") }}
                </DropdownMenuItem>
                <DropdownMenuItem
                  :disabled="serverLost"
                  class="flex cursor-pointer items-center gap-2 rounded-sm px-2 py-2 text-sm text-destructive outline-none data-disabled:cursor-default data-disabled:opacity-50"
                  @select="askRemove(source)"
                >
                  <Icon :icon="icons.close" aria-hidden="true" class="size-4" />
                  {{ t("common.remove") }}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenuPortal>
          </DropdownMenuRoot>
        </li>
      </ul>
      <p v-else class="text-sm text-muted-foreground">
        {{ t("settings.sources.empty") }}
      </p>
    </div>
    <section aria-labelledby="source-refresh-heading" class="space-y-4">
      <h3 id="source-refresh-heading" class="text-lg font-semibold">
        {{ t("settings.server.scheduleTitle") }}
      </h3>
      <div class="space-y-5 rounded-lg border bg-card p-6 text-card-foreground">
        <div class="flex items-start justify-between gap-4">
          <div class="space-y-1">
            <p class="text-sm font-medium">
              {{ t("settings.server.scheduleEnabled") }}
            </p>
            <p class="text-sm text-muted-foreground">
              {{ t("settings.server.scheduleEnabledHelp") }}
            </p>
          </div>
          <Switch
            :model-value="sourceRefreshEnabled"
            :disabled="sourceRefreshSaving || serverLost"
            :aria-label="t('settings.server.scheduleEnabled')"
            @update:model-value="changeSourceRefreshEnabled"
          />
        </div>
        <div class="space-y-2">
          <label for="source-refresh-cron" class="text-sm font-medium">
            {{ t("settings.server.scheduleCron") }}
          </label>
          <Input
            id="source-refresh-cron"
            v-model="sourceRefreshCron"
            :disabled="
              !sourceRefreshEnabled || sourceRefreshSaving || serverLost
            "
            :placeholder="t('settings.server.scheduleCronPlaceholder')"
            autocomplete="off"
            spellcheck="false"
            @blur="saveSourceRefresh"
            @keydown.enter.prevent="saveSourceRefresh"
          />
          <p class="text-sm text-muted-foreground">
            {{ t("settings.server.scheduleCronHelp") }}
            <a
              href="https://crontab.guru/"
              target="_blank"
              rel="noopener noreferrer"
              class="inline-flex items-center gap-1 underline underline-offset-4 hover:text-foreground"
            >
              {{ t("settings.server.scheduleCronHelpLink") }}
              <Icon
                :icon="icons.externalLink"
                aria-hidden="true"
                class="size-3"
              />
            </a>
          </p>
        </div>
        <div
          class="flex flex-col gap-3 border-t pt-4 sm:flex-row sm:items-center sm:justify-between"
        >
          <p class="text-sm text-muted-foreground">
            <template v-if="!sourceRefreshEnabled">
              {{ t("settings.server.scheduleDisabled") }}
            </template>
            <template v-else-if="nextSourceRefresh">
              {{
                t("settings.server.scheduleNext", {
                  date: nextSourceRefresh,
                })
              }}
            </template>
            <template v-else>
              {{ t("settings.server.schedulePending") }}
            </template>
          </p>
        </div>
        <p
          v-if="sourceRefreshNotice"
          role="status"
          aria-live="polite"
          class="text-sm text-muted-foreground"
        >
          {{ sourceRefreshNotice }}
        </p>
        <p
          v-if="sourceRefreshError || serverSettings.error.value"
          role="alert"
          class="text-sm text-destructive"
        >
          {{ sourceRefreshError || serverSettings.error.value }}
        </p>
      </div>
    </section>
  </section>

  <DialogRoot v-model:open="addOpen">
    <DialogPortal>
      <DialogOverlay class="fixed inset-0 z-50 bg-background/80" />
      <DialogContent
        class="fixed left-1/2 top-1/2 z-50 max-h-svh w-full max-w-md -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-lg border bg-card p-6 text-card-foreground shadow-lg"
      >
        <DialogTitle class="text-lg font-semibold">
          {{ t("settings.sources.addTitle") }}
        </DialogTitle>
        <DialogDescription class="text-sm text-muted-foreground">
          {{ t("settings.sources.addDescription") }}
        </DialogDescription>

        <div v-if="!newKind" class="mt-4 grid gap-2">
          <Button
            type="button"
            variant="outline"
            class="justify-start"
            @click="chooseKind('path')"
          >
            <Icon :icon="icons.folder" aria-hidden="true" class="size-5" />
            {{ t("settings.sources.path") }}
          </Button>
          <Button
            v-for="plugin in installedSourcePlugins"
            :key="plugin.id"
            type="button"
            variant="outline"
            class="justify-start"
            @click="chooseKind(plugin.id)"
          >
            <Icon
              :icon="
                plugin.icon === 'jellyfin' ? icons.jellyfin : icons.plugins
              "
              aria-hidden="true"
              class="size-5"
            />
            {{ plugin.name }}
          </Button>
        </div>

        <div v-else class="mt-4 space-y-4">
          <div v-if="newKind === 'path'" class="space-y-2">
            <label for="source-path" class="text-sm font-medium">
              {{ t("settings.sources.folder") }}
            </label>
            <FolderTree v-model="newPath" />
            <p class="text-sm text-muted-foreground">
              {{ newPath || t("settings.sources.noFolder") }}
            </p>
          </div>

          <div v-else class="space-y-4">
            <div
              v-for="field in newPluginFields"
              :key="field.key"
              class="space-y-2"
            >
              <label
                :for="`plugin-source-${field.key}`"
                class="text-sm font-medium"
              >
                {{ translate(field.labelMessage) }}
              </label>
              <Input
                :id="`plugin-source-${field.key}`"
                v-model="newConfiguration[field.key]"
                :type="field.type === 'password' ? 'password' : field.type"
                :required="field.required"
                :autocomplete="field.secret ? 'off' : undefined"
                :placeholder="
                  field.placeholderMessage
                    ? translate(field.placeholderMessage)
                    : undefined
                "
              />
              <p v-if="field.helpMessage" class="text-sm text-muted-foreground">
                {{ translate(field.helpMessage) }}
              </p>
            </div>
            <Button
              v-if="newPluginDiscovery"
              type="button"
              variant="outline"
              :disabled="
                discoveringSources ||
                newPluginFields.some(
                  (field) =>
                    field.required && !newConfiguration[field.key]?.trim(),
                ) ||
                serverLost
              "
              @click="discoverPluginSourceOptions"
            >
              {{
                discoveringSources
                  ? t("settings.sources.loadingOptions")
                  : translate(newPluginDiscovery.actionMessage)
              }}
            </Button>
            <p
              v-if="newPluginDiscovery?.helpMessage"
              class="text-sm text-muted-foreground"
            >
              {{ translate(newPluginDiscovery.helpMessage) }}
            </p>
            <div v-if="pluginOptions.length" class="space-y-2">
              <p class="text-sm font-medium">
                {{ t("settings.sources.availableSources") }}
              </p>
              <div class="grid gap-2">
                <Button
                  v-for="option in pluginOptions"
                  :key="option.id"
                  type="button"
                  :variant="
                    newConfiguration.libraryId ===
                    option.configuration.libraryId
                      ? 'default'
                      : 'outline'
                  "
                  class="justify-start"
                  @click="selectPluginSource(option)"
                >
                  <Icon
                    :icon="icons.library"
                    aria-hidden="true"
                    class="size-4"
                  />
                  {{ option.label }}
                </Button>
              </div>
            </div>
          </div>

          <p v-if="addError" role="alert" class="text-sm text-destructive">
            {{ addError }}
          </p>
        </div>

        <div class="mt-6 flex justify-end gap-3">
          <Button type="button" variant="outline" @click="handleDialogBack">
            {{ newKind ? t("common.back") : t("common.cancel") }}
          </Button>
          <Button
            v-if="newKind"
            type="button"
            :disabled="adding || !canAdd() || serverLost"
            @click="addSource"
          >
            {{ adding ? t("common.adding") : t("settings.sources.add") }}
          </Button>
        </div>
      </DialogContent>
    </DialogPortal>
  </DialogRoot>

  <AlertDialogRoot v-model:open="removeOpen">
    <AlertDialogPortal>
      <AlertDialogOverlay class="fixed inset-0 z-50 bg-background/80" />
      <AlertDialogContent
        class="fixed left-1/2 top-1/2 z-50 w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-lg border bg-card p-6 text-card-foreground shadow-lg"
      >
        <AlertDialogTitle class="text-lg font-semibold">
          {{ t("settings.sources.remove") }}
        </AlertDialogTitle>
        <AlertDialogDescription class="text-sm text-muted-foreground">
          <span class="block">{{ sourceLabel(pendingDelete) }}</span>
          <span class="mt-2 block">
            {{ t("settings.sources.removeDescription") }}
          </span>
        </AlertDialogDescription>
        <div class="mt-6 flex justify-end gap-3">
          <AlertDialogCancel as-child>
            <Button type="button" variant="outline">{{
              t("common.cancel")
            }}</Button>
          </AlertDialogCancel>
          <AlertDialogAction as-child @click="confirmRemove">
            <Button
              type="button"
              variant="destructive"
              :disabled="serverLost"
              >{{ t("common.remove") }}</Button
            >
          </AlertDialogAction>
        </div>
      </AlertDialogContent>
    </AlertDialogPortal>
  </AlertDialogRoot>
</template>
