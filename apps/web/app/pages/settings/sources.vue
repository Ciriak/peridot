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
  JellyfinLibraryResponse,
  MediaType,
  SourceClassificationMode,
  SourceKind,
  SourceResponse,
} from "@peridot/contracts";
import { Button } from "@peridot/ui/components/ui/button";
import { Input } from "@peridot/ui/components/ui/input";
import { ProgressCircle } from "@peridot/ui/components/ui/progress-circle";
import { Switch } from "@peridot/ui/components/ui/switch";
import jellyfinIcon from "@peridot/ui/assets/jellyfin-icon.webp";
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
  discoverJellyfinLibraries,
  isAuthenticationRedirectError,
  reorderSources,
  updateSource,
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
const serverSettings = useServerSettingsQuery();
const sources = ref<SourceResponse[]>([]);
const sourceList = ref<HTMLElement | null>(null);
const mediaTypes: MediaType[] = ["music", "audiobook", "podcast"];
const loading = sourcesQuery.loading;
const pageError = ref("");
const addOpen = ref(false);
type SourceChoice = "path" | "jellyfin";
const newKind = ref<SourceChoice | null>(null);
const newPath = ref("");
const newUrl = ref("");
const newApiKey = ref("");
const newClassificationMode = ref<SourceClassificationMode>("auto");
const newFixedMediaType = ref<MediaType>("music");
const newLibraryId = ref("");
const jellyfinLibraries = ref<JellyfinLibraryResponse[]>([]);
const discoveringLibraries = ref(false);
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

function sourceLabel(source: SourceResponse | null): string {
  if (!source) return "";
  if (source.kind === "path") return source.path ?? "";
  if (source.kind === "url") return source.url ?? "";
  return source.name || source.url || source.integration || "";
}

function sourceKindIcon(kind: SourceKind) {
  if (kind === "path") return icons.folder;
  if (kind === "url") return icons.globe;
  return icons.plugins;
}

function sourceKindLabel(kind: SourceKind): string {
  if (kind === "path") return t("settings.sources.path");
  if (kind === "url") return t("settings.sources.url");
  return t("settings.sources.jellyfin");
}

function isJellyfin(source: SourceResponse): boolean {
  return source.kind === "integration" && source.integration === "jellyfin";
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
  await sourcesQuery.load(true);
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
  newUrl.value = "";
  newApiKey.value = "";
  newClassificationMode.value = "auto";
  newFixedMediaType.value = "music";
  newLibraryId.value = "";
  jellyfinLibraries.value = [];
  addOpen.value = true;
}

function chooseKind(kind: SourceChoice) {
  addError.value = "";
  newKind.value = kind;
}

function closeAddDialog() {
  addOpen.value = false;
  newKind.value = null;
  newPath.value = "";
  newUrl.value = "";
  newApiKey.value = "";
  newClassificationMode.value = "auto";
  newFixedMediaType.value = "music";
  newLibraryId.value = "";
  jellyfinLibraries.value = [];
}

function handleDialogBack() {
  if (newKind.value) {
    newKind.value = null;
    newPath.value = "";
    newUrl.value = "";
    newApiKey.value = "";
    newClassificationMode.value = "auto";
    newFixedMediaType.value = "music";
    newLibraryId.value = "";
    jellyfinLibraries.value = [];
    addError.value = "";
  } else {
    closeAddDialog();
  }
}

function canAdd(): boolean {
  if (newKind.value === "path") return Boolean(newPath.value.trim());
  if (newKind.value === "jellyfin") {
    return Boolean(
      newUrl.value.trim() &&
      newApiKey.value.trim() &&
      newLibraryId.value.trim(),
    );
  }
  return false;
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
      classificationMode: newClassificationMode.value,
      fixedMediaType:
        newClassificationMode.value === "fixed"
          ? newFixedMediaType.value
          : null,
    };
  } else {
    body = {
      kind: "integration",
      integration: "jellyfin",
      url: newUrl.value,
      apiKey: newApiKey.value,
      classificationMode: newClassificationMode.value,
      fixedMediaType:
        newClassificationMode.value === "fixed"
          ? newFixedMediaType.value
          : null,
      libraryId: newLibraryId.value,
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
    if (
      source.kind === "path" ||
      (source.kind === "integration" && source.integration === "jellyfin")
    ) {
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

async function discoverLibraries() {
  if (!address.value || !token.value) return;
  discoveringLibraries.value = true;
  addError.value = "";
  try {
    const response = await discoverJellyfinLibraries(
      address.value,
      token.value,
      {
        url: newUrl.value,
        apiKey: newApiKey.value,
      },
    );
    jellyfinLibraries.value = response.items;
    if (!response.items.some((library) => library.id === newLibraryId.value)) {
      newLibraryId.value = response.items[0]?.id ?? "";
    }
  } catch (reason) {
    if (isAuthenticationRedirectError(reason)) return;
    addError.value = errorMessage(reason, "settings.sources.addError");
  } finally {
    discoveringLibraries.value = false;
  }
}

function mediaTypeLabel(mediaType: MediaType): string {
  return t(
    mediaType === "music"
      ? "settings.sources.media.music"
      : mediaType === "audiobook"
        ? "settings.sources.media.audiobook"
        : "settings.sources.media.podcast",
  );
}

function sourceClassificationLabel(source: SourceResponse): string {
  return source.classificationMode === "auto"
    ? t("settings.sources.classification.auto")
    : t("settings.sources.classification.fixed", {
        mediaType: mediaTypeLabel(source.fixedMediaType ?? "music"),
      });
}

async function changeClassification(
  source: SourceResponse,
  classificationMode: SourceClassificationMode,
  fixedMediaType: MediaType = "music",
) {
  if (
    serverLost.value ||
    (source.classificationMode === classificationMode &&
      (classificationMode === "auto" ||
        source.fixedMediaType === fixedMediaType))
  ) {
    return;
  }
  pageError.value = "";
  try {
    const updated = await updateSource(
      address.value ?? "",
      token.value ?? "",
      source.id,
      { classificationMode, fixedMediaType },
    );
    if (updated.task) trackTask(updated.task);
    await loadSources();
  } catch (reason) {
    if (isAuthenticationRedirectError(reason)) return;
    pageError.value = errorMessage(reason, "settings.sources.updateError");
  }
}

async function rescan(source: SourceResponse) {
  if (source.kind !== "path" && !isJellyfin(source)) return;
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
            :aria-label="sourceKindLabel(source.kind)"
            :title="sourceKindLabel(source.kind)"
            class="flex size-6 shrink-0 items-center justify-center text-muted-foreground"
          >
            <img
              v-if="isJellyfin(source)"
              :src="jellyfinIcon"
              alt=""
              class="size-5 object-contain"
            />
            <Icon
              v-else
              :icon="sourceKindIcon(source.kind)"
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
            <template v-else-if="isJellyfin(source)">
              <span class="block font-medium">{{
                source.name || "Jellyfin"
              }}</span>
              <span class="block truncate text-xs text-muted-foreground">{{
                source.url
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
              <span class="font-medium text-foreground">{{
                sourceClassificationLabel(source)
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
                    (source.kind !== 'path' && !isJellyfin(source)) ||
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
                  :disabled="
                    source.classificationMode === 'auto' ||
                    serverLost ||
                    (source.kind !== 'path' && !isJellyfin(source))
                  "
                  class="flex cursor-pointer items-center gap-2 rounded-sm px-2 py-2 text-sm outline-none data-disabled:cursor-default data-disabled:opacity-50"
                  @select="changeClassification(source, 'auto')"
                >
                  <Icon
                    :icon="icons.search"
                    aria-hidden="true"
                    class="size-4"
                  />
                  {{ t("settings.sources.classification.detect") }}
                </DropdownMenuItem>
                <DropdownMenuItem
                  v-for="mediaType in mediaTypes"
                  :key="mediaType"
                  :disabled="
                    (source.classificationMode === 'fixed' &&
                      source.fixedMediaType === mediaType) ||
                    serverLost ||
                    (source.kind !== 'path' && !isJellyfin(source))
                  "
                  class="flex cursor-pointer items-center gap-2 rounded-sm px-2 py-2 text-sm outline-none data-disabled:cursor-default data-disabled:opacity-50"
                  @select="changeClassification(source, 'fixed', mediaType)"
                >
                  <Icon
                    :icon="
                      mediaType === 'music'
                        ? icons.music
                        : mediaType === 'audiobook'
                          ? icons.book
                          : icons.podcast
                    "
                    aria-hidden="true"
                    class="size-4"
                  />
                  {{
                    t("settings.sources.classification.treatAs", {
                      mediaType: mediaTypeLabel(mediaType),
                    })
                  }}
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
            v-model="sourceRefreshEnabled"
            :disabled="sourceRefreshSaving || serverLost"
            :aria-label="t('settings.server.scheduleEnabled')"
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
          <Button
            type="button"
            size="sm"
            :disabled="sourceRefreshSaving || serverLost"
            @click="saveSourceRefresh"
          >
            {{
              sourceRefreshSaving
                ? t("common.saving")
                : t("settings.server.scheduleSave")
            }}
          </Button>
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
            <img :src="jellyfinIcon" alt="" class="size-5 object-contain" />
            {{ t("settings.sources.jellyfin") }}
          </Button>
        </div>

        <div v-else class="mt-4 space-y-4">
          <div class="space-y-2">
            <p class="text-sm font-medium">
              {{ t("settings.sources.classification.title") }}
            </p>
            <div class="grid grid-cols-2 gap-2">
              <Button
                type="button"
                :variant="
                  newClassificationMode === 'auto' ? 'default' : 'outline'
                "
                size="sm"
                @click="newClassificationMode = 'auto'"
              >
                <Icon :icon="icons.search" aria-hidden="true" class="size-4" />
                {{ t("settings.sources.classification.auto") }}
              </Button>
              <Button
                type="button"
                :variant="
                  newClassificationMode === 'fixed' ? 'default' : 'outline'
                "
                size="sm"
                @click="newClassificationMode = 'fixed'"
              >
                <Icon :icon="icons.music" aria-hidden="true" class="size-4" />
                {{ t("settings.sources.classification.fixedLabel") }}
              </Button>
            </div>
            <p class="text-sm text-muted-foreground">
              {{ t("settings.sources.classification.autoHelp") }}
            </p>
            <div
              v-if="newClassificationMode === 'fixed'"
              class="grid grid-cols-3 gap-2"
            >
              <Button
                v-for="mediaType in mediaTypes"
                :key="mediaType"
                type="button"
                :variant="
                  newFixedMediaType === mediaType ? 'default' : 'outline'
                "
                size="sm"
                @click="newFixedMediaType = mediaType"
              >
                <Icon
                  :icon="
                    mediaType === 'music'
                      ? icons.music
                      : mediaType === 'audiobook'
                        ? icons.book
                        : icons.podcast
                  "
                  aria-hidden="true"
                  class="size-4"
                />
                {{ mediaTypeLabel(mediaType) }}
              </Button>
            </div>
          </div>

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
                {{ t("settings.sources.jellyfinUrl") }}
              </label>
              <Input
                id="jellyfin-url"
                v-model="newUrl"
                type="url"
                :placeholder="t('settings.sources.jellyfinUrlPlaceholder')"
              />
            </div>
            <div class="space-y-2">
              <label for="jellyfin-api-key" class="text-sm font-medium">
                {{ t("settings.sources.jellyfinApiKey") }}
              </label>
              <Input
                id="jellyfin-api-key"
                v-model="newApiKey"
                type="password"
                autocomplete="off"
              />
              <p class="text-sm text-muted-foreground">
                {{ t("settings.sources.jellyfinApiKeyHelp") }}
              </p>
            </div>
            <Button
              type="button"
              variant="outline"
              :disabled="
                discoveringLibraries ||
                !newUrl.trim() ||
                !newApiKey.trim() ||
                serverLost
              "
              @click="discoverLibraries"
            >
              {{
                discoveringLibraries
                  ? t("settings.sources.loadingLibraries")
                  : t("settings.sources.loadLibraries")
              }}
            </Button>
            <div v-if="jellyfinLibraries.length" class="space-y-2">
              <p class="text-sm font-medium">
                {{ t("settings.sources.jellyfinLibrary") }}
              </p>
              <div class="grid gap-2">
                <Button
                  v-for="library in jellyfinLibraries"
                  :key="library.id"
                  type="button"
                  :variant="newLibraryId === library.id ? 'default' : 'outline'"
                  class="justify-start"
                  @click="newLibraryId = library.id"
                >
                  <Icon
                    :icon="icons.library"
                    aria-hidden="true"
                    class="size-4"
                  />
                  {{ library.name }}
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
