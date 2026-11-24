import { ref, toValue, watch, type MaybeRefOrGetter } from "vue";

interface VirtualRangeItem {
  index: number;
}

export interface VirtualLoadMoreState {
  highestVirtualIndex: number;
  loadedItemCount: number;
  totalItemCount: number;
  itemsPerRow: number;
  prefetchRows: number;
  enabled: boolean;
  loading: boolean;
  lastRequestedItemCount: number | null;
}

export function virtualLoadTriggerRow(state: {
  loadedItemCount: number;
  itemsPerRow: number;
  prefetchRows: number;
}) {
  const itemsPerRow = Math.max(1, state.itemsPerRow);
  const loadedRows = Math.ceil(state.loadedItemCount / itemsPerRow);
  return Math.max(0, loadedRows - 1 - Math.max(0, state.prefetchRows));
}

export function shouldLoadMoreForVirtualRange(
  state: VirtualLoadMoreState,
): boolean {
  if (
    !state.enabled ||
    state.loading ||
    state.loadedItemCount >= state.totalItemCount
  ) {
    return false;
  }
  return (
    state.highestVirtualIndex >=
      virtualLoadTriggerRow({
        loadedItemCount: state.loadedItemCount,
        itemsPerRow: state.itemsPerRow,
        prefetchRows: state.prefetchRows,
      }) && state.lastRequestedItemCount !== state.loadedItemCount
  );
}

export function useVirtualLoadMore(options: {
  virtualItems: MaybeRefOrGetter<readonly VirtualRangeItem[]>;
  loadedItemCount: MaybeRefOrGetter<number>;
  totalItemCount: MaybeRefOrGetter<number>;
  itemsPerRow: MaybeRefOrGetter<number>;
  prefetchRows: MaybeRefOrGetter<number>;
  enabled: MaybeRefOrGetter<boolean>;
  loading: MaybeRefOrGetter<boolean>;
  onLoad: () => void;
}) {
  const lastRequestedItemCount = ref<number | null>(null);

  function highestVirtualIndex() {
    return toValue(options.virtualItems).at(-1)?.index ?? -1;
  }

  function isNearLoadedBoundary() {
    return (
      highestVirtualIndex() >=
      virtualLoadTriggerRow({
        loadedItemCount: toValue(options.loadedItemCount),
        itemsPerRow: toValue(options.itemsPerRow),
        prefetchRows: toValue(options.prefetchRows),
      })
    );
  }

  watch(
    [
      highestVirtualIndex,
      () => toValue(options.loadedItemCount),
      () => toValue(options.totalItemCount),
      () => toValue(options.itemsPerRow),
      () => toValue(options.enabled),
      () => toValue(options.loading),
    ],
    ([highestIndex, loadedItemCount, totalItemCount, itemsPerRow]) => {
      if (!isNearLoadedBoundary()) {
        lastRequestedItemCount.value = null;
        return;
      }
      if (
        !shouldLoadMoreForVirtualRange({
          highestVirtualIndex: highestIndex,
          loadedItemCount,
          totalItemCount,
          itemsPerRow,
          prefetchRows: toValue(options.prefetchRows),
          enabled: toValue(options.enabled),
          loading: toValue(options.loading),
          lastRequestedItemCount: lastRequestedItemCount.value,
        })
      ) {
        return;
      }
      lastRequestedItemCount.value = loadedItemCount;
      options.onLoad();
    },
    { flush: "post" },
  );

  watch(
    () => toValue(options.loadedItemCount),
    (loadedItemCount, previousItemCount) => {
      if (
        previousItemCount !== undefined &&
        loadedItemCount < previousItemCount
      ) {
        lastRequestedItemCount.value = null;
      }
    },
  );
}
