<script setup lang="ts">
import { useI18n } from "#imports";
import type { AlbumSummaryResponse, LikeTarget } from "@peridot/contracts";
import { Icon } from "@iconify/vue/offline";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuLabel,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@peridot/ui/components/ui/context-menu";
import { ProgressCircle } from "@peridot/ui/components/ui/progress-circle";
import { ScrollingText } from "@peridot/ui/components/ui/scrolling-text";
import { computed } from "vue";
import { useLikes } from "../composables/use-likes";
import { useLibraryPlayer } from "../composables/use-library-player";
import { useOfflineAlbum } from "../composables/use-offline-album";
import { useOfflineTracks } from "../composables/use-offline-tracks";
import { icons } from "../lib/icons";
import { albumRoute } from "../lib/library";
import { loadCollectionTracks } from "../lib/catalog-collections";
import { useServer } from "../composables/use-server";
import { useServerConnection } from "../composables/use-server-connection";
import { useSession } from "../composables/use-session";
import { isPeridotNetworkError } from "../lib/peridot-client";
import DownloadProgressTooltip from "./DownloadProgressTooltip.vue";

const props = defineProps<{
  album: AlbumSummaryResponse;
}>();
const { t } = useI18n();
const { address } = useServer();
const { token } = useSession();
const { toggleCollectionPlayback } = useLibraryPlayer();
const { savedTracks, tracksMatching } = useOfflineTracks();
const {
  allSaved: albumSavedOffline,
  pending: albumOfflinePending,
  progress: albumOfflineProgress,
  canToggle: canToggleAlbumOffline,
  toggle: toggleAlbumOffline,
} = useOfflineAlbum(() => props.album);
const { status: serverStatus } = useServerConnection();
const playable = computed(
  () =>
    Boolean(props.album.trackCount) &&
    (serverStatus.value !== "lost" ||
      savedTracks.value.some(
        (saved) => saved.track.albumId === props.album.id,
      )),
);
const albumTarget = computed(() => ({
  kind: "album" as const,
  id: props.album.id,
}));
const {
  loaded: likesLoaded,
  toggle: toggleLike,
  isTargetLiked,
  isPending: isLikePending,
} = useLikes();
const target = computed<LikeTarget>(() => ({
  kind: "album",
  albumId: props.album.id,
  title: props.album.title,
  artist: props.album.artist,
}));

async function playAlbum() {
  if (!playable.value) return;
  try {
    await toggleCollectionPlayback(albumTarget.value, async () => {
      const saved = await tracksMatching(
        (track) => track.albumId === props.album.id,
      );
      if (serverStatus.value === "lost" || !address.value || !token.value) {
        return saved;
      }
      try {
        return await loadCollectionTracks(address.value, token.value, {
          albumId: props.album.id,
        });
      } catch (reason) {
        if (isPeridotNetworkError(reason)) return saved;
        throw reason;
      }
    });
  } catch {
    // The shared player exposes playback failures.
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
        <ScrollingText class="w-full">{{ album.title }}</ScrollingText>
      </ContextMenuLabel>
      <ContextMenuSeparator />
      <ContextMenuItem :disabled="!playable" @select="playAlbum">
        <Icon :icon="icons.play" aria-hidden="true" />
        {{ t("context.playAlbum") }}
      </ContextMenuItem>
      <DownloadProgressTooltip
        :active="albumOfflinePending"
        :label="t('albumOffline.saving')"
        :progress="albumOfflineProgress ?? null"
        :title="album.title"
        type="album"
      >
        <ContextMenuItem
          :disabled="!canToggleAlbumOffline"
          @select="toggleAlbumOffline"
        >
          <ProgressCircle
            v-if="albumOfflinePending"
            :value="albumOfflineProgress ?? null"
            :label="t('albumOffline.saving')"
            size="sm"
          />
          <Icon
            v-else
            :icon="albumSavedOffline ? icons.cloudCheck : icons.cloudDownload"
            aria-hidden="true"
          />
          {{
            albumOfflinePending
              ? t("albumOffline.saving")
              : albumSavedOffline
                ? t("albumOffline.remove")
                : t("albumOffline.save")
          }}
        </ContextMenuItem>
      </DownloadProgressTooltip>
      <ContextMenuItem
        :disabled="!likesLoaded || isLikePending(target)"
        @select="toggleLike(target)"
      >
        <Icon
          :icon="isTargetLiked(target) ? icons.heartFilled : icons.heart"
          aria-hidden="true"
        />
        {{
          isTargetLiked(target)
            ? t("context.unlikeAlbum")
            : t("context.likeAlbum")
        }}
      </ContextMenuItem>
      <ContextMenuItem as-child>
        <NuxtLink :to="albumRoute(album)">
          <Icon :icon="icons.album" aria-hidden="true" />
          {{ t("context.openAlbum") }}
        </NuxtLink>
      </ContextMenuItem>
    </ContextMenuContent>
  </ContextMenu>
</template>
