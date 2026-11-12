<script setup lang="ts">
import { computed, definePageMeta, onMounted, ref, useI18n } from "#imports";
import { Icon } from "@iconify/vue/offline";
import type {
  CreateSourceRequest,
  SourceKind,
  SourceResponse,
} from "@peridot/contracts";
import { Button } from "@peridot/ui/components/ui/button";
import { Input } from "@peridot/ui/components/ui/input";
import { ProgressCircle } from "@peridot/ui/components/ui/progress-circle";
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
} from "reka-ui";
import { useServer } from "../../composables/use-server";
import { useSession } from "../../composables/use-session";
import { useTasks } from "../../composables/use-tasks";
import { useUser } from "../../composables/use-user";
import { useLocalizedMessage } from "../../composables/use-localized-message";
import { icons } from "../../lib/icons";
import {
  createSource,
  deleteSource,
  isAuthenticationRedirectError,
  listSources,
  reorderSources,
} from "../../lib/peridot-client";
import { sourceFolderName } from "../../lib/source-label";
import {
  activeTaskForSource,
  sourceTaskProgress,
} from "../../lib/task-progress";
import { notifySourceMutation } from "../../lib/toasts";

definePageMeta({ layout: "settings" });

const { t } = useI18n();
const { errorMessage } = useLocalizedMessage();
const { address } = useServer();
const { token } = useSession();
const { user } = useUser();
const {
  hasActiveTasks,
  queueLibraryScan,
  queueSourceScan,
  tasks,
  track: trackTask,
} = useTasks();
const allowed = computed(() => user.value?.role === "admin");

const sources = ref<SourceResponse[]>([]);
const sourceList = ref<HTMLElement | null>(null);
const loading = ref(true);
const pageError = ref("");
const addOpen = ref(false);
const newKind = ref<SourceKind | null>(null);
const newPath = ref("");
const newUrl = ref("");
const adding = ref(false);
const addError = ref("");
const removeOpen = ref(false);
const pendingDelete = ref<SourceResponse | null>(null);

useSortable(sourceList, sources, {
  animation: 150,
  filter: "a, button, input",
  preventOnFilter: false,
  watchElement: true,
  onEnd: () => void persistOrder(),
});

function sourceLabel(source: SourceResponse | null): string {
  if (!source) return "";
  if (source.kind === "path") return source.path ?? "";
  if (source.kind === "url") return source.url ?? "";
  return source.integration ?? "";
}

function sourceKindIcon(kind: SourceKind) {
  if (kind === "path") return icons.folder;
  if (kind === "url") return icons.globe;
  return icons.plugins;
}

function sourceKindLabel(kind: SourceKind): string {
  if (kind === "path") return t("settings.sources.path");
  if (kind === "url") return t("settings.sources.url");
  return t("settings.sources.integration");
}

function sourceTask(source: SourceResponse) {
  return activeTaskForSource(tasks.value, source.id);
}

function sourceProgress(source: SourceResponse): number | null {
  const task = sourceTask(source);
  return task ? sourceTaskProgress(task) : null;
}

async function loadSources() {
  if (!allowed.value) {
    loading.value = false;
    return;
  }
  loading.value = true;
  pageError.value = "";
  try {
    const result = await listSources(address.value ?? "", token.value ?? "");
    sources.value = result.items;
  } catch (reason) {
    if (isAuthenticationRedirectError(reason)) return;
    pageError.value = errorMessage(reason, "settings.sources.loadError");
  } finally {
    loading.value = false;
  }
}

function openAddDialog() {
  addError.value = "";
  newKind.value = null;
  newPath.value = "";
  newUrl.value = "";
  addOpen.value = true;
}

function chooseKind(kind: SourceKind) {
  addError.value = "";
  newKind.value = kind;
}

function closeAddDialog() {
  addOpen.value = false;
  newKind.value = null;
  newPath.value = "";
  newUrl.value = "";
}

function handleDialogBack() {
  if (newKind.value) {
    newKind.value = null;
    addError.value = "";
  } else {
    closeAddDialog();
  }
}

function canAdd(): boolean {
  if (newKind.value === "path") return Boolean(newPath.value.trim());
  if (newKind.value === "url") return Boolean(newUrl.value.trim());
  return false;
}

async function addSource() {
  if (!newKind.value) return;
  adding.value = true;
  addError.value = "";
  const body: CreateSourceRequest = { kind: newKind.value };
  if (newKind.value === "path") body.path = newPath.value;
  if (newKind.value === "url") body.url = newUrl.value;
  try {
    const source = await createSource(
      address.value ?? "",
      token.value ?? "",
      body,
    );
    closeAddDialog();
    notifySourceMutation("added", sourceLabel(source));
    await loadSources();
    if (source.kind === "path") {
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

async function rescan(source: SourceResponse) {
  if (source.kind !== "path") return;
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
  pageError.value = "";
  try {
    await deleteSource(
      address.value ?? "",
      token.value ?? "",
      removedSource.id,
    );
    notifySourceMutation("removed", sourceLabel(removedSource));
    pendingDelete.value = null;
    await loadSources();
  } catch (reason) {
    if (isAuthenticationRedirectError(reason)) return;
    pageError.value = errorMessage(reason, "settings.sources.removeError");
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

onMounted(() => void loadSources());
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
        <Button type="button" variant="outline" size="sm" @click="rescanAll">
          <Icon :icon="icons.restart" aria-hidden="true" />
          {{ t("settings.sources.rescanAll") }}
        </Button>
        <Button type="button" size="sm" @click="openAddDialog">
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
          class="flex cursor-grab items-center gap-2 rounded-md border p-2 active:cursor-grabbing"
          :title="source.kind === 'path' ? (source.path ?? '') : undefined"
        >
          <button
            type="button"
            class="cursor-grab rounded-md p-1 text-muted-foreground active:cursor-grabbing"
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
            <Icon
              :icon="sourceKindIcon(source.kind)"
              aria-hidden="true"
              class="size-5"
            />
          </span>
          <span v-if="source.kind === 'path'" class="min-w-0 flex-1 text-sm">
            <span class="block font-medium">{{
              sourceFolderName(source.path ?? "")
            }}</span>
            <span class="block break-all text-xs text-muted-foreground">{{
              source.path
            }}</span>
          </span>
          <span v-else class="min-w-0 flex-1 truncate text-sm">
            {{ sourceLabel(source) }}
          </span>
          <ProgressCircle
            v-if="sourceTask(source)"
            size="sm"
            :value="sourceProgress(source)"
            :label="
              t('settings.sources.progress', {
                source: sourceFolderName(sourceLabel(source)),
              })
            "
            class="size-5"
          />
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
                  :disabled="source.kind !== 'path'"
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
                  :disabled="hasActiveTasks"
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
  </section>

  <DialogRoot v-model:open="addOpen">
    <DialogPortal>
      <DialogOverlay class="fixed inset-0 z-50 bg-background/80" />
      <DialogContent
        class="fixed left-1/2 top-1/2 z-50 w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-lg border bg-card p-6 text-card-foreground shadow-lg"
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
            @click="chooseKind('url')"
          >
            <Icon :icon="icons.globe" aria-hidden="true" class="size-5" />
            {{ t("settings.sources.url") }}
          </Button>
          <Button
            type="button"
            variant="outline"
            class="justify-start"
            @click="chooseKind('integration')"
          >
            <Icon :icon="icons.plugins" aria-hidden="true" class="size-5" />
            {{ t("settings.sources.integration") }}
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

          <div v-else-if="newKind === 'url'" class="space-y-2">
            <label for="source-url" class="text-sm font-medium">
              {{ t("settings.sources.externalUrl") }}
            </label>
            <Input
              id="source-url"
              v-model="newUrl"
              type="url"
              placeholder="https://example.com/music"
            />
          </div>

          <p v-else class="text-sm text-muted-foreground">
            {{ t("settings.sources.integrationsPending") }}
          </p>

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
            :disabled="adding || !canAdd()"
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
          {{ sourceLabel(pendingDelete) }}
        </AlertDialogDescription>
        <div class="mt-6 flex justify-end gap-3">
          <AlertDialogCancel as-child>
            <Button type="button" variant="outline">{{
              t("common.cancel")
            }}</Button>
          </AlertDialogCancel>
          <AlertDialogAction as-child @click="confirmRemove">
            <Button type="button" variant="destructive">{{
              t("common.remove")
            }}</Button>
          </AlertDialogAction>
        </div>
      </AlertDialogContent>
    </AlertDialogPortal>
  </AlertDialogRoot>
</template>
