<script setup lang="ts">
import { computed } from "vue";
import { playlistCoverSlots } from "../lib/playlists";
import PlaylistCoverTile from "./PlaylistCoverTile.vue";

const props = defineProps<{
  coverUrls: readonly string[];
}>();

const slots = computed(() => playlistCoverSlots(props.coverUrls));
</script>

<template>
  <div
    aria-hidden="true"
    class="grid aspect-square grid-cols-3 gap-px overflow-hidden rounded-md"
  >
    <PlaylistCoverTile
      v-for="(url, index) in slots"
      :key="`${index}:${url ?? 'empty'}`"
      :url="url"
    />
  </div>
</template>
