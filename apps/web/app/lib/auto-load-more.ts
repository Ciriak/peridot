export interface AutoLoadMoreState {
  isIntersecting: boolean;
  enabled: boolean;
  loading: boolean;
  itemCount: number;
  lastRequestedItemCount: number | null;
}

export function shouldAutoLoadMore(state: AutoLoadMoreState): boolean {
  return (
    state.isIntersecting &&
    state.enabled &&
    !state.loading &&
    state.lastRequestedItemCount !== state.itemCount
  );
}
