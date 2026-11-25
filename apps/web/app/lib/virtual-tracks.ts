export function virtualTrackItemCount(options: {
  loadedCount: number;
  totalCount?: number;
  hasMore: boolean;
  loadingMore: boolean;
}): number {
  if (!options.hasMore && !options.loadingMore) return options.loadedCount;
  return Math.max(
    options.loadedCount,
    options.totalCount ?? options.loadedCount,
  );
}
