import { useState } from "#imports";
import type { LibraryScanResponse } from "@peridot/contracts";
import { computed } from "vue";
import { isLibraryScanActive } from "../lib/library-scan-toast";
import { getLibraryScan, startLibraryScan } from "../lib/peridot-client";
import { useServer } from "./use-server";
import { useSession } from "./use-session";

export function useLibraryScan() {
  const { address } = useServer();
  const { token } = useSession();
  const scan = useState<LibraryScanResponse | null>("library-scan", () => null);
  const starting = useState("library-scan-starting", () => false);
  const scanning = computed(
    () => starting.value || isLibraryScanActive(scan.value?.status),
  );

  async function start() {
    if (scanning.value) return scan.value;
    starting.value = true;
    try {
      scan.value = await startLibraryScan(
        address.value ?? "",
        token.value ?? "",
      );
      return scan.value;
    } finally {
      starting.value = false;
    }
  }

  async function refresh() {
    if (!scan.value || !isLibraryScanActive(scan.value.status)) {
      return scan.value;
    }
    scan.value = await getLibraryScan(
      address.value ?? "",
      token.value ?? "",
      scan.value.id,
    );
    return scan.value;
  }

  return { scan, starting, scanning, start, refresh };
}
