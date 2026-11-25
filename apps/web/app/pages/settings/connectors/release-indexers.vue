<script setup lang="ts">
import { Icon } from "@iconify/vue/offline";
import { computed, definePageMeta, ref, useI18n } from "#imports";
import type {
  ReleaseIndexerInput,
  ReleaseIndexerResponse,
} from "@peridot/contracts";
import { Button } from "@peridot/ui/components/ui/button";
import { Input } from "@peridot/ui/components/ui/input";
import { PeridotSpinner } from "@peridot/ui/components/ui/spinner";
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
import { releaseIndexersApi } from "../../../lib/peridot-client";

definePageMeta({ layout: "settings" });
const { t } = useI18n();
const { address } = useServer();
const { token } = useSession();
const { user } = useUser();
const indexers = ref<ReleaseIndexerResponse[]>([]);
const error = ref("");
const formError = ref("");
const testMessage = ref("");
const testStatus = ref<"idle" | "success" | "error">("idle");
const testing = ref(false);
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
  savePath: "",
});
let testSequence = 0;
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
    indexers.value = (await api.value!.list()).items;
  } catch (reason) {
    error.value = reason instanceof Error ? reason.message : "Load failed.";
  } finally {
    loading.value = false;
  }
}

function clearTestResult() {
  testSequence += 1;
  testStatus.value = "idle";
  testMessage.value = "";
  testing.value = false;
}

function beginAdd() {
  editing.value = null;
  formError.value = "";
  clearTestResult();
  form.value = {
    name: "",
    url: "",
    apiKey: "",
    downloadClientId: "",
    category: "",
    tags: "",
    categoryPath: false,
    savePath: "",
  };
  open.value = true;
}

function beginEdit(indexer: ReleaseIndexerResponse) {
  editing.value = indexer;
  formError.value = "";
  clearTestResult();
  form.value = {
    ...form.value,
    name: indexer.name ?? "",
    url: indexer.url,
    apiKey: "",
    downloadClientId: indexer.downloadClientId ?? "",
    category: indexer.configuration.category ?? "",
    tags: indexer.configuration.tags ?? "",
    categoryPath: indexer.configuration.categoryPath === "true",
    savePath: indexer.configuration.savePath ?? "",
  };
  open.value = true;
}

function formInput(): ReleaseIndexerInput {
  return {
    name: form.value.name,
    url: form.value.url,
    apiKey: form.value.apiKey,
    downloadClientId: form.value.downloadClientId,
    category: form.value.category,
    tags: form.value.tags,
    categoryPath: form.value.categoryPath,
    savePath: form.value.savePath,
  };
}

async function save() {
  if (!api.value || !form.value.url.trim()) return;
  formError.value = "";
  try {
    let saved = editing.value;
    if (!saved) {
      saved = await api.value.create(formInput());
    }
    if (saved && form.value.downloadClientId) {
      await api.value.link(saved.id, {
        downloadClientId: form.value.downloadClientId,
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

async function testConnection() {
  if (!api.value || !form.value.url.trim()) return;
  const sequence = ++testSequence;
  testing.value = true;
  testStatus.value = "idle";
  testMessage.value = "";
  try {
    const result = await api.value.test({
      ...formInput(),
      ...(editing.value ? { id: editing.value.id } : {}),
    });
    if (sequence !== testSequence) return;
    testStatus.value = "success";
    testMessage.value = t(
      "indexer.testConnected",
      { count: result.categories.length },
      result.categories.length,
    );
  } catch {
    if (sequence !== testSequence) return;
    testStatus.value = "error";
    testMessage.value = t("indexer.testFailed");
  } finally {
    if (sequence === testSequence) testing.value = false;
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
                ? "Update this Torznab feed and its download settings."
                : "Connect a Torznab feed and choose how releases are downloaded."
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
                @input="clearTestResult"
              />
              <span class="text-xs text-muted-foreground">
                {{ t("indexer.testHelp") }}
              </span>
            </label>
            <label v-if="!editing" class="block space-y-2">
              <span class="text-sm font-medium">API key</span>
              <Input
                v-model="form.apiKey"
                type="password"
                autocomplete="new-password"
                @input="clearTestResult"
              />
            </label>
            <DownloadClientLink v-model="form" />
            <p
              v-if="testStatus === 'success'"
              role="status"
              class="text-sm text-success"
            >
              {{ testMessage }}
            </p>
            <p
              v-else-if="testStatus === 'error'"
              role="alert"
              class="text-sm text-destructive"
            >
              {{ testMessage }}
            </p>
            <p v-if="formError" role="alert" class="text-sm text-destructive">
              {{ formError }}
            </p>
            <div class="flex items-center justify-between gap-2">
              <Button
                type="button"
                variant="outline"
                :disabled="testing || !form.url.trim()"
                @click="testConnection"
              >
                <PeridotSpinner
                  v-if="testing"
                  :label="t('indexer.testing')"
                  class="size-4"
                />
                {{ testing ? t("indexer.testing") : t("indexer.test") }}
              </Button>
              <div class="flex gap-2">
                <Button type="button" variant="outline" @click="open = false">
                  Cancel
                </Button>
                <Button
                  type="submit"
                  :disabled="loading || testing || !form.url.trim()"
                >
                  Save
                </Button>
              </div>
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
