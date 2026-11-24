<script setup lang="ts">
import type { MediaResponse } from "@peridot/contracts";
import TrackContextMenu from "./TrackContextMenu.vue";

defineProps<{ track: MediaResponse | null }>();
const emit = defineEmits<{ play: [] }>();
</script>

<template>
  <TrackContextMenu v-if="track" :track="track" @play="emit('play')">
    <slot />
  </TrackContextMenu>
  <slot v-else />
</template>
