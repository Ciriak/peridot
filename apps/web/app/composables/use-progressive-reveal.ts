import { useIntersectionObserver } from "@vueuse/core";
import { computed, ref, toValue, watch, type MaybeRefOrGetter } from "vue";

export const PROGRESSIVE_BATCH_SIZE = 60;

export function useProgressiveReveal<T>(
  items: MaybeRefOrGetter<readonly T[]>,
  options: { initial?: number; step?: number } = {},
) {
  const initial = options.initial ?? PROGRESSIVE_BATCH_SIZE;
  const step = options.step ?? PROGRESSIVE_BATCH_SIZE;
  const visibleCount = ref(initial);
  const target = ref<HTMLElement | null>(null);

  const visibleItems = computed(() =>
    toValue(items).slice(0, visibleCount.value),
  );
  const total = computed(() => toValue(items).length);
  const hasMore = computed(() => visibleCount.value < total.value);

  function revealMore() {
    if (!hasMore.value) return;
    visibleCount.value = Math.min(total.value, visibleCount.value + step);
  }

  function revealThrough(index: number) {
    if (!Number.isInteger(index) || index < 0) return;
    visibleCount.value = Math.min(
      total.value,
      Math.max(visibleCount.value, index + 1),
    );
  }

  watch(
    () => toValue(items),
    () => {
      visibleCount.value = initial;
    },
    { flush: "sync" },
  );

  if (import.meta.client) {
    useIntersectionObserver(
      target,
      ([entry]) => {
        if (entry?.isIntersecting) revealMore();
      },
      { rootMargin: "300px 0px", threshold: 0 },
    );
  }

  return {
    target,
    total,
    hasMore,
    visibleCount,
    visibleItems,
    revealMore,
    revealThrough,
  };
}
