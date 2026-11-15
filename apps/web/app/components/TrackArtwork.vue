<script setup lang="ts">
import { Icon } from "@iconify/vue/offline";
import type { TrackResponse } from "@peridot/contracts";
import { computed } from "vue";
import { useCachedArtwork } from "../composables/use-cached-artwork";
import { icons } from "../lib/icons";
import { trackCoverUrl } from "../lib/library";
import FadeInImage from "./FadeInImage.vue";

const props = defineProps<{
  track: TrackResponse;
  serverAddress: string;
}>();

const coverUrl = computed(() =>
  trackCoverUrl(props.serverAddress, props.track.coverUrl),
);
const { artworkUrl, failed: coverFailed } = useCachedArtwork(coverUrl);
const placeholderIcon = computed(() =>
  props.track.albumId || props.track.album?.trim() ? icons.album : icons.music,
);
</script>

<template>
  <div
    class="relative flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-md bg-muted text-muted-foreground"
  >
    <Icon :icon="placeholderIcon" aria-hidden="true" class="size-5" />
    <FadeInImage
      v-if="artworkUrl && !coverFailed"
      :src="artworkUrl"
      class="absolute inset-0"
      @error="coverFailed = true"
    />
    <slot />
  </div>
</template>
