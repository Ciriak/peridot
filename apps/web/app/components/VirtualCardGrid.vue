<script setup lang="ts" generic="T">
import { breakpointsTailwind, useBreakpoints } from "@vueuse/core";
import { computed, ref } from "vue";
import { useMainScrollVirtualizer } from "../composables/use-main-scroll-virtualizer";

export type VirtualCardLayout = "wide" | "standard" | "compact";

const props = withDefaults(
  defineProps<{
    items: readonly T[];
    layout: VirtualCardLayout;
    itemKey: (item: T) => string | number;
    estimateRowHeight?: number;
    overscan?: number;
  }>(),
  {
    estimateRowHeight: 240,
    overscan: 4,
  },
);
defineSlots<{
  default(props: { item: T; itemIndex: number }): unknown;
  footer?: () => unknown;
}>();

const breakpoints = useBreakpoints(breakpointsTailwind);
const viewport = ref<HTMLElement | null>(null);
const columns = computed(() => {
  if (props.layout === "compact") {
    if (breakpoints.xl.value) return 10;
    if (breakpoints.lg.value) return 8;
    if (breakpoints.md.value) return 6;
    if (breakpoints.sm.value) return 4;
    return 2;
  }
  if (breakpoints.xl.value) return 5;
  if (breakpoints.lg.value) return 3;
  return 2;
});
const rowCount = computed(() => Math.ceil(props.items.length / columns.value));
const gridClass = computed(() => {
  if (props.layout === "compact") {
    return "grid grid-cols-2 gap-x-1.5 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 xl:grid-cols-10";
  }
  return "grid grid-cols-2 gap-x-4 lg:grid-cols-3 xl:grid-cols-5";
});
const rowGapClass = computed(() =>
  props.layout === "compact" ? "pb-1.5" : "pb-4",
);
const virtualizer = useMainScrollVirtualizer({
  count: rowCount,
  estimateSize: () => props.estimateRowHeight,
  overscan: props.overscan,
  wrapper: viewport,
  getItemKey: (index) => {
    const first = props.items[index * columns.value];
    return first ? props.itemKey(first) : index;
  },
});

function rowItems(index: number) {
  const start = index * columns.value;
  return props.items.slice(start, start + columns.value);
}

function rowKey(index: number) {
  const first = props.items[index * columns.value];
  return first ? props.itemKey(first) : index;
}
</script>

<template>
  <div class="w-full" :style="{ overflowAnchor: 'none' }">
    <div
      ref="viewport"
      class="relative w-full"
      :style="{
        height: `${virtualizer.totalSize.value}px`,
        overflowAnchor: 'none',
      }"
    >
      <div
        v-for="row in virtualizer.virtualItems.value"
        :key="String(row.key)"
        :ref="virtualizer.measureRow"
        :data-index="row.index"
        :style="virtualizer.virtualRowStyle(row)"
      >
        <div
          :class="[gridClass, row.index < rowCount - 1 && rowGapClass]"
          :data-virtual-row="rowKey(row.index)"
        >
          <slot
            v-for="(item, itemIndex) in rowItems(row.index)"
            :item="item"
            :item-index="row.index * columns + itemIndex"
          />
        </div>
      </div>
    </div>
    <div v-if="$slots.footer" :class="layout === 'compact' ? 'mt-1.5' : 'mt-4'">
      <slot name="footer" />
    </div>
  </div>
</template>
