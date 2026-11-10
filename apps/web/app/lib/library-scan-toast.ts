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

export function isLibraryScanActive(
  status: LibraryScanStatus | undefined,
): boolean {
  return status !== undefined && activeStatuses.has(status);
}

export function libraryScanToast(
  scan: LibraryScanResponse,
): LibraryScanToastContent {
  if (scan.status === "queued") {
    return {
      title: "Library scan queued",
      description:
        "Waiting for the server to start scanning your music sources.",
      status: "loading",
      kind: "progress",
      duration: 0,
    };
  }

  if (scan.status === "running") {
    return {
      title: "Library scan in progress",
      description:
        scan.discoveredCount > 0
          ? `Discovered ${scan.discoveredCount} tracks: ${scan.createdCount} added, ${scan.updatedCount} updated.`
          : "Scanning your music sources for new tracks.",
      status: "loading",
      kind: "progress",
      duration: 0,
    };
  }

  if (scan.status === "completed") {
    const readErrors =
      scan.errorCount > 0 ? ` ${scan.errorCount} files could not be read.` : "";
    return {
      title: "Library scan complete",
      description: `${scan.createdCount} added, ${scan.updatedCount} updated, ${scan.unchangedCount} unchanged.${readErrors}`,
      status: "success",
      kind: "success",
      duration: 5000,
    };
  }

  return {
    title:
      scan.status === "interrupted"
        ? "Library scan interrupted"
        : "Library scan failed",
    description:
      scan.failureSummary ??
      "The server could not finish scanning the library.",
    status: "error",
    kind: "error",
    duration: 8000,
  };
}
