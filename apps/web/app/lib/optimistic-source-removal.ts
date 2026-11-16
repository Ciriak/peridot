import type { SourceListResponse } from "@peridot/contracts";
import type { QueryClient, QueryKey } from "@tanstack/vue-query";

export function removeSourceFromQueryCache(
  queryClient: QueryClient,
  queryKey: QueryKey,
  sourceId: string,
): (() => void) | null {
  const current = queryClient.getQueryData<SourceListResponse>(queryKey);
  const removedIndex =
    current?.items.findIndex((source) => source.id === sourceId) ?? -1;
  if (!current || removedIndex < 0) return null;

  const removed = current.items[removedIndex]!;
  queryClient.setQueryData<SourceListResponse>(queryKey, {
    items: current.items.filter((source) => source.id !== sourceId),
  });

  return () => {
    const latest = queryClient.getQueryData<SourceListResponse>(queryKey);
    if (!latest || latest.items.some((source) => source.id === sourceId))
      return;
    const items = [...latest.items];
    items.splice(Math.min(removedIndex, items.length), 0, removed);
    queryClient.setQueryData<SourceListResponse>(queryKey, { items });
  };
}
