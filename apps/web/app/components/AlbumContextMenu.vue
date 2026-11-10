<script setup lang="ts">
import type { LikeTarget } from "@peridot/contracts";
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
import { albumRoute, type AlbumGroup } from "../lib/library";

const props = defineProps<{
  album: Pick<AlbumGroup, "title" | "artist" | "trackIds">;
}>();
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
      <ContextMenuItem
        :disabled="!album.trackIds.length"
        @select="playCollection(album.trackIds)"
      >
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
