<script setup lang="ts">
import { useIntersectionObserver } from "@vueuse/core";
import { ref, watch } from "vue";
import { shouldAutoLoadMore } from "../lib/auto-load-more";

const props = withDefaults(
  defineProps<{
    enabled: boolean;
    loading: boolean;
    itemCount: number;
    label: string;
    rootMargin?: string;
  }>(),
  {
    rootMargin: "300px 0px",
  },
);
const emit = defineEmits<{
  load: [];
}>();

const target = ref<HTMLElement | null>(null);
const isIntersecting = ref(false);
const lastRequestedItemCount = ref<number | null>(null);

useIntersectionObserver(
  target,
  ([entry]) => {
    isIntersecting.value = Boolean(entry?.isIntersecting);
  },
  {
    rootMargin: props.rootMargin,
    threshold: 0,
  },
);

watch(
  [
    isIntersecting,
    () => props.enabled,
    () => props.loading,
    () => props.itemCount,
  ],
  ([intersecting, enabled, loading, itemCount]) => {
    if (
      !shouldAutoLoadMore({
        isIntersecting: intersecting,
        enabled,
        loading,
        itemCount,
        lastRequestedItemCount: lastRequestedItemCount.value,
      })
    ) {
      return;
    }
    lastRequestedItemCount.value = itemCount;
    emit("load");
  },
  { flush: "post" },
);
</script>

<template>
  <div
    ref="target"
    class="h-px w-full"
    :aria-busy="loading ? 'true' : undefined"
  >
    <span v-if="loading" role="status" class="sr-only">{{ label }}</span>
  </div>
</template>
