<script setup lang="ts">
import type { PlaylistKind } from "@peridot/contracts";
import { Icon } from "@iconify/vue/offline";
import { computed } from "vue";
import { icons } from "../lib/icons";
import { playlistCoverSlots } from "../lib/playlists";
import PlaylistCoverTile from "./PlaylistCoverTile.vue";

const props = withDefaults(
  defineProps<{
    coverUrls: readonly string[];
    kind?: PlaylistKind;
  }>(),
  { kind: "manual" },
);

const slots = computed(() => playlistCoverSlots(props.coverUrls));
</script>

<template>
  <div
    v-if="kind === 'liked-tracks'"
    aria-hidden="true"
    class="flex aspect-square items-center justify-center rounded-md bg-primary/40 text-white"
  >
    <Icon :icon="icons.heartFilled" class="size-16" />
  </div>
  <div
    v-else
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
