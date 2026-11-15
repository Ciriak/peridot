<script setup lang="ts">
import { useI18n, useState } from "#imports";
import type {
  PlaylistDetailResponse,
  PlaylistSummaryResponse,
} from "@peridot/contracts";
import { Icon } from "@iconify/vue/offline";
import { Button } from "@peridot/ui/components/ui/button";
import { ScrollingText } from "@peridot/ui/components/ui/scrolling-text";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuLabel,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@peridot/ui/components/ui/context-menu";
import { useQueryClient } from "@tanstack/vue-query";
import { computed, ref } from "vue";
import { useLikes } from "../composables/use-likes";
import { useLibraryPlayer } from "../composables/use-library-player";
import { useOfflineTracks } from "../composables/use-offline-tracks";
import { usePlaylistActions } from "../composables/use-playlists";
import { useQueryScope } from "../composables/use-query-scope";
import { useServer } from "../composables/use-server";
import { useServerConnection } from "../composables/use-server-connection";
import { useSession } from "../composables/use-session";
import { icons } from "../lib/icons";
import { trackCoverUrl } from "../lib/library";
import { fetchPlaylist } from "../lib/peridot-client";
import { playlistPlayableTracks } from "../lib/playlists";
import { queryKeys } from "../lib/query-keys";
import LikeButton from "./LikeButton.vue";
import PlaylistCover from "./PlaylistCover.vue";
import PlaylistDeleteDialog from "./PlaylistDeleteDialog.vue";
import PlaylistNameDialog from "./PlaylistNameDialog.vue";
import PlaylistOfflineSummaryButton from "./PlaylistOfflineSummaryButton.vue";

const props = defineProps<{ playlist: PlaylistSummaryResponse }>();
const { t } = useI18n();
const { address } = useServer();
const { scope } = useQueryScope();
const { token } = useSession();
const { status } = useServerConnection();
const { playing, playCollection, togglePlayback } = useLibraryPlayer();
const { savedTracks } = useOfflineTracks();
const queryClient = useQueryClient();
const actions = usePlaylistActions();
const activePlaylistId = useState<string | null>(
  "player-active-playlist-id",
  () => null,
);
const {
  loaded: likesLoaded,
  toggle: toggleLike,
  isPending: isLikePending,
} = useLikes();
const compactCoverUrls = computed(() =>
  props.playlist.coverUrls.flatMap((url) => {
    const resolved = trackCoverUrl(address.value ?? "", url);
    return resolved ? [resolved] : [];
  }),
);
const active = computed(() => activePlaylistId.value === props.playlist.id);
const renameOpen = ref(false);
const deleteOpen = ref(false);
const pending = ref(false);
const actionError = ref<string | null>(null);
const likeTarget = computed(() => ({
  kind: "playlist" as const,
  playlistId: props.playlist.id,
  name: props.playlist.name,
}));

async function loadDetail(): Promise<PlaylistDetailResponse | null> {
  if (!scope.value || !token.value) return null;
  const key = queryKeys.playlist(scope.value, props.playlist.id);
  const cached = queryClient.getQueryData<PlaylistDetailResponse>(key);
  if (cached) return cached;
  if (status.value === "lost") return null;
  return queryClient.fetchQuery({
    queryKey: key,
    queryFn: () =>
      fetchPlaylist(
        scope.value!.serverAddress,
        token.value!,
        props.playlist.id,
      ),
    meta: { persist: true },
  });
}

async function togglePlaylistPlayback() {
  if (active.value && playing.value) {
    togglePlayback();
    return;
  }
  const detail = await loadDetail();
  if (!detail) return;
  const savedIds = new Set(savedTracks.value.map((saved) => saved.track.id));
  const tracks = playlistPlayableTracks(detail.entries, {
    serverLost: status.value === "lost",
    savedTrackIds: savedIds,
  });
  if (!tracks.length) return;
  activePlaylistId.value = detail.id;
  playCollection(tracks);
}

function openRename() {
  actionError.value = null;
  renameOpen.value = true;
}

async function rename(name: string) {
  pending.value = true;
  actionError.value = null;
  try {
    await actions.rename(props.playlist.id, name);
    renameOpen.value = false;
  } catch (reason) {
    actionError.value = actions.messageFor(reason, "error.playlistUpdate");
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
    actionError.value = actions.messageFor(reason, "error.playlistDelete");
    deleteOpen.value = false;
  } finally {
    pending.value = false;
  }
}
</script>

<template>
  <ContextMenu>
    <ContextMenuTrigger as-child>
      <article
        class="group relative min-w-0 rounded-lg border bg-card p-3 text-card-foreground"
      >
        <div class="relative">
          <NuxtLink
            :to="`/playlists/${playlist.id}`"
            class="block rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            :aria-label="t('playlistCard.open', { playlist: playlist.name })"
          >
            <PlaylistCover :cover-urls="compactCoverUrls" />
          </NuxtLink>
          <Button
            variant="default"
            size="icon"
            class="absolute bottom-2 right-2 z-10 rounded-full shadow-md"
            :aria-label="
              active && playing
                ? t('playlistCard.pause', { playlist: playlist.name })
                : t('playlistCard.play', { playlist: playlist.name })
            "
            :disabled="!playlist.availableTrackCount"
            @click.prevent.stop="togglePlaylistPlayback"
          >
            <Icon
              :icon="active && playing ? icons.pause : icons.play"
              aria-hidden="true"
              class="size-5"
            />
          </Button>
        </div>
        <div class="mt-3 min-w-0 pr-16">
          <NuxtLink
            :to="`/playlists/${playlist.id}`"
            class="block rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <h3 class="font-medium">
              <ScrollingText class="w-full">
                {{ playlist.name }}
              </ScrollingText>
            </h3>
          </NuxtLink>
          <p class="truncate text-xs text-muted-foreground">
            {{
              t(
                "count.track",
                { count: playlist.trackCount },
                playlist.trackCount,
              )
            }}
            <template v-if="playlist.availableTrackCount < playlist.trackCount">
              ·
              {{
                t("playlistCard.unavailableCount", {
                  count: playlist.trackCount - playlist.availableTrackCount,
                })
              }}
            </template>
          </p>
        </div>
        <div class="absolute bottom-2 left-3 flex items-center">
          <PlaylistOfflineSummaryButton :playlist="playlist" />
        </div>
        <LikeButton
          class="absolute bottom-1 right-1"
          compact
          :liked="playlist.liked"
          :label="playlist.name"
          :pending="isLikePending(likeTarget)"
          :disabled="!likesLoaded || status === 'lost'"
          @toggle="toggleLike(likeTarget)"
        />
        <p
          v-if="actionError"
          role="alert"
          class="mt-2 line-clamp-2 text-xs text-destructive"
        >
          {{ actionError }}
        </p>
      </article>
    </ContextMenuTrigger>
    <ContextMenuContent class="w-56">
      <ContextMenuLabel>
        <ScrollingText class="w-full">{{ playlist.name }}</ScrollingText>
      </ContextMenuLabel>
      <ContextMenuSeparator />
      <ContextMenuItem
        :disabled="!playlist.availableTrackCount"
        @select="togglePlaylistPlayback"
      >
        <Icon :icon="icons.play" aria-hidden="true" />
        {{ t("context.playPlaylist") }}
      </ContextMenuItem>
      <ContextMenuItem
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
      <ContextMenuSeparator />
      <ContextMenuItem :disabled="status === 'lost'" @select="openRename">
        <Icon :icon="icons.edit" aria-hidden="true" />
        {{ t("context.renamePlaylist") }}
      </ContextMenuItem>
      <ContextMenuItem
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
