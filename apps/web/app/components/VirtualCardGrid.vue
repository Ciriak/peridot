<script setup lang="ts" generic="T">
import {
  breakpointsTailwind,
  useBreakpoints,
  watchDebounced,
} from "@vueuse/core";
import { computed, ref } from "vue";
import { useMainScrollVirtualizer } from "../composables/use-main-scroll-virtualizer";
import { useVirtualLoadMore } from "../composables/use-virtual-load-more";
import {
  VIRTUAL_WINDOW_LOAD_DELAY_MS,
  virtualCardRowPlaceholderCount,
} from "../lib/virtual-albums";

export type VirtualCardLayout = "wide" | "standard" | "compact";

const props = withDefaults(
  defineProps<{
    items: readonly T[];
    layout: VirtualCardLayout;
    itemKey: (item: T) => string | number;
    estimateRowHeight?: number;
    overscan?: number;
    totalCount?: number;
    loadedCount?: number;
    hasMore?: boolean;
    loadingMore?: boolean;
    pagingMode?: "incremental" | "window";
  }>(),
  {
    estimateRowHeight: 240,
    overscan: 4,
    hasMore: false,
    loadingMore: false,
    pagingMode: "incremental",
  },
);
const emit = defineEmits<{
  "load-more": [];
  "visible-range": [startIndex: number, endIndex: number];
}>();
defineSlots<{
  default(props: { item: T; itemIndex: number }): unknown;
  placeholder?(props: { itemIndex: number }): unknown;
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
const totalItemCount = computed(() =>
  Math.max(props.items.length, props.totalCount ?? props.items.length),
);
const loadedItemCount = computed(
  () =>
    props.loadedCount ??
    (props.totalCount === undefined
      ? props.items.length
      : props.items.filter((item) => item !== undefined).length),
);
const rowCount = computed(() =>
  Math.ceil(totalItemCount.value / columns.value),
);
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
useVirtualLoadMore({
  virtualItems: computed(() => virtualizer.virtualItems.value),
  loadedItemCount,
  totalItemCount,
  itemsPerRow: columns,
  prefetchRows: computed(() => props.overscan),
  enabled: computed(() => props.pagingMode === "incremental" && props.hasMore),
  loading: computed(() => props.loadingMore),
  onLoad: () => emit("load-more"),
});
const visibleRange = computed(() => {
  if (props.pagingMode !== "window") return null;
  const rows = virtualizer.virtualItems.value;
  const firstRow = rows[0];
  const lastRow = rows.at(-1);
  if (!firstRow || !lastRow || totalItemCount.value === 0) return null;
  return {
    startIndex: firstRow.index * columns.value,
    endIndex: Math.min(
      totalItemCount.value - 1,
      (lastRow.index + 1) * columns.value - 1,
    ),
  };
});
watchDebounced(
  visibleRange,
  (range) => {
    if (range) emit("visible-range", range.startIndex, range.endIndex);
  },
  { debounce: VIRTUAL_WINDOW_LOAD_DELAY_MS },
);

function rowItems(index: number) {
  const start = index * columns.value;
  return props.items
    .slice(start, start + columns.value)
    .filter((item): item is T => item !== undefined);
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
      <template
        v-for="row in virtualizer.virtualItems.value"
        :key="String(row.key)"
      >
        <div
          v-if="rowItems(row.index).length || $slots.placeholder"
          :ref="
            rowItems(row.index).length === columns
              ? virtualizer.measureRow
              : undefined
          "
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
            <template
              v-for="placeholderIndex in virtualCardRowPlaceholderCount(
                row.index,
                columns,
                totalItemCount,
                rowItems(row.index).length,
              )"
              :key="`placeholder-${row.index}-${placeholderIndex}`"
            >
              <slot
                name="placeholder"
                :item-index="
                  row.index * columns +
                  rowItems(row.index).length +
                  placeholderIndex -
                  1
                "
              />
            </template>
          </div>
        </div>
      </template>
    </div>
    <div v-if="$slots.footer" :class="layout === 'compact' ? 'mt-1.5' : 'mt-4'">
      <slot name="footer" />
    </div>
  </div>
</template>
