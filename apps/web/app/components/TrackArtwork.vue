<script setup lang="ts">
import { Icon } from "@iconify/vue/offline";
import type { TrackResponse } from "@peridot/contracts";
import { computed, ref, watch } from "vue";
import { icons } from "../lib/icons";
import { trackCoverUrl } from "../lib/library";

const props = defineProps<{
  track: TrackResponse;
  serverAddress: string;
}>();

const coverFailed = ref(false);
const coverUrl = computed(() =>
  trackCoverUrl(props.serverAddress, props.track.coverUrl),
);

watch(coverUrl, () => {
  coverFailed.value = false;
});
</script>

<template>
  <div
    class="relative flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-md bg-muted text-muted-foreground"
  >
    <img
      v-if="coverUrl && !coverFailed"
      :src="coverUrl"
      alt=""
      aria-hidden="true"
      loading="lazy"
      decoding="async"
      class="size-full object-cover"
      @error="coverFailed = true"
    />
    <Icon v-else :icon="icons.music" aria-hidden="true" class="size-5" />
    <slot />
  </div>
</template>
