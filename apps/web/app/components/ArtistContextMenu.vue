<script setup lang="ts">
import type { ArtistSummaryResponse, LikeTarget } from "@peridot/contracts";
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
import { artistRoute } from "../lib/library";
import { loadCollectionTrackIds } from "../lib/catalog-collections";
import { useServer } from "../composables/use-server";
import { useSession } from "../composables/use-session";

const props = defineProps<{
  artist: ArtistSummaryResponse;
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
  kind: "artist",
  name: props.artist.name,
}));

async function playArtist() {
  if (!address.value || !token.value) return;
  playCollection(
    await loadCollectionTrackIds(address.value, token.value, {
      artistId: props.artist.id,
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
        {{ artist.name }}
      </ContextMenuLabel>
      <ContextMenuSeparator />
      <ContextMenuItem :disabled="!artist.trackCount" @select="playArtist">
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
