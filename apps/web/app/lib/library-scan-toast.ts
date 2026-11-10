import type {
  LibraryScanResponse,
  LibraryScanStatus,
} from "@peridot/contracts";

export type LibraryScanToastKind = "progress" | "success" | "error";

export interface LibraryScanToastContent {
  title: string;
  description: string;
  status: "loading" | "success" | "error";
  kind: LibraryScanToastKind;
  duration: number;
}

const activeStatuses = new Set<LibraryScanStatus>(["queued", "running"]);
const activeMetadataStatuses = new Set(["pending", "running"]);

export function isLibraryScanActive(
  status: LibraryScanStatus | undefined,
): boolean {
  return status !== undefined && activeStatuses.has(status);
}

export function isLibraryScanWorkActive(
  scan: LibraryScanResponse | null | undefined,
): boolean {
  return Boolean(
    scan &&
    (isLibraryScanActive(scan.status) ||
      activeMetadataStatuses.has(scan.metadataStatus)),
  );
}

function scanTitle(scan: LibraryScanResponse, action: string): string {
  return scan.sourceName && scan.sourceName !== "All sources"
    ? `${scan.sourceName} ${action}`
    : `Library ${action}`;
}

function metadataProgress(scan: LibraryScanResponse): LibraryScanToastContent {
  return {
    title: scanTitle(scan, "metadata matching"),
    description:
      scan.metadataTotalCount > 0
        ? `Matched ${scan.metadataMatchedCount} of ${scan.metadataProcessedCount} processed tracks (${scan.metadataTotalCount} total).`
        : "Finding metadata matches for new and changed tracks.",
    status: "loading",
    kind: "progress",
    duration: 0,
  };
}

export function libraryScanToast(
  scan: LibraryScanResponse,
): LibraryScanToastContent {
  if (scan.status === "queued") {
    return {
      title: scanTitle(scan, "scan queued"),
      description:
        "Waiting for the server to start scanning your music sources.",
      status: "loading",
      kind: "progress",
      duration: 0,
    };
  }

  if (scan.status === "running") {
    return {
      title: scanTitle(scan, "scan in progress"),
      description:
        scan.discoveredCount > 0
          ? `Discovered ${scan.discoveredCount} tracks: ${scan.createdCount} added, ${scan.updatedCount} updated.`
          : "Scanning your music sources for new tracks.",
      status: "loading",
      kind: "progress",
      duration: 0,
    };
  }

  if (activeMetadataStatuses.has(scan.metadataStatus)) {
    return metadataProgress(scan);
  }

  if (scan.status === "completed") {
    const readErrors =
      scan.errorCount > 0 ? ` ${scan.errorCount} files could not be read.` : "";
    const metadata =
      scan.metadataStatus === "skipped"
        ? ""
        : ` ${scan.metadataMatchedCount} metadata matches, ${scan.metadataUnmatchedCount} unmatched, ${scan.metadataErrorCount} errors.`;
    if (
      scan.metadataStatus === "failed" ||
      scan.metadataStatus === "interrupted"
    ) {
      return {
        title: scanTitle(scan, "scan complete; metadata matching failed"),
        description:
          scan.metadataFailureSummary ??
          "The file scan completed, but metadata matching could not finish.",
        status: "error",
        kind: "error",
        duration: 8000,
      };
    }
    return {
      title: scanTitle(scan, "scan complete"),
      description: `${scan.createdCount} added, ${scan.updatedCount} updated, ${scan.unchangedCount} unchanged.${readErrors}${metadata}`,
      status: "success",
      kind: "success",
      duration: 5000,
    };
  }

  return {
    title:
      scan.status === "interrupted"
        ? scanTitle(scan, "scan interrupted")
        : scanTitle(scan, "scan failed"),
    description:
      scan.failureSummary ??
      "The server could not finish scanning the library.",
    status: "error",
    kind: "error",
    duration: 8000,
  };
}
