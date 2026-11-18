<script setup lang="ts">
import { useIntersectionObserver } from "@vueuse/core";
import { PeridotSpinner } from "@peridot/ui/components/ui/spinner";
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
const armed = ref(true);

useIntersectionObserver(
  target,
  ([entry]) => {
    const intersecting = Boolean(entry?.isIntersecting);
    if (!intersecting) armed.value = true;
    isIntersecting.value = intersecting;
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
        armed: armed.value,
      })
    ) {
      return;
    }
    lastRequestedItemCount.value = itemCount;
    armed.value = false;
    emit("load");
  },
  { flush: "post" },
);
</script>

<template>
  <div ref="target" class="w-full" :aria-busy="loading ? 'true' : undefined">
    <div
      v-if="loading"
      class="flex items-center justify-center gap-3 py-6 text-sm text-muted-foreground"
    >
      <PeridotSpinner :label="label" class="size-6" />
      <span>{{ label }}</span>
    </div>
    <div v-else class="h-px w-full" aria-hidden="true"></div>
  </div>
</template>
