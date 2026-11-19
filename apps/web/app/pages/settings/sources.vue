<script setup lang="ts">
import {
  computed,
  definePageMeta,
  onBeforeUnmount,
  onMounted,
  ref,
  useI18n,
  watch,
} from "#imports";
import { Icon } from "@iconify/vue/offline";
import type {
  CreateSourceRequest,
  SourceIntegrationOptionResponse,
  SourceRemovalProgressResponse,
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
import { useRealtime } from "../../composables/use-realtime";
import {
  useAdminSourcesQuery,
  useServerSettingsQuery,
} from "../../composables/use-admin-queries";
import { useTasks } from "../../composables/use-tasks";
import { useUser } from "../../composables/use-user";
import { useLocalizedMessage } from "../../composables/use-localized-message";
import { icons } from "../../lib/icons";
import {
  createSource,
  deleteSource,
  discoverIntegrationSources,
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
const realtime = useRealtime();
const {
  queueLibraryScan,
  queueSourceScan,
  tasks,
  track: trackTask,
} = useTasks();
const allowed = computed(() => user.value?.role === "admin");
const serverLost = computed(() => serverStatus.value === "lost");

const sourcesQuery = useAdminSourcesQuery();
const serverSettings = useServerSettingsQuery();
const { invalidate: invalidateCatalog, resetOfflineCatalog } =
  useCatalogRevision();
const sources = ref<SourceResponse[]>([]);
const sourceList = ref<HTMLElement | null>(null);
const loading = sourcesQuery.loading;
const pageError = ref("");
const addOpen = ref(false);
type SourceChoice = "path" | "jellyfin";
const newKind = ref<SourceChoice | null>(null);
const newPath = ref("");
const newJellyfinUrl = ref("");
const newJellyfinApiKey = ref("");
const newJellyfinLibraryId = ref("");
const newJellyfinCollectionType = ref<string | null>(null);
const jellyfinLibraries = ref<SourceIntegrationOptionResponse[]>([]);
const discoveringSources = ref(false);
const adding = ref(false);
const addError = ref("");
const removeOpen = ref(false);
const pendingDelete = ref<SourceResponse | null>(null);
const removalProgress = ref<
  Record<string, SourceRemovalProgressResponse>
>({});
let unsubscribeRemovals: (() => void) | undefined;
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

function sourceLabel(source: SourceResponse | null): string {
  if (!source) return "";
  if (source.kind === "path") return source.path ?? "";
  if (source.kind === "url") return source.url ?? "";
  return source.name || source.url || "";
}

function sourceKindIcon(source: SourceResponse) {
  if (source.kind === "path") return icons.folder;
  if (source.kind === "url") return icons.globe;
  return icons.jellyfin;
}

function sourceKindLabel(source: SourceResponse): string {
  if (source.kind === "path") return t("settings.sources.path");
  if (source.kind === "url") return t("settings.sources.url");
  return t("settings.sources.jellyfin.title");
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

function sourceRemoval(
  source: SourceResponse,
): SourceRemovalProgressResponse | null {
  return removalProgress.value[source.id] ?? source.removal;
}

function sourceIsRemoving(source: SourceResponse): boolean {
  return Boolean(sourceRemoval(source));
}

function sourceRemovalValue(source: SourceResponse): number | null {
  const progress = sourceRemoval(source);
  if (!progress || !progress.total) return null;
  return Math.min(100, (progress.completed / progress.total) * 100);
}

function sourceRemovalLabel(source: SourceResponse): string {
  const progress = sourceRemoval(source);
  if (!progress) return "";
  return t(`settings.sources.removalPhase.${progress.phase}`, {
    completed: progress.completed,
    total: progress.total,
  });
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
  await sourcesQuery.load(true);
}

watch(
  sourcesQuery.items,
  (items) => {
    sources.value = items;
    const next = { ...removalProgress.value };
    for (const source of items) {
      if (source.removal) next[source.id] = source.removal;
      else delete next[source.id];
    }
    removalProgress.value = next;
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
  resetJellyfinForm();
  addOpen.value = true;
}

function chooseKind(kind: SourceChoice) {
  addError.value = "";
  newKind.value = kind;
  resetJellyfinForm();
}

function resetJellyfinForm() {
  newJellyfinUrl.value = "";
  newJellyfinApiKey.value = "";
  newJellyfinLibraryId.value = "";
  newJellyfinCollectionType.value = null;
  jellyfinLibraries.value = [];
}

function closeAddDialog() {
  addOpen.value = false;
  newKind.value = null;
  newPath.value = "";
  resetJellyfinForm();
}

function handleDialogBack() {
  if (newKind.value) {
    newKind.value = null;
    newPath.value = "";
    resetJellyfinForm();
    addError.value = "";
  } else {
    closeAddDialog();
  }
}

function canAdd(): boolean {
  if (newKind.value === "path") return Boolean(newPath.value.trim());
  return (
    Boolean(newJellyfinUrl.value.trim()) &&
    Boolean(newJellyfinApiKey.value.trim()) &&
    Boolean(newJellyfinLibraryId.value)
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
    if (!newJellyfinLibraryId.value) return;
    body = {
      kind: "jellyfin",
      url: newJellyfinUrl.value,
      apiKey: newJellyfinApiKey.value,
      libraryId: newJellyfinLibraryId.value,
      collectionType: newJellyfinCollectionType.value,
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
    if (source.kind === "path" || source.kind === "jellyfin") {
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

async function discoverJellyfinLibraries() {
  if (!address.value || !token.value) return;
  discoveringSources.value = true;
  addError.value = "";
  try {
    const response = await discoverIntegrationSources(
      address.value,
      token.value,
      "jellyfin",
      {
        configuration: { url: newJellyfinUrl.value },
        credentials: { apiKey: newJellyfinApiKey.value },
      },
    );
    jellyfinLibraries.value = response.items;
    const first = response.items[0];
    if (first) {
      selectJellyfinLibrary(first);
    }
  } catch (reason) {
    if (isAuthenticationRedirectError(reason)) return;
    addError.value = errorMessage(reason, "settings.sources.addError");
  } finally {
    discoveringSources.value = false;
  }
}

function selectJellyfinLibrary(option: SourceIntegrationOptionResponse) {
  newJellyfinLibraryId.value = option.configuration.libraryId ?? "";
  newJellyfinCollectionType.value =
    option.configuration.libraryCollectionType || null;
}

async function rescan(source: SourceResponse) {
  if (source.kind !== "path" && source.kind !== "jellyfin") return;
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

async function confirmRemove() {
  if (!pendingDelete.value) return;
  const removedSource = pendingDelete.value;
  pendingDelete.value = null;
  removeOpen.value = false;
  pageError.value = "";
  removalProgress.value = {
    ...removalProgress.value,
    [removedSource.id]: {
      operationId: "pending",
      sourceId: removedSource.id,
      phase: "stopping",
      completed: 0,
      total: removedSource.fileCount,
    },
  };

  try {
    const result = await deleteSource(
      address.value ?? "",
      token.value ?? "",
      removedSource.id,
    );
    sourcesQuery.removeOptimistically(removedSource.id);
    sources.value = sources.value.filter(
      (source) => source.id !== removedSource.id,
    );
    const next = { ...removalProgress.value };
    delete next[removedSource.id];
    removalProgress.value = next;
    notifySourceMutation(
      "removed",
      sourceLabel(removedSource),
      result.unavailableTrackCount,
    );
    await resetOfflineCatalog();
    invalidateCatalog();
  } catch (reason) {
    const next = { ...removalProgress.value };
    delete next[removedSource.id];
    removalProgress.value = next;
    if (isAuthenticationRedirectError(reason)) return;
    pageError.value = errorMessage(reason, "settings.sources.removeError");
    await loadSources();
  }
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
  if (allowed.value) {
    unsubscribeRemovals = realtime.subscribe(["sources"], (message) => {
      if (message.type !== "source.removal.progress") return;
      const {
        eventId: _eventId,
        occurredAt: _occurredAt,
        type: _type,
        ...progress
      } = message;
      removalProgress.value = {
        ...removalProgress.value,
        [progress.sourceId]: progress,
      };
    });
  }
});

onBeforeUnmount(() => {
  unsubscribeRemovals?.();
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
          :class="sourceIsRemoving(source) && 'bg-muted/40'"
          :title="source.kind === 'path' ? (source.path ?? '') : undefined"
        >
          <button
            type="button"
            class="drag-handle cursor-grab rounded-md p-1 text-muted-foreground active:cursor-grabbing"
            :class="sourceIsRemoving(source) && 'pointer-events-none opacity-40'"
            :disabled="sourceIsRemoving(source)"
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
            <template v-else-if="source.kind === 'jellyfin'">
              <span class="block font-medium">{{
                source.name || t("settings.sources.jellyfin.title")
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
            <span
              v-if="sourceIsRemoving(source)"
              class="mt-2 flex items-center gap-2 text-xs text-muted-foreground"
              role="status"
              aria-live="polite"
            >
              <ProgressCircle
                size="sm"
                :value="sourceRemovalValue(source)"
                :label="sourceRemovalLabel(source)"
                class="size-4"
              />
              {{ sourceRemovalLabel(source) }}
            </span>
          </div>
          <TooltipProvider
            v-if="sourceTask(source) && !sourceIsRemoving(source)"
            :delay-duration="150"
          >
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
                :disabled="sourceIsRemoving(source)"
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
                    (source.kind !== 'path' && source.kind !== 'jellyfin') ||
                    serverLost ||
                    sourceIsRemoving(source)
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
                  :disabled="serverLost || sourceIsRemoving(source)"
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
            type="button"
            variant="outline"
            class="justify-start"
            @click="chooseKind('jellyfin')"
          >
            <Icon :icon="icons.jellyfin" aria-hidden="true" class="size-5" />
            {{ t("settings.sources.jellyfin.title") }}
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
            <div class="space-y-2">
              <label for="jellyfin-url" class="text-sm font-medium">
                {{ t("settings.sources.jellyfin.url") }}
              </label>
              <Input
                id="jellyfin-url"
                v-model="newJellyfinUrl"
                type="url"
                required
                autocomplete="off"
                :placeholder="t('settings.sources.jellyfin.urlPlaceholder')"
              />
            </div>
            <div class="space-y-2">
              <label for="jellyfin-api-key" class="text-sm font-medium">
                {{ t("settings.sources.jellyfin.apiKey") }}
              </label>
              <Input
                id="jellyfin-api-key"
                v-model="newJellyfinApiKey"
                type="password"
                required
                autocomplete="off"
              />
              <p class="text-sm text-muted-foreground">
                {{ t("settings.sources.jellyfin.apiKeyHelp") }}
              </p>
            </div>
            <Button
              type="button"
              variant="outline"
              :disabled="
                discoveringSources ||
                !newJellyfinUrl.trim() ||
                !newJellyfinApiKey.trim() ||
                serverLost
              "
              @click="discoverJellyfinLibraries"
            >
              {{
                discoveringSources
                  ? t("settings.sources.jellyfin.loadingLibraries")
                  : t("settings.sources.jellyfin.loadLibraries")
              }}
            </Button>
            <p class="text-sm text-muted-foreground">
              {{ t("settings.sources.jellyfin.libraryHelp") }}
            </p>
            <div v-if="jellyfinLibraries.length" class="space-y-2">
              <p class="text-sm font-medium">
                {{ t("settings.sources.jellyfin.libraries") }}
              </p>
              <div class="grid gap-2">
                <Button
                  v-for="option in jellyfinLibraries"
                  :key="option.id"
                  type="button"
                  :variant="
                    newJellyfinLibraryId === option.configuration.libraryId
                      ? 'default'
                      : 'outline'
                  "
                  class="justify-start"
                  @click="selectJellyfinLibrary(option)"
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
