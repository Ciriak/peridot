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
import { artistRoute, type ArtistGroup } from "../lib/library";

const props = defineProps<{
  artist: Pick<ArtistGroup, "name" | "trackIds">;
}>();
const { playCollection } = useLibraryPlayer();
const {
  loaded: likesLoaded,
  toggle: toggleLike,
  isTargetLiked,
  isPending: isLikePending,
} = useLikes();
const target = computed<LikeTarget>(() => ({
  kind: "artist",
  name: props.artist.name,
}));
</script>

<template>
  <ContextMenu>
    <ContextMenuTrigger as-child>
      <slot />
    </ContextMenuTrigger>
    <ContextMenuContent class="w-56">
      <ContextMenuLabel class="truncate">
        {{ artist.name }}
      </ContextMenuLabel>
      <ContextMenuSeparator />
      <ContextMenuItem
        :disabled="!artist.trackIds.length"
        @select="playCollection(artist.trackIds)"
      >
        <Icon :icon="icons.play" aria-hidden="true" />
        Play artist
      </ContextMenuItem>
      <ContextMenuItem
        :disabled="!likesLoaded || isLikePending(target)"
        @select="toggleLike(target)"
      >
        <Icon
          :icon="isTargetLiked(target) ? icons.heartFilled : icons.heart"
          aria-hidden="true"
        />
        {{ isTargetLiked(target) ? "Unlike artist" : "Like artist" }}
      </ContextMenuItem>
      <ContextMenuItem as-child>
        <NuxtLink :to="artistRoute(artist)">
          <Icon :icon="icons.user" aria-hidden="true" />
          Open artist
        </NuxtLink>
      </ContextMenuItem>
    </ContextMenuContent>
  </ContextMenu>
</template>
