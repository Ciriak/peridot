import { useState } from "#imports";
import type { LibraryScanResponse } from "@peridot/contracts";
import { computed } from "vue";
import { isLibraryScanWorkActive } from "../lib/library-scan-toast";
import {
  getLibraryScan,
  refreshMetadata,
  rescanSource,
  startLibraryScan,
} from "../lib/peridot-client";
import { useServer } from "./use-server";
import { useSession } from "./use-session";

export function useLibraryScan() {
  const { address } = useServer();
  const { token } = useSession();
  const scan = useState<LibraryScanResponse | null>("library-scan", () => null);
  const starting = useState("library-scan-starting", () => false);
  const scanning = computed(
    () => starting.value || isLibraryScanWorkActive(scan.value),
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
    if (!scan.value || !isLibraryScanWorkActive(scan.value)) {
      return scan.value;
    }
    scan.value = await getLibraryScan(
      address.value ?? "",
      token.value ?? "",
      scan.value.id,
    );
    return scan.value;
  }

  async function startSource(sourceId: string) {
    if (scanning.value) return scan.value;
    starting.value = true;
    try {
      scan.value = await rescanSource(
        address.value ?? "",
        token.value ?? "",
        sourceId,
      );
      return scan.value;
    } finally {
      starting.value = false;
    }
  }

  async function startMetadataRefresh() {
    if (scanning.value) return scan.value;
    starting.value = true;
    try {
      scan.value = await refreshMetadata(
        address.value ?? "",
        token.value ?? "",
      );
      return scan.value;
    } finally {
      starting.value = false;
    }
  }

  return {
    scan,
    starting,
    scanning,
    start,
    startSource,
    startMetadataRefresh,
    refresh,
  };
}
