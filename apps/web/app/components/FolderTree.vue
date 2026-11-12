<script setup lang="ts">
import { useI18n } from "#imports";
import { Icon } from "@iconify/vue/offline";
import { Input } from "@peridot/ui/components/ui/input";
import { PeridotSpinner } from "@peridot/ui/components/ui/spinner";
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { TreeItem, TreeRoot } from "reka-ui";
import { useServer } from "../composables/use-server";
import { useSession } from "../composables/use-session";
import { useLocalizedMessage } from "../composables/use-localized-message";
import { icons } from "../lib/icons";
import {
  isAuthenticationRedirectError,
  listDirectories,
  searchDirectories,
} from "../lib/peridot-client";

interface FolderNode {
  name: string;
  path: string;
}

withDefaults(defineProps<{ modelValue?: string }>(), {
  modelValue: "",
});
const emit = defineEmits<{ (e: "update:modelValue", value: string): void }>();

const { address } = useServer();
const { token } = useSession();
const { t } = useI18n();
const { errorMessage } = useLocalizedMessage();

const items = ref<FolderNode[]>([]);
const childrenByPath = ref<Record<string, FolderNode[]>>({});
const loaded = ref<Set<string>>(new Set());
const expanded = ref<string[]>([]);
const selected = ref<FolderNode | undefined>(undefined);
const searchQuery = ref("");
const searchResults = ref<FolderNode[]>([]);
const searching = ref(false);
const searchError = ref("");
const searchTruncated = ref(false);
let searchTimer: ReturnType<typeof setTimeout> | undefined;
let searchAbort: AbortController | undefined;
let searchRequest = 0;

const searchActive = computed(() => Boolean(searchQuery.value.trim()));
const visibleItems = computed(() =>
  searchActive.value ? searchResults.value : items.value,
);

function getKey(node: FolderNode): string {
  return node.path;
}

function getChildren(node: FolderNode): FolderNode[] | undefined {
  if (searchActive.value) return undefined;
  if (!loaded.value.has(node.path)) return [];
  const children = childrenByPath.value[node.path];
  return children?.length ? children : undefined;
}

async function loadChildren(node?: FolderNode) {
  const key = node?.path;
  const result = await listDirectories(
    address.value ?? "",
    token.value ?? "",
    key,
  );
  if (key) {
    loaded.value = new Set([...loaded.value, key]);
    childrenByPath.value = { ...childrenByPath.value, [key]: result.items };
  } else {
    items.value = result.items;
  }
}

watch(expanded, (next, previous) => {
  for (const key of next) {
    if (!previous.includes(key) && !loaded.value.has(key)) {
      void loadChildren({ name: key, path: key });
    }
  }
});

watch(selected, (node) => {
  emit("update:modelValue", node?.path ?? "");
});

watch(searchQuery, () => {
  const request = ++searchRequest;
  const query = searchQuery.value.trim();
  if (searchTimer) clearTimeout(searchTimer);
  searchAbort?.abort();
  searchAbort = undefined;
  searchResults.value = [];
  searchTruncated.value = false;
  searchError.value = "";

  if (!query) {
    searching.value = false;
    return;
  }

  searching.value = true;
  const controller = new AbortController();
  searchAbort = controller;
  searchTimer = setTimeout(
    () => void runSearch(request, query, controller),
    250,
  );
});

async function runSearch(
  request: number,
  query: string,
  controller: AbortController,
) {
  try {
    const result = await searchDirectories(
      address.value ?? "",
      token.value ?? "",
      query,
      undefined,
      controller.signal,
    );
    if (request !== searchRequest) return;
    searchResults.value = result.items;
    searchTruncated.value = result.truncated;
  } catch (reason) {
    if (request !== searchRequest) return;
    if (isAuthenticationRedirectError(reason)) return;
    searchError.value = errorMessage(reason, "components.folder.searchError");
  } finally {
    if (request === searchRequest) {
      searching.value = false;
    }
  }
}

onMounted(() => void loadChildren());
onBeforeUnmount(() => {
  if (searchTimer) clearTimeout(searchTimer);
  searchAbort?.abort();
  searchRequest += 1;
});
</script>

<template>
  <div class="space-y-2">
    <div class="relative">
      <Icon
        :icon="icons.search"
        aria-hidden="true"
        class="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
      />
      <Input
        v-model="searchQuery"
        type="search"
        :aria-label="t('components.folder.search')"
        :placeholder="t('components.folder.search')"
        class="pl-9"
      />
    </div>

    <p
      v-if="searchActive && searching"
      role="status"
      class="flex items-center gap-2 text-sm text-muted-foreground"
    >
      <PeridotSpinner
        :label="t('components.folder.searching')"
        class="size-4"
      />
      {{ t("components.folder.searching") }}…
    </p>

    <p v-else-if="searchError" role="alert" class="text-sm text-destructive">
      {{ searchError }}
    </p>

    <p
      v-else-if="searchActive && !searchResults.length"
      class="text-sm text-muted-foreground"
    >
      {{ t("components.folder.noMatches") }}
    </p>

    <p
      v-if="searchActive && searchTruncated"
      class="text-sm text-muted-foreground"
    >
      {{ t("components.folder.truncated") }}
    </p>

    <TreeRoot
      v-if="!searchActive || (!searching && searchResults.length)"
      v-slot="{ flattenItems }"
      v-model="selected"
      v-model:expanded="expanded"
      :items="visibleItems"
      :get-key="getKey"
      :get-children="getChildren"
      class="max-h-60 space-y-0.5 overflow-y-auto rounded-md border p-2"
    >
      <TreeItem
        v-for="item in flattenItems"
        :key="item._id"
        :value="item.value"
        :level="item.level"
        :class="[
          'cursor-pointer rounded-md',
          selected?.path === item.value.path
            ? 'bg-sidebar-accent text-sidebar-accent-foreground'
            : 'hover:bg-accent hover:text-accent-foreground',
        ]"
      >
        <div class="flex items-center gap-2 py-1 pl-1 pr-2">
          <Icon
            v-if="item.hasChildren"
            :icon="
              expanded.includes(item.value.path)
                ? icons.caretDown
                : icons.caretRight
            "
            aria-hidden="true"
            class="size-4 shrink-0 text-muted-foreground"
          />
          <Icon
            :icon="icons.folder"
            aria-hidden="true"
            class="size-4 shrink-0 text-muted-foreground"
          />
          <div class="min-w-0 flex-1">
            <p class="truncate text-sm">{{ item.value.name }}</p>
            <p
              v-if="searchActive"
              class="truncate text-xs text-muted-foreground"
            >
              {{ item.value.path }}
            </p>
          </div>
        </div>
      </TreeItem>
    </TreeRoot>
  </div>
</template>
