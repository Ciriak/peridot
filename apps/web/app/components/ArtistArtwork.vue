<script setup lang="ts">
import { Icon } from "@iconify/vue/offline";
import { computed, ref, watch } from "vue";
import { useServer } from "../composables/use-server";
import { icons } from "../lib/icons";
import { trackCoverUrl } from "../lib/library";

const props = withDefaults(
  defineProps<{
    imageUrl: string | null;
    size?: "sm" | "lg";
  }>(),
  { size: "sm" },
);

const { address } = useServer();
const imageFailed = ref(false);
const resolvedUrl = computed(() =>
  trackCoverUrl(address.value ?? "", props.imageUrl),
);

watch(resolvedUrl, () => {
  imageFailed.value = false;
});
</script>

<template>
  <div
    aria-hidden="true"
    class="flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-muted text-muted-foreground"
    :class="size === 'lg' ? 'size-40' : 'size-16'"
  >
    <img
      v-if="resolvedUrl && !imageFailed"
      :src="resolvedUrl"
      alt=""
      loading="lazy"
      decoding="async"
      class="size-full object-cover"
      @error="imageFailed = true"
    />
    <Icon
      v-else
      :icon="icons.user"
      :class="size === 'lg' ? 'size-16' : 'size-8'"
    />
  </div>
</template>
