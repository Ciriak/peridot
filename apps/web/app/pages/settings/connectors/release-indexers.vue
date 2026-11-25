<script setup lang="ts">
import { Icon } from "@iconify/vue/offline";
import { computed, definePageMeta, ref } from "#imports";
import type {
  LibrarySourceResponse,
  ReleaseIndexerInput,
  ReleaseIndexerResponse,
} from "@peridot/contracts";
import { Button } from "@peridot/ui/components/ui/button";
import { Input } from "@peridot/ui/components/ui/input";
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
import { onMounted } from "vue";
import DownloadClientLink from "../../../components/DownloadClientLink.vue";
import { useServer } from "../../../composables/use-server";
import { useSession } from "../../../composables/use-session";
import { useUser } from "../../../composables/use-user";
import { icons } from "../../../lib/icons";
import { listSources, releaseIndexersApi } from "../../../lib/peridot-client";

definePageMeta({ layout: "settings" });
const { address } = useServer();
const { token } = useSession();
const { user } = useUser();
const indexers = ref<ReleaseIndexerResponse[]>([]);
const sources = ref<LibrarySourceResponse[]>([]);
const error = ref("");
const formError = ref("");
const loading = ref(false);
const open = ref(false);
const editing = ref<ReleaseIndexerResponse | null>(null);
const removeOpen = ref(false);
const pendingRemove = ref<ReleaseIndexerResponse | null>(null);
const form = ref({
  name: "",
  url: "",
  apiKey: "",
  downloadClientId: "",
  category: "",
  tags: "",
  categoryPath: false,
  folderId: "",
  savePath: "",
});
const api = computed(() =>
  address.value && token.value
    ? releaseIndexersApi(address.value, token.value)
    : null,
);

async function load() {
  if (!address.value || !token.value || user.value?.role !== "admin") return;
  loading.value = true;
  error.value = "";
  try {
    const [nextIndexers, nextSources] = await Promise.all([
      api.value!.list(),
      listSources(address.value, token.value),
    ]);
    indexers.value = nextIndexers.items;
    sources.value = nextSources.items;
  } catch (reason) {
    error.value = reason instanceof Error ? reason.message : "Load failed.";
  } finally {
    loading.value = false;
  }
}

function beginAdd() {
  editing.value = null;
  formError.value = "";
  form.value = {
    name: "",
    url: "",
    apiKey: "",
    downloadClientId: "",
    category: "",
    tags: "",
    categoryPath: false,
    folderId: "",
    savePath: "",
  };
  open.value = true;
}

function beginEdit(indexer: ReleaseIndexerResponse) {
  editing.value = indexer;
  formError.value = "";
  form.value = {
    ...form.value,
    name: indexer.name ?? "",
    url: indexer.url,
    apiKey: "",
    downloadClientId: indexer.downloadClientId ?? "",
    category: indexer.configuration.category ?? "",
    tags: indexer.configuration.tags ?? "",
    categoryPath: indexer.configuration.categoryPath === "true",
    folderId: indexer.destinationSourceId ?? "",
    savePath: indexer.configuration.savePath ?? "",
  };
  open.value = true;
}

async function save() {
  if (!api.value || !form.value.url.trim()) return;
  formError.value = "";
  try {
    let saved = editing.value;
    if (!saved) {
      const input: ReleaseIndexerInput = {
        name: form.value.name,
        url: form.value.url,
        apiKey: form.value.apiKey,
        downloadClientId: form.value.downloadClientId,
        librarySourceId: form.value.folderId,
        category: form.value.category,
        tags: form.value.tags,
        categoryPath: form.value.categoryPath,
        savePath: form.value.savePath,
      };
      saved = await api.value.create(input);
    }
    if (saved && form.value.downloadClientId) {
      await api.value.link(saved.id, {
        downloadClientId: form.value.downloadClientId,
        librarySourceId: form.value.folderId,
        category: form.value.category,
        tags: form.value.tags,
        categoryPath: form.value.categoryPath,
        savePath: form.value.savePath,
      });
    }
    open.value = false;
    await load();
  } catch (reason) {
    formError.value = reason instanceof Error ? reason.message : "Save failed.";
  }
}

async function remove(indexer: ReleaseIndexerResponse) {
  if (!api.value) return;
  try {
    await api.value.remove(indexer.id);
    await load();
  } catch (reason) {
    error.value = reason instanceof Error ? reason.message : "Remove failed.";
  }
}

function askRemove(indexer: ReleaseIndexerResponse) {
  pendingRemove.value = indexer;
  removeOpen.value = true;
  error.value = "";
}

async function confirmRemove() {
  const indexer = pendingRemove.value;
  if (!indexer) return;
  removeOpen.value = false;
  pendingRemove.value = null;
  await remove(indexer);
}

onMounted(load);
</script>

<template>
  <section class="space-y-4">
    <div class="flex items-center justify-between">
      <h1 class="text-xl font-semibold">Release indexers</h1>
      <Button @click="beginAdd">
        <Icon :icon="icons.plus" aria-hidden="true" />
        Add indexer
      </Button>
    </div>
    <p v-if="error" role="alert" class="text-sm text-destructive">
      {{ error }}
    </p>
    <p v-if="loading" class="text-sm text-muted-foreground">Loading…</p>
    <div v-else class="space-y-2">
      <article
        v-for="indexer in indexers"
        :key="indexer.id"
        class="flex items-center gap-3 rounded-lg border bg-card p-3"
      >
        <div class="min-w-0 flex-1">
          <p class="font-medium">{{ indexer.name || "Torznab" }}</p>
          <p class="truncate text-xs text-muted-foreground">
            {{ indexer.url }}
          </p>
        </div>
        <Button
          variant="ghost"
          size="icon-sm"
          :aria-label="`Configure ${indexer.name || 'Torznab'}`"
          :title="`Configure ${indexer.name || 'Torznab'}`"
          @click="beginEdit(indexer)"
        >
          <Icon :icon="icons.settings" aria-hidden="true" />
        </Button>
        <DropdownMenuRoot>
          <DropdownMenuTrigger as-child>
            <Button
              variant="ghost"
              size="icon-sm"
              :aria-label="`Actions for ${indexer.name || 'Torznab'}`"
            >
              <Icon :icon="icons.more" aria-hidden="true" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuPortal>
            <DropdownMenuContent
              side="bottom"
              align="end"
              :side-offset="4"
              class="z-50 w-40 rounded-lg border bg-popover p-1 text-popover-foreground shadow-lg"
            >
              <DropdownMenuItem
                class="flex cursor-pointer items-center gap-2 rounded-sm px-2 py-2 text-sm text-destructive outline-none"
                @select="askRemove(indexer)"
              >
                <Icon :icon="icons.trash" aria-hidden="true" class="size-4" />
                Remove
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenuPortal>
        </DropdownMenuRoot>
      </article>
      <p v-if="!indexers.length" class="text-sm text-muted-foreground">
        No release indexers configured.
      </p>
    </div>

    <DialogRoot v-model:open="open">
      <DialogPortal>
        <DialogOverlay class="fixed inset-0 z-50 bg-background/80" />
        <DialogContent
          class="fixed left-1/2 top-1/2 z-50 max-h-svh w-full max-w-lg -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-lg border bg-card p-6 text-card-foreground shadow-lg"
        >
          <DialogTitle class="text-lg font-semibold">
            {{ editing ? "Configure indexer" : "Add indexer" }}
          </DialogTitle>
          <DialogDescription class="text-sm text-muted-foreground">
            {{
              editing
                ? "Update this Torznab feed and its import destination."
                : "Connect a Torznab feed and choose where completed releases are imported."
            }}
          </DialogDescription>
          <form class="mt-4 space-y-4" @submit.prevent="save">
            <label class="block space-y-2">
              <span class="text-sm font-medium">Display name</span>
              <Input v-model="form.name" autocomplete="off" />
            </label>
            <label class="block space-y-2">
              <span class="text-sm font-medium">Torznab feed URL</span>
              <Input
                v-model="form.url"
                type="url"
                autocomplete="off"
                required
              />
            </label>
            <label v-if="!editing" class="block space-y-2">
              <span class="text-sm font-medium">API key</span>
              <Input
                v-model="form.apiKey"
                type="password"
                autocomplete="new-password"
              />
            </label>
            <DownloadClientLink v-model="form" :sources="sources" />
            <p v-if="formError" role="alert" class="text-sm text-destructive">
              {{ formError }}
            </p>
            <div class="flex justify-end gap-2">
              <Button type="button" variant="outline" @click="open = false">
                Cancel
              </Button>
              <Button type="submit" :disabled="loading || !form.url.trim()">
                Save
              </Button>
            </div>
          </form>
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
            Remove {{ pendingRemove?.name || "Torznab" }}?
          </AlertDialogTitle>
          <AlertDialogDescription class="text-sm text-muted-foreground">
            This removes the saved Torznab feed and its credentials from
            Peridot.
          </AlertDialogDescription>
          <div class="mt-6 flex justify-end gap-3">
            <AlertDialogCancel as-child>
              <Button type="button" variant="outline">Cancel</Button>
            </AlertDialogCancel>
            <AlertDialogAction as-child>
              <Button
                type="button"
                variant="destructive"
                @click="confirmRemove"
              >
                Remove
              </Button>
            </AlertDialogAction>
          </div>
        </AlertDialogContent>
      </AlertDialogPortal>
    </AlertDialogRoot>
  </section>
</template>
