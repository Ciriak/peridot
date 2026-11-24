<script setup lang="ts">
import { useI18n } from "#imports";
import type { MediaResponse } from "@peridot/contracts";
import { Icon } from "@iconify/vue/offline";
import {
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
} from "@peridot/ui/components/ui/context-menu";
import { Input } from "@peridot/ui/components/ui/input";
import { ScrollingText } from "@peridot/ui/components/ui/scrolling-text";
import { PeridotSpinner } from "@peridot/ui/components/ui/spinner";
import { injectContextMenuRootContext } from "reka-ui";
import { computed, nextTick, ref } from "vue";
import {
  usePlaylistActions,
  usePlaylistList,
} from "../composables/use-playlists";
import { icons } from "../lib/icons";
import { filterAddablePlaylists } from "../lib/playlists";
import { notifyPlaylistTrackAdded } from "../lib/toasts";
import PlaylistNameDialog from "./PlaylistNameDialog.vue";

const props = defineProps<{
  track: MediaResponse;
  disabled?: boolean;
}>();
const { t } = useI18n();
const rootContext = injectContextMenuRootContext();
const { items, loading, error, load, loadMore, hasMore } = usePlaylistList({
  limit: 100,
  mediaId: () => props.track.id,
});
const actions = usePlaylistActions();
const menuOpen = ref(false);
const search = ref("");
const searchInput = ref<InstanceType<typeof Input> | null>(null);
const loadingAll = ref(false);
const loadError = ref<string | null>(null);
const pendingPlaylistId = ref("");
const actionError = ref<string | null>(null);
const createOpen = ref(false);
const creating = ref(false);
const createError = ref<string | null>(null);
const manualPlaylists = computed(() => filterAddablePlaylists(items.value, ""));
const filteredPlaylists = computed(() =>
  filterAddablePlaylists(items.value, search.value),
);
const displayError = computed(() => loadError.value ?? error.value);

async function focusSearch() {
  await nextTick();
  const element = searchInput.value?.$el;
  if (element instanceof HTMLInputElement) element.focus();
}

async function loadAllPlaylists() {
  if (loadingAll.value) return;
  loadingAll.value = true;
  loadError.value = null;
  try {
    await load();
    while (hasMore.value) {
      const loadedCount = items.value.length;
      await loadMore();
      if (items.value.length === loadedCount) break;
    }
  } catch (reason) {
    loadError.value = actions.messageFor(reason, "error.playlistsLoad");
  } finally {
    loadingAll.value = false;
  }
}

function prepareMenu(open: boolean) {
  menuOpen.value = open;
  if (!open) return;
  search.value = "";
  actionError.value = null;
  loadError.value = null;
  void focusSearch();
  void loadAllPlaylists();
}

async function addTo(playlistId: string, playlistName: string, event: Event) {
  event.preventDefault();
  if (pendingPlaylistId.value) return;
  pendingPlaylistId.value = playlistId;
  actionError.value = null;
  try {
    const result = await actions.add(playlistId, {
      kind: "catalog",
      mediaId: props.track.id,
    });
    notifyPlaylistTrackAdded(playlistName, props.track.title, result.added);
    rootContext?.onOpenChange(false);
  } catch (reason) {
    actionError.value = actions.messageFor(reason, "error.playlistAdd");
  } finally {
    pendingPlaylistId.value = "";
  }
}

function openCreateDialog() {
  createError.value = null;
  createOpen.value = true;
}

async function createAndAdd(name: string) {
  creating.value = true;
  createError.value = null;
  try {
    const playlist = await actions.create(name);
    const result = await actions.add(playlist.id, {
      kind: "catalog",
      mediaId: props.track.id,
    });
    notifyPlaylistTrackAdded(playlist.name, props.track.title, result.added);
    createOpen.value = false;
    menuOpen.value = false;
    rootContext?.onOpenChange(false);
  } catch (reason) {
    createError.value = actions.messageFor(reason, "error.playlistCreate");
  } finally {
    creating.value = false;
  }
}
</script>

<template>
  <ContextMenuSub :open="menuOpen" @update:open="prepareMenu">
    <ContextMenuSubTrigger :disabled="disabled">
      <Icon :icon="icons.plus" aria-hidden="true" />
      {{ t("context.addToPlaylist") }}
      <Icon :icon="icons.caretRight" aria-hidden="true" class="ml-auto" />
    </ContextMenuSubTrigger>
    <ContextMenuSubContent class="w-72 p-0">
      <div class="p-1">
        <Input
          ref="searchInput"
          v-model="search"
          type="search"
          class="h-8"
          :aria-label="t('playlistPicker.searchLabel')"
          :placeholder="t('playlistPicker.searchPlaceholder')"
        />
      </div>
      <ContextMenuSeparator />
      <p
        v-if="actionError"
        role="alert"
        class="mx-2 my-1 text-xs text-destructive"
      >
        {{ actionError }}
      </p>
      <div
        v-if="(loading || loadingAll) && !manualPlaylists.length"
        role="status"
        class="flex items-center gap-2 p-3 text-sm text-muted-foreground"
      >
        <PeridotSpinner :label="t('page.playlists.loading')" class="size-4" />
        {{ t("page.playlists.loading") }}
      </div>
      <p
        v-else-if="displayError && !manualPlaylists.length"
        role="alert"
        class="p-3 text-sm text-destructive"
      >
        {{ displayError }}
      </p>
      <div
        v-else-if="filteredPlaylists.length"
        class="max-h-72 overflow-y-auto p-1"
      >
        <ContextMenuItem
          v-for="playlist in filteredPlaylists"
          :key="playlist.id"
          :disabled="Boolean(pendingPlaylistId) || playlist.containsTrack"
          :aria-busy="pendingPlaylistId === playlist.id"
          @select="addTo(playlist.id, playlist.name, $event)"
        >
          <Icon :icon="icons.playlist" aria-hidden="true" />
          <ScrollingText class="min-w-0 flex-1">
            {{ playlist.name }}
          </ScrollingText>
          <span class="ml-auto text-xs text-muted-foreground">
            {{
              playlist.containsTrack
                ? t("playlistPicker.alreadyAdded")
                : playlist.trackCount
            }}
          </span>
        </ContextMenuItem>
      </div>
      <p v-else class="p-3 text-sm text-muted-foreground">
        {{
          search.trim() && manualPlaylists.length
            ? t("page.playlists.noMatches")
            : t("page.playlists.emptyTitle")
        }}
      </p>
      <p
        v-if="displayError && manualPlaylists.length"
        role="alert"
        class="border-t px-3 py-2 text-xs text-destructive"
      >
        {{ displayError }}
      </p>
      <ContextMenuSeparator />
      <div class="p-1">
        <ContextMenuItem @select="openCreateDialog">
          <Icon :icon="icons.plus" aria-hidden="true" />
          {{ t("page.playlists.create") }}
        </ContextMenuItem>
      </div>
    </ContextMenuSubContent>
  </ContextMenuSub>

  <PlaylistNameDialog
    v-model:open="createOpen"
    mode="create"
    :pending="creating"
    :error="createError"
    @submit="createAndAdd"
  />
</template>
