<script setup lang="ts">
import { Icon } from "@iconify/vue/offline";
import { useCachedArtwork } from "../composables/use-cached-artwork";
import { icons } from "../lib/icons";
import FadeInImage from "./FadeInImage.vue";

const props = defineProps<{
  url: string | null;
}>();

const { artworkUrl, failed } = useCachedArtwork(() => props.url);
</script>

<template>
  <div
    class="relative flex aspect-square items-center justify-center overflow-hidden bg-muted text-muted-foreground"
  >
    <Icon :icon="icons.album" aria-hidden="true" class="size-4" />
    <FadeInImage
      v-if="artworkUrl && !failed"
      :src="artworkUrl"
      class="absolute inset-0"
      @error="failed = true"
    />
  </div>
</template>
