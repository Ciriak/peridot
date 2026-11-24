export const VIRTUAL_ALBUM_PAGE_SIZE = 100;
export const VIRTUAL_WINDOW_LOAD_DELAY_MS = 250;
const PAGE_NEIGHBORHOOD = 1;

export function virtualCardRowPlaceholderCount(
  rowIndex: number,
  columns: number,
  totalItemCount: number,
  loadedRowItemCount: number,
): number {
  const rowStart = Math.max(0, rowIndex) * columns;
  const rowItemCapacity = Math.min(
    columns,
    Math.max(0, totalItemCount - rowStart),
  );
  return Math.max(0, rowItemCapacity - loadedRowItemCount);
}

export function virtualAlbumPageOffsets(
  startIndex: number,
  endIndex: number,
): number[] {
  const firstPage = Math.floor(
    Math.max(0, startIndex) / VIRTUAL_ALBUM_PAGE_SIZE,
  );
  const lastPage = Math.floor(
    Math.max(firstPage * VIRTUAL_ALBUM_PAGE_SIZE, endIndex) /
      VIRTUAL_ALBUM_PAGE_SIZE,
  );
  const offsets = new Set<number>();
  for (
    let page = Math.max(0, firstPage - PAGE_NEIGHBORHOOD);
    page <= lastPage + PAGE_NEIGHBORHOOD;
    page += 1
  ) {
    offsets.add(page * VIRTUAL_ALBUM_PAGE_SIZE);
  }
  return [...offsets].sort((left, right) => left - right);
}
