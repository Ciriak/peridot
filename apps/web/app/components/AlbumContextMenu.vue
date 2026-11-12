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
import { computed } from "vue";
import { useLikes } from "../composables/use-likes";
import { useLibraryPlayer } from "../composables/use-library-player";
import { useOfflineTracks } from "../composables/use-offline-tracks";
import { icons } from "../lib/icons";
import { albumRoute } from "../lib/library";
import { loadCollectionTracks } from "../lib/catalog-collections";
import { useServer } from "../composables/use-server";
import { useServerConnection } from "../composables/use-server-connection";
import { useSession } from "../composables/use-session";
import { isPeridotNetworkError } from "../lib/peridot-client";

const props = defineProps<{
  album: AlbumSummaryResponse;
}>();
const { t } = useI18n();
const { address } = useServer();
const { token } = useSession();
const { playCollection } = useLibraryPlayer();
const { tracksMatching } = useOfflineTracks();
const { status: serverStatus } = useServerConnection();
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
  if (!address.value || !token.value) return;
  const playSaved = async () => {
    const saved = await tracksMatching(
      (track) => track.albumId === props.album.id,
    );
    if (saved.length) playCollection(saved);
  };
  if (serverStatus.value === "lost") {
    await playSaved();
    return;
  }
  try {
    playCollection(
      await loadCollectionTracks(address.value, token.value, {
        albumId: props.album.id,
      }),
    );
  } catch (reason) {
    if (isPeridotNetworkError(reason)) await playSaved();
  }
}
</script>

<template>
  <ContextMenu>
    <ContextMenuTrigger as-child>
      <slot />
    </ContextMenuTrigger>
    <ContextMenuContent class="w-56">
      <ContextMenuLabel class="truncate">
        {{ album.title }}
      </ContextMenuLabel>
      <ContextMenuSeparator />
      <ContextMenuItem :disabled="!album.trackCount" @select="playAlbum">
        <Icon :icon="icons.play" aria-hidden="true" />
        {{ t("context.playAlbum") }}
      </ContextMenuItem>
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
          <Icon :icon="icons.music" aria-hidden="true" />
          {{ t("context.openAlbum") }}
        </NuxtLink>
      </ContextMenuItem>
    </ContextMenuContent>
  </ContextMenu>
</template>
