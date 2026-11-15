<script setup lang="ts">
import { useI18n } from "#imports";
import type { TrackResponse } from "@peridot/contracts";
import { Icon } from "@iconify/vue/offline";
import { Button } from "@peridot/ui/components/ui/button";
import { ScrollingText } from "@peridot/ui/components/ui/scrolling-text";
import { PeridotSpinner } from "@peridot/ui/components/ui/spinner";
import {
  DialogContent,
  DialogDescription,
  DialogOverlay,
  DialogPortal,
  DialogRoot,
  DialogTitle,
} from "reka-ui";
import { ref } from "vue";
import {
  usePlaylistActions,
  usePlaylistList,
} from "../composables/use-playlists";
import { icons } from "../lib/icons";
import { notifyPlaylistTrackAdded } from "../lib/toasts";
import PlaylistNameDialog from "./PlaylistNameDialog.vue";

const props = defineProps<{
  open: boolean;
  track: TrackResponse;
}>();
const emit = defineEmits<{
  "update:open": [open: boolean];
}>();
const { t } = useI18n();
const { items, loading, error, load } = usePlaylistList(
  100,
  () => props.track.id,
);
const actions = usePlaylistActions();
const pendingPlaylistId = ref("");
const actionError = ref<string | null>(null);
const createOpen = ref(false);
const creating = ref(false);
const createError = ref<string | null>(null);

async function prepareDialog(open: boolean) {
  emit("update:open", open);
  if (open) {
    actionError.value = null;
    await load();
  }
}

async function addTo(playlistId: string, playlistName: string) {
  if (pendingPlaylistId.value) return;
  pendingPlaylistId.value = playlistId;
  actionError.value = null;
  try {
    const result = await actions.add(playlistId, {
      kind: "catalog",
      trackId: props.track.id,
    });
    notifyPlaylistTrackAdded(playlistName, props.track.title, result.added);
    emit("update:open", false);
  } catch (reason) {
    actionError.value = actions.messageFor(reason, "error.playlistAdd");
  } finally {
    pendingPlaylistId.value = "";
  }
}

async function createAndAdd(name: string) {
  creating.value = true;
  createError.value = null;
  try {
    const playlist = await actions.create(name);
    const result = await actions.add(playlist.id, {
      kind: "catalog",
      trackId: props.track.id,
    });
    notifyPlaylistTrackAdded(playlist.name, props.track.title, result.added);
    createOpen.value = false;
    emit("update:open", false);
  } catch (reason) {
    createError.value = actions.messageFor(reason, "error.playlistCreate");
  } finally {
    creating.value = false;
  }
}
</script>

<template>
  <DialogRoot :open="open" @update:open="prepareDialog">
    <DialogPortal>
      <DialogOverlay class="fixed inset-0 z-50 bg-background/80" />
      <DialogContent
        class="fixed left-1/2 top-1/2 z-50 w-full max-w-lg -translate-x-1/2 -translate-y-1/2 rounded-lg border bg-card p-6 text-card-foreground shadow-lg"
      >
        <DialogTitle class="text-lg font-semibold">
          {{ t("playlistPicker.title") }}
        </DialogTitle>
        <DialogDescription class="mt-1 text-sm text-muted-foreground">
          {{ t("playlistPicker.description", { track: track.title }) }}
        </DialogDescription>
        <p
          v-if="actionError"
          role="alert"
          class="mt-3 text-sm text-destructive"
        >
          {{ actionError }}
        </p>
        <div class="mt-4 min-h-24">
          <div
            v-if="loading && !items.length"
            role="status"
            class="flex items-center gap-2 p-4 text-sm text-muted-foreground"
          >
            <PeridotSpinner
              :label="t('page.playlists.loading')"
              class="size-4"
            />
            {{ t("page.playlists.loading") }}
          </div>
          <p
            v-else-if="error && !items.length"
            role="alert"
            class="rounded-md border p-4 text-sm"
          >
            {{ error }}
          </p>
          <div v-else-if="items.length" class="space-y-2">
            <Button
              v-for="playlist in items"
              :key="playlist.id"
              type="button"
              variant="outline"
              class="w-full justify-start"
              :disabled="Boolean(pendingPlaylistId) || playlist.containsTrack"
              :aria-busy="pendingPlaylistId === playlist.id"
              @click="addTo(playlist.id, playlist.name)"
            >
              <Icon :icon="icons.playlist" aria-hidden="true" class="size-4" />
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
            </Button>
          </div>
          <p v-else class="rounded-md border p-4 text-sm text-muted-foreground">
            {{ t("page.playlists.emptyTitle") }}
          </p>
        </div>
        <div class="mt-5 flex justify-between gap-2">
          <Button
            type="button"
            variant="ghost"
            :disabled="creating"
            @click="createOpen = true"
          >
            <Icon :icon="icons.plus" aria-hidden="true" class="size-4" />
            {{ t("page.playlists.create") }}
          </Button>
          <Button
            type="button"
            variant="outline"
            @click="emit('update:open', false)"
          >
            {{ t("common.cancel") }}
          </Button>
        </div>
      </DialogContent>
    </DialogPortal>
  </DialogRoot>

  <PlaylistNameDialog
    v-model:open="createOpen"
    mode="create"
    :pending="creating"
    :error="createError"
    @submit="createAndAdd"
  />
</template>
