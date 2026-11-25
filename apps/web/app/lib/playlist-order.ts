export function playlistEntriesAfterDrag<T extends { id: string }>(
  entries: readonly T[],
  draggedId: string | null,
  previousId: string | null,
  nextId: string | null,
): T[] | null {
  if (!draggedId) return null;
  const dragged = entries.find((entry) => entry.id === draggedId);
  if (!dragged) return null;
  const reordered = entries.filter((entry) => entry.id !== draggedId);
  let insertionIndex = reordered.length;
  if (nextId) {
    const targetIndex = reordered.findIndex((entry) => entry.id === nextId);
    if (targetIndex >= 0) insertionIndex = targetIndex;
  } else if (previousId) {
    const targetIndex = reordered.findIndex((entry) => entry.id === previousId);
    if (targetIndex >= 0) insertionIndex = targetIndex + 1;
  }
  reordered.splice(insertionIndex, 0, dragged);
  return reordered;
}
