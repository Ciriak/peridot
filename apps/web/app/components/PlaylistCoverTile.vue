<script setup lang="ts">
import { Icon } from "@iconify/vue/offline";
import { useCachedArtwork } from "../composables/use-cached-artwork";
import { icons } from "../lib/icons";

const props = defineProps<{
  url: string | null;
}>();

const { artworkUrl, failed } = useCachedArtwork(() => props.url);
</script>

<template>
  <div
    class="flex aspect-square items-center justify-center overflow-hidden bg-muted text-muted-foreground"
  >
    <img
      v-if="artworkUrl && !failed"
      :src="artworkUrl"
      alt=""
      loading="lazy"
      decoding="async"
      class="size-full object-cover"
      @error="failed = true"
    />
    <Icon v-else :icon="icons.album" aria-hidden="true" class="size-4" />
  </div>
</template>
