import type { ReleaseImportStatus } from "@peridot/contracts";

export type TorznabImportRowState =
  | { kind: "adding" }
  | { kind: "tracking"; status: ReleaseImportStatus }
  | { kind: "ready"; mediaIds: string[] }
  | { kind: "already-added" }
  | {
      kind: "failed";
      retryable: boolean;
      status?: ReleaseImportStatus;
    };

export type TorznabTransferPhase =
  | "queued"
  | "metadata"
  | "downloading"
  | "checking"
  | "paused"
  | "indexing"
  | "other";

export function torznabImportPercent(progress: number): number {
  return Math.min(100, Math.max(0, Math.round(progress * 100)));
}

export function torznabTransferPhase(
  state: string,
  progress: number,
): TorznabTransferPhase {
  if (progress >= 1) return "indexing";
  if (["queuedDL", "queuedUP", "pending", "allocating"].includes(state)) {
    return "queued";
  }
  if (["metaDL", "forcedMetaDL"].includes(state)) return "metadata";
  if (["checkingDL", "checkingUP", "checkingResumeData"].includes(state)) {
    return "checking";
  }
  if (["pausedDL", "pausedUP", "stoppedDL", "stoppedUP"].includes(state)) {
    return "paused";
  }
  if (["downloading", "forcedDL", "stalledDL"].includes(state)) {
    return "downloading";
  }
  return "other";
}

export function torznabTerminalImportState(state: string | undefined) {
  return (
    state === "error" ||
    state === "missingFiles" ||
    state === "failed" ||
    state === "interrupted" ||
    state === "stopped"
  );
}

export function torznabImportShouldPoll(
  status: Pick<ReleaseImportStatus, "state" | "mediaIds"> | undefined,
): boolean {
  return (
    !status ||
    (!status.mediaIds.length && !torznabTerminalImportState(status.state))
  );
}
