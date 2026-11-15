<script setup lang="ts">
import { Icon } from "@iconify/vue/offline";
import { computed } from "vue";
import { useCachedArtwork } from "../composables/use-cached-artwork";
import { useServer } from "../composables/use-server";
import { icons } from "../lib/icons";
import { trackCoverUrl } from "../lib/library";
import FadeInImage from "./FadeInImage.vue";

const props = withDefaults(
  defineProps<{
    imageUrl: string | null;
    size?: "sm" | "lg";
  }>(),
  { size: "sm" },
);

const { address } = useServer();
const resolvedUrl = computed(() =>
  trackCoverUrl(address.value ?? "", props.imageUrl),
);
const { artworkUrl, failed: imageFailed } = useCachedArtwork(resolvedUrl);
</script>

<template>
  <div
    aria-hidden="true"
    class="relative flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-muted text-muted-foreground"
    :class="size === 'lg' ? 'size-40' : 'size-16'"
  >
    <Icon :icon="icons.user" :class="size === 'lg' ? 'size-16' : 'size-8'" />
    <FadeInImage
      v-if="artworkUrl && !imageFailed"
      :src="artworkUrl"
      class="absolute inset-0"
      @error="imageFailed = true"
    />
  </div>
</template>
