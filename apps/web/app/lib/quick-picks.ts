import type { QuickPickItemResponse } from "@peridot/contracts";

export type ResolvedQuickPickItem = QuickPickItemResponse;

export function quickPickArtistNames(
  item: ResolvedQuickPickItem,
): readonly string[] {
  return item.kind === "track" ? item.track.artists : item.album.artists;
}

export function resolveQuickPicks(
  items: readonly QuickPickItemResponse[],
): ResolvedQuickPickItem[] {
  return [...items];
}
