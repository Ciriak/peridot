import { useEventListener, useResizeObserver } from "@vueuse/core";
import { useVirtualizer } from "@tanstack/vue-virtual";
import {
  computed,
  inject,
  nextTick,
  onMounted,
  ref,
  toValue,
  watch,
  type ComponentPublicInstance,
  type CSSProperties,
  type MaybeRefOrGetter,
  type Ref,
} from "vue";
import { MAIN_SCROLL_ELEMENT_KEY } from "../lib/main-scroll";

export function useMainScrollVirtualizer(options: {
  count: MaybeRefOrGetter<number>;
  estimateSize: MaybeRefOrGetter<number | ((index: number) => number)>;
  overscan: number;
  wrapper: Ref<HTMLElement | null>;
  getItemKey?: (index: number) => string | number;
}) {
  const injectedScrollElement = inject(MAIN_SCROLL_ELEMENT_KEY, null);
  const scrollElement = computed(
    () =>
      injectedScrollElement?.value ??
      (import.meta.client ? document.getElementById("main-content") : null),
  );
  const scrollMargin = ref(0);
  const layoutRoot = computed(
    () => scrollElement.value?.firstElementChild as HTMLElement | null,
  );

  function updateScrollMargin() {
    const container = scrollElement.value;
    const wrapper = options.wrapper.value;
    if (!container || !wrapper) {
      scrollMargin.value = 0;
      return;
    }
    const containerRect = container.getBoundingClientRect();
    const wrapperRect = wrapper.getBoundingClientRect();
    scrollMargin.value =
      wrapperRect.top - containerRect.top + container.scrollTop;
  }

  const virtualizer = useVirtualizer(
    computed(() => ({
      count: toValue(options.count),
      getScrollElement: () => scrollElement.value,
      estimateSize: (index: number) => {
        const estimate = toValue(options.estimateSize);
        return typeof estimate === "number" ? estimate : estimate(index);
      },
      overscan: options.overscan,
      getItemKey: options.getItemKey ?? ((index: number) => index),
      scrollMargin: scrollMargin.value,
      useAnimationFrameWithResizeObserver: true,
    })),
  );

  async function refresh() {
    await nextTick();
    updateScrollMargin();
    virtualizer.value.measure();
  }

  watch(
    [scrollElement, options.wrapper, layoutRoot, () => toValue(options.count)],
    () => void refresh(),
    { flush: "post", immediate: true },
  );
  useResizeObserver(options.wrapper, updateScrollMargin);
  useResizeObserver(scrollElement, updateScrollMargin);
  useResizeObserver(layoutRoot, updateScrollMargin);
  if (import.meta.client) {
    useEventListener(window, "resize", updateScrollMargin);
  }
  onMounted(() => void refresh());

  function virtualRowStyle(item: { start: number }): CSSProperties {
    return {
      position: "absolute",
      top: 0,
      left: 0,
      width: "100%",
      transform: `translateY(${item.start - scrollMargin.value}px)`,
    };
  }

  function measureRow(element: Element | ComponentPublicInstance | null) {
    const target =
      element instanceof Element
        ? element
        : element?.$el instanceof Element
          ? element.$el
          : null;
    if (target) virtualizer.value.measureElement(target);
  }

  return {
    scrollMargin,
    virtualizer,
    virtualItems: computed(() => virtualizer.value.getVirtualItems()),
    totalSize: computed(() => virtualizer.value.getTotalSize()),
    measureRow,
    refresh,
    scrollToIndex: (
      index: number,
      scrollOptions?: {
        align?: "start" | "center" | "end" | "auto";
        behavior?: ScrollBehavior;
      },
    ) => virtualizer.value.scrollToIndex(index, scrollOptions),
    virtualRowStyle,
  };
}
