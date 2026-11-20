<script setup lang="ts">
import type { TrackResponse } from "@peridot/contracts";
import TrackContextMenu from "./TrackContextMenu.vue";

defineProps<{ track: TrackResponse | null }>();
const emit = defineEmits<{ play: [] }>();
</script>

<template>
  <TrackContextMenu v-if="track" :track="track" @play="emit('play')">
    <slot />
  </TrackContextMenu>
  <slot v-else />
</template>
