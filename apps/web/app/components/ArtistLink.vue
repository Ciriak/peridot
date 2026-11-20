<script setup lang="ts">
import type { ArtistSummaryResponse } from "@peridot/contracts";
import { computed } from "vue";
import { artistRoute } from "../lib/library";
import ArtistContextMenu from "./ArtistContextMenu.vue";

const props = defineProps<{
  artist: string | ArtistSummaryResponse;
  class?: string;
}>();

const artistName = computed(() =>
  typeof props.artist === "string" ? props.artist : props.artist.name,
);
const artistLinkRoute = computed(() =>
  artistRoute(
    typeof props.artist === "string" ? { name: props.artist } : props.artist,
  ),
);
</script>

<template>
  <ArtistContextMenu :artist="artist">
    <NuxtLink
      :to="artistLinkRoute"
      class="rounded-sm hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      :class="props.class"
      @contextmenu.stop
      @dblclick.stop
    >
      <slot>{{ artistName }}</slot>
    </NuxtLink>
  </ArtistContextMenu>
</template>
