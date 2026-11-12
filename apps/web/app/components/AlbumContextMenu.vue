<script setup lang="ts">
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
import { icons } from "../lib/icons";
import { albumRoute } from "../lib/library";
import { loadCollectionTrackIds } from "../lib/catalog-collections";
import { useServer } from "../composables/use-server";
import { useSession } from "../composables/use-session";

const props = defineProps<{
  album: AlbumSummaryResponse;
}>();
const { address } = useServer();
const { token } = useSession();
const { playCollection } = useLibraryPlayer();
const {
  loaded: likesLoaded,
  toggle: toggleLike,
  isTargetLiked,
  isPending: isLikePending,
} = useLikes();
const target = computed<LikeTarget>(() => ({
  kind: "album",
  title: props.album.title,
  artist: props.album.artist,
}));

async function playAlbum() {
  if (!address.value || !token.value) return;
  playCollection(
    await loadCollectionTrackIds(address.value, token.value, {
      albumId: props.album.id,
    }),
  );
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
        Play album
      </ContextMenuItem>
      <ContextMenuItem
        :disabled="!likesLoaded || isLikePending(target)"
        @select="toggleLike(target)"
      >
        <Icon
          :icon="isTargetLiked(target) ? icons.heartFilled : icons.heart"
          aria-hidden="true"
        />
        {{ isTargetLiked(target) ? "Unlike album" : "Like album" }}
      </ContextMenuItem>
      <ContextMenuItem as-child>
        <NuxtLink :to="albumRoute(album)">
          <Icon :icon="icons.music" aria-hidden="true" />
          Open album
        </NuxtLink>
      </ContextMenuItem>
    </ContextMenuContent>
  </ContextMenu>
</template>
