<script setup lang="ts">
import {
  definePageMeta,
  computed,
  onBeforeUnmount,
  onMounted,
  ref,
  watch,
} from "#imports";
import { Icon } from "@iconify/vue/offline";
import type {
  CreateSourceRequest,
  LogEntryResponse,
  ServerSettingsResponse,
  SourceKind,
  SourceResponse,
} from "@peridot/contracts";
import { Badge } from "@peridot/ui/components/ui/badge";
import { Button } from "@peridot/ui/components/ui/button";
import { Input } from "@peridot/ui/components/ui/input";
import { Spinner } from "@peridot/ui/components/ui/spinner";
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
  DropdownMenuLabel,
  DropdownMenuPortal,
  DropdownMenuRoot,
  DropdownMenuTrigger,
} from "reka-ui";
import { useServer } from "../../composables/use-server";
import { useSession } from "../../composables/use-session";
import { useLibraryScan } from "../../composables/use-library-scan";
import { icons } from "../../lib/icons";
import {
  createSource,
  deleteSource,
  fetchLogs,
  fetchServerSettings,
  listSources,
  reorderSources,
} from "../../lib/peridot-client";
import { notifySourceMutation } from "../../lib/toasts";

definePageMeta({ layout: "settings" });

const { address } = useServer();
const { token } = useSession();

const settings = ref<ServerSettingsResponse | null>(null);
const sources = ref<SourceResponse[]>([]);
const sourceList = ref<HTMLElement | null>(null);
const loading = ref(true);
const { scan, scanning, start: startScan } = useLibraryScan();
const logs = ref<LogEntryResponse[]>([]);
let logAfter = 0;
let logTimer: ReturnType<typeof setInterval> | undefined;
const logLevels = ["trace", "debug", "info", "warn", "error", "fatal"];
const activeLevels = ref<string[]>([]);
const logSearch = ref("");

const addOpen = ref(false);
const newKind = ref<SourceKind | null>(null);
const newPath = ref("");
const newUrl = ref("");
const adding = ref(false);
const addError = ref("");
const filterIcon = icons.filterIcon;

const removeOpen = ref(false);
const pendingDelete = ref<SourceResponse | null>(null);

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
  return source.integration ?? "";
}

async function loadData() {
  loading.value = true;
  try {
    const [server, sourceListResponse] = await Promise.all([
      fetchServerSettings(address.value ?? "", token.value ?? ""),
      listSources(address.value ?? "", token.value ?? ""),
    ]);
    settings.value = server;
    sources.value = sourceListResponse.items;
  } catch {
    addError.value = "Could not load server settings.";
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
    addOpen.value = false;
    newKind.value = null;
    newPath.value = "";
    newUrl.value = "";
    notifySourceMutation("added", sourceLabel(source));
    await loadData();
  } catch (reason) {
    addError.value =
      reason instanceof Error ? reason.message : "Could not add the source.";
  } finally {
    adding.value = false;
  }
}

function askRemove(source: SourceResponse) {
  pendingDelete.value = source;
  removeOpen.value = true;
}

async function confirmRemove() {
  if (!pendingDelete.value) return;
  addError.value = "";
  const removedSource = pendingDelete.value;
  try {
    await deleteSource(
      address.value ?? "",
      token.value ?? "",
      removedSource.id,
    );
    notifySourceMutation("removed", sourceLabel(removedSource));
    pendingDelete.value = null;
    await loadData();
  } catch (reason) {
    addError.value =
      reason instanceof Error ? reason.message : "Could not remove the source.";
  }
}

async function persistOrder() {
  try {
    await reorderSources(
      address.value ?? "",
      token.value ?? "",
      sources.value.map((source) => source.id),
    );
    notifySourceMutation("updated");
  } catch (reason) {
    addError.value =
      reason instanceof Error
        ? reason.message
        : "Could not save the source order.";
  }
}

async function refreshLogs() {
  try {
    const result = await fetchLogs(
      address.value ?? "",
      token.value ?? "",
      logAfter,
    );
    if (result.items.length) {
      logAfter = result.items[result.items.length - 1]?.id ?? logAfter;
      logs.value = [...result.items].reverse().concat(logs.value).slice(0, 500);
    }
  } catch {
    // The log view tolerates transient polling failures.
  }
}

function logTime(value: string): string {
  return new Date(value).toLocaleTimeString();
}

function toggleLevel(level: string) {
  activeLevels.value = activeLevels.value.includes(level)
    ? activeLevels.value.filter((item) => item !== level)
    : [...activeLevels.value, level];
}

function clearLevels() {
  activeLevels.value = [];
}

const visibleLogs = computed(() => {
  const query = logSearch.value.trim().toLowerCase();
  return logs.value.filter((entry) => {
    if (
      activeLevels.value.length &&
      !activeLevels.value.includes(entry.level)
    ) {
      return false;
    }
    return !query || entry.message.toLowerCase().includes(query);
  });
});

async function rescanLibrary() {
  try {
    await startScan();
  } catch (reason) {
    addError.value =
      reason instanceof Error
        ? reason.message
        : "Could not start a library scan.";
  }
}

watch(scan, async (current) => {
  if (
    current &&
    ["completed", "failed", "interrupted"].includes(current.status)
  ) {
    await loadData();
  }
});

onMounted(() => {
  void loadData();
  void refreshLogs();
  logTimer = setInterval(() => void refreshLogs(), 2000);
});
onBeforeUnmount(() => {
  if (logTimer) clearInterval(logTimer);
});
</script>

<template>
  <div class="space-y-2">
    <h2 class="text-2xl font-semibold tracking-tight">Administration</h2>
    <p class="text-sm text-muted-foreground">
      Configure where this Peridot server gets raw audio files.
    </p>
  </div>

  <section aria-labelledby="server-heading" class="space-y-4">
    <h3 id="server-heading" class="text-lg font-semibold">Server</h3>
    <div class="rounded-lg border bg-card p-6 text-card-foreground">
      <p class="text-sm text-muted-foreground">Connected server</p>
      <p class="mt-1 text-sm font-medium">{{ address ?? "Not connected" }}</p>
    </div>
  </section>

  <section aria-labelledby="sources-heading" class="space-y-4">
    <div class="flex items-center justify-between gap-4">
      <h3 id="sources-heading" class="text-lg font-semibold">Sources</h3>
      <Button type="button" size="sm" @click="openAddDialog">Add source</Button>
    </div>
    <div class="rounded-lg border bg-card p-6 text-card-foreground">
      <p v-if="loading" class="text-sm text-muted-foreground">Loading…</p>
      <ul v-else-if="sources.length" ref="sourceList" class="space-y-2">
        <li
          v-for="source in sources"
          :key="source.id"
          class="flex items-center gap-2 rounded-md border p-2"
        >
          <button
            type="button"
            class="drag-handle cursor-grab rounded-md p-1 text-muted-foreground"
            aria-label="Drag to reorder source"
          >
            <Icon :icon="icons.drag" aria-hidden="true" class="size-4" />
          </button>
          <Badge variant="secondary" class="shrink-0">{{ source.kind }}</Badge>
          <span class="min-w-0 flex-1 truncate text-sm">
            {{ sourceLabel(source) }}
          </span>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            @click="askRemove(source)"
          >
            Remove
          </Button>
        </li>
      </ul>
      <p v-else class="text-sm text-muted-foreground">No sources configured.</p>
    </div>
  </section>

  <DialogRoot v-model:open="addOpen">
    <DialogPortal>
      <DialogOverlay class="fixed inset-0 z-50 bg-background/80" />
      <DialogContent
        class="fixed left-1/2 top-1/2 z-50 w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-lg border bg-card p-6 text-card-foreground shadow-lg"
      >
        <DialogTitle class="text-lg font-semibold">Add source</DialogTitle>
        <DialogDescription class="text-sm text-muted-foreground">
          Choose where Peridot reads raw audio files from.
        </DialogDescription>

        <div v-if="!newKind" class="mt-4 grid gap-2">
          <Button
            type="button"
            variant="outline"
            class="justify-start"
            @click="chooseKind('path')"
          >
            Local files
          </Button>
          <Button
            type="button"
            variant="outline"
            class="justify-start"
            @click="chooseKind('url')"
          >
            Remote URL
          </Button>
          <Button
            type="button"
            variant="outline"
            class="justify-start"
            @click="chooseKind('integration')"
          >
            Integration
          </Button>
        </div>

        <div v-else class="mt-4 space-y-4">
          <div v-if="newKind === 'path'" class="space-y-2">
            <label for="source-path" class="text-sm font-medium">
              Folder on this server
            </label>
            <FolderTree v-model="newPath" />
            <p class="text-sm text-muted-foreground">
              {{ newPath || "No folder selected" }}
            </p>
          </div>

          <div v-else-if="newKind === 'url'" class="space-y-2">
            <label for="source-url" class="text-sm font-medium">
              External URL
            </label>
            <Input
              id="source-url"
              v-model="newUrl"
              type="url"
              placeholder="https://example.com/music"
            />
          </div>

          <p v-else class="text-sm text-muted-foreground">
            Spotify and YouTube Music integrations are not available yet.
          </p>

          <p v-if="addError" role="alert" class="text-sm text-destructive">
            {{ addError }}
          </p>
        </div>

        <div class="mt-6 flex justify-end gap-3">
          <Button type="button" variant="outline" @click="handleDialogBack">
            {{ newKind ? "Back" : "Cancel" }}
          </Button>
          <Button
            v-if="newKind"
            type="button"
            :disabled="adding || !canAdd()"
            @click="addSource"
          >
            {{ adding ? "Adding…" : "Add source" }}
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
          Remove source?
        </AlertDialogTitle>
        <AlertDialogDescription class="text-sm text-muted-foreground">
          {{ sourceLabel(pendingDelete) }}
        </AlertDialogDescription>
        <div class="mt-6 flex justify-end gap-3">
          <AlertDialogCancel as-child>
            <Button type="button" variant="outline">Cancel</Button>
          </AlertDialogCancel>
          <AlertDialogAction as-child @click="confirmRemove">
            <Button type="button" variant="destructive">Remove</Button>
          </AlertDialogAction>
        </div>
      </AlertDialogContent>
    </AlertDialogPortal>
  </AlertDialogRoot>

  <section aria-labelledby="library-status-heading" class="space-y-4">
    <h3 id="library-status-heading" class="text-lg font-semibold">
      Library status
    </h3>
    <div class="space-y-3 rounded-lg border bg-card p-6 text-card-foreground">
      <p v-if="loading" class="text-sm text-muted-foreground">Loading…</p>
      <p v-else class="text-sm">
        {{ settings?.availableTrackCount ?? 0 }} available of
        {{ settings?.trackCount ?? 0 }} tracks
      </p>
      <Button
        type="button"
        variant="outline"
        :disabled="loading || scanning"
        @click="rescanLibrary"
      >
        {{ scanning ? "Scanning…" : "Rescan library" }}
      </Button>
      <p
        v-if="scanning"
        role="status"
        class="flex items-center gap-2 text-sm text-muted-foreground"
      >
        <Spinner label="Scanning the music library" class="size-4" />
        Scan in progress…
      </p>
      <p v-if="scan" role="status" class="text-sm text-muted-foreground">
        Scan {{ scan.status }}: {{ scan.createdCount }} added,
        {{ scan.updatedCount }} updated, {{ scan.unchangedCount }} unchanged.
      </p>
    </div>
  </section>

  <section aria-labelledby="server-log-heading" class="space-y-4">
    <div class="flex items-center justify-between gap-4">
      <h3 id="server-log-heading" class="text-lg font-semibold">Server log</h3>
      <DropdownMenuRoot>
        <DropdownMenuTrigger as-child>
          <Button type="button" variant="outline" size="sm">
            <Icon :icon="filterIcon" aria-hidden="true" class="size-4" />
            Filters
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuPortal>
          <DropdownMenuContent
            class="z-50 w-72 rounded-lg border bg-popover p-3 text-popover-foreground shadow-lg"
          >
            <DropdownMenuLabel
              class="px-1 text-xs font-medium text-muted-foreground"
            >
              Categories
            </DropdownMenuLabel>
            <div class="flex flex-wrap gap-1.5">
              <Button
                type="button"
                :variant="activeLevels.length === 0 ? 'default' : 'outline'"
                size="xs"
                @click="clearLevels"
              >
                All
              </Button>
              <Button
                v-for="level in logLevels"
                :key="level"
                type="button"
                :variant="activeLevels.includes(level) ? 'default' : 'outline'"
                size="xs"
                :aria-pressed="activeLevels.includes(level)"
                @click="toggleLevel(level)"
              >
                {{ level }}
              </Button>
            </div>
            <DropdownMenuLabel
              class="mt-2 px-1 text-xs font-medium text-muted-foreground"
            >
              Search
            </DropdownMenuLabel>
            <Input
              v-model="logSearch"
              type="search"
              aria-label="Search server log"
              placeholder="Search log"
              class="w-full"
            />
          </DropdownMenuContent>
        </DropdownMenuPortal>
      </DropdownMenuRoot>
    </div>
    <div class="rounded-lg border bg-card p-4 text-card-foreground">
      <div
        class="h-64 space-y-1 overflow-y-auto rounded-md bg-muted/50 p-3 font-mono text-xs leading-6"
      >
        <p v-if="!logs.length" class="text-muted-foreground">
          No log entries yet.
        </p>
        <p v-else-if="!visibleLogs.length" class="text-muted-foreground">
          No matching log entries.
        </p>
        <p
          v-for="entry in visibleLogs"
          :key="entry.id"
          class="break-all"
          :class="
            entry.level === 'error' || entry.level === 'fatal'
              ? 'text-destructive'
              : ''
          "
        >
          <span class="text-muted-foreground">{{ logTime(entry.time) }}</span>
          <span class="ml-2 uppercase">{{ entry.level }}</span>
          <span class="ml-2">{{ entry.message }}</span>
        </p>
      </div>
    </div>
  </section>
</template>
