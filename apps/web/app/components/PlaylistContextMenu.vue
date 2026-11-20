<script setup lang="ts">
import { useI18n } from "#imports";
import type { LikeTarget, PlaylistSummaryResponse } from "@peridot/contracts";
import { Icon } from "@iconify/vue/offline";
import { ScrollingText } from "@peridot/ui/components/ui/scrolling-text";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuLabel,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@peridot/ui/components/ui/context-menu";
import { computed, ref } from "vue";
import { useLikes } from "../composables/use-likes";
import { usePlaylistActions } from "../composables/use-playlists";
import { useServerConnection } from "../composables/use-server-connection";
import { icons } from "../lib/icons";
import PlaylistDeleteDialog from "./PlaylistDeleteDialog.vue";
import PlaylistNameDialog from "./PlaylistNameDialog.vue";

const props = defineProps<{
  playlist: PlaylistSummaryResponse;
  controlEnabled: boolean;
  playbackActive: boolean;
}>();
const emit = defineEmits<{
  actionError: [message: string];
  play: [];
}>();
const { t } = useI18n();
const { status } = useServerConnection();
const actions = usePlaylistActions();
const {
  loaded: likesLoaded,
  toggle: toggleLike,
  isPending: isLikePending,
} = useLikes();
const automatic = computed(() => props.playlist.kind === "liked-tracks");
const renameOpen = ref(false);
const deleteOpen = ref(false);
const pending = ref(false);
const actionError = ref<string | null>(null);
const likeTarget = computed<LikeTarget>(() => ({
  kind: "playlist",
  playlistId: props.playlist.id,
  name: props.playlist.name,
}));

function openRename() {
  actionError.value = null;
  renameOpen.value = true;
}

function reportError(message: string) {
  actionError.value = message;
  emit("actionError", message);
}

async function rename(name: string) {
  pending.value = true;
  actionError.value = null;
  try {
    await actions.rename(props.playlist.id, name);
    renameOpen.value = false;
  } catch (reason) {
    reportError(actions.messageFor(reason, "error.playlistUpdate"));
  } finally {
    pending.value = false;
  }
}

async function removePlaylist() {
  pending.value = true;
  actionError.value = null;
  try {
    await actions.remove(props.playlist.id);
    deleteOpen.value = false;
  } catch (reason) {
    reportError(actions.messageFor(reason, "error.playlistDelete"));
    deleteOpen.value = false;
  } finally {
    pending.value = false;
  }
}
</script>

<template>
  <ContextMenu>
    <ContextMenuTrigger as-child>
      <slot />
    </ContextMenuTrigger>
    <ContextMenuContent class="w-56">
      <ContextMenuLabel>
        <ScrollingText class="w-full">{{ playlist.name }}</ScrollingText>
      </ContextMenuLabel>
      <ContextMenuSeparator />
      <ContextMenuItem :disabled="!controlEnabled" @select="emit('play')">
        <Icon
          :icon="playbackActive ? icons.pause : icons.play"
          aria-hidden="true"
        />
        {{ t("context.playPlaylist") }}
      </ContextMenuItem>
      <ContextMenuItem
        v-if="!automatic"
        :disabled="!likesLoaded || isLikePending(likeTarget)"
        @select="toggleLike(likeTarget)"
      >
        <Icon
          :icon="playlist.liked ? icons.heartFilled : icons.heart"
          aria-hidden="true"
        />
        {{
          playlist.liked
            ? t("context.unlikePlaylist")
            : t("context.likePlaylist")
        }}
      </ContextMenuItem>
      <ContextMenuSeparator v-if="!automatic" />
      <ContextMenuItem
        v-if="!automatic"
        :disabled="status === 'lost'"
        @select="openRename"
      >
        <Icon :icon="icons.edit" aria-hidden="true" />
        {{ t("context.renamePlaylist") }}
      </ContextMenuItem>
      <ContextMenuItem
        v-if="!automatic"
        :disabled="status === 'lost'"
        @select="deleteOpen = true"
      >
        <Icon :icon="icons.trash" aria-hidden="true" />
        {{ t("context.deletePlaylist") }}
      </ContextMenuItem>
      <ContextMenuItem as-child>
        <NuxtLink :to="`/playlists/${playlist.id}`">
          <Icon :icon="icons.playlist" aria-hidden="true" />
          {{ t("context.openPlaylist") }}
        </NuxtLink>
      </ContextMenuItem>
    </ContextMenuContent>
  </ContextMenu>

  <PlaylistNameDialog
    v-model:open="renameOpen"
    mode="rename"
    :initial-name="playlist.name"
    :pending="pending"
    :error="actionError"
    @submit="rename"
  />
  <PlaylistDeleteDialog
    v-model:open="deleteOpen"
    :name="playlist.name"
    :pending="pending"
    @confirm="removePlaylist"
  />
</template>
