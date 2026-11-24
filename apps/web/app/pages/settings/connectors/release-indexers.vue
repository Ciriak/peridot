<script setup lang="ts">
import { computed, definePageMeta, ref } from "#imports";
import type {
  LibrarySourceResponse,
  ReleaseIndexerInput,
  ReleaseIndexerResponse,
} from "@peridot/contracts";
import { Button } from "@peridot/ui/components/ui/button";
import { Input } from "@peridot/ui/components/ui/input";
import {
  DialogContent,
  DialogDescription,
  DialogOverlay,
  DialogPortal,
  DialogRoot,
  DialogTitle,
} from "reka-ui";
import { onMounted } from "vue";
import DownloadClientLink from "../../../components/DownloadClientLink.vue";
import { useServer } from "../../../composables/use-server";
import { useSession } from "../../../composables/use-session";
import { useUser } from "../../../composables/use-user";
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
  await api.value.remove(indexer.id);
  await load();
}

onMounted(load);
</script>

<template>
  <section class="space-y-4">
    <div class="flex items-center justify-between">
      <div>
        <h2 class="text-2xl font-semibold">Release indexers</h2>
        <p class="text-sm text-muted-foreground">
          Torznab feeds used by Discover.
        </p>
      </div>
      <Button @click="beginAdd">Add indexer</Button>
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
        <Button variant="outline" @click="beginEdit(indexer)">Configure</Button>
        <Button variant="ghost" @click="remove(indexer)">Remove</Button>
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
  </section>
</template>
