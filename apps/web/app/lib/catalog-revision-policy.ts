import type { RealtimeCatalogChangedEvent } from "@peridot/contracts";

export function removesOfflineCatalogSnapshot(
  reason: RealtimeCatalogChangedEvent["reason"],
): boolean {
  return reason === "source-removal" || reason === "reset";
}
