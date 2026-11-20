<script setup lang="ts">
import type { AlbumSummaryResponse } from "@peridot/contracts";
import { albumRoute } from "../lib/library";
import AlbumContextMenu from "./AlbumContextMenu.vue";

const props = defineProps<{
  album: AlbumSummaryResponse;
  class?: string;
}>();
</script>

<template>
  <AlbumContextMenu :album="album">
    <NuxtLink
      :to="albumRoute(album)"
      class="rounded-sm hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      :class="props.class"
      @contextmenu.stop
      @dblclick.stop
    >
      <slot>{{ album.title }}</slot>
    </NuxtLink>
  </AlbumContextMenu>
</template>
