import type { LibraryScanResponse, LikeTarget } from "@peridot/contracts";
import { createToastManager } from "reka-ui";
import { likeSuccessToast } from "./like-toast";
import { libraryScanToast } from "./library-scan-toast";
import { serverConnectionLostDescription } from "./server-connection";
import { sourceMutationToast, type SourceMutation } from "./source-toast";

export type AppToastKind = "progress" | "success" | "error";

export interface AppToastData {
  kind: AppToastKind;
}

export const LIBRARY_SCAN_TOAST_ID = "library-scan";
export const SERVER_CONNECTION_TOAST_ID = "server-connection";

export const appToastManager = createToastManager<AppToastData>();

export function notifyLibraryScan(scan: LibraryScanResponse) {
  const content = libraryScanToast(scan);
  appToastManager.add({
    id: LIBRARY_SCAN_TOAST_ID,
    title: content.title,
    description: content.description,
    status: content.status,
    duration: content.duration,
    type: content.kind === "progress" ? "background" : "foreground",
    data: { kind: content.kind },
  });
}

export function notifyScanStatusFailure(message: string) {
  appToastManager.add({
    id: LIBRARY_SCAN_TOAST_ID,
    title: "Library scan status unavailable",
    description: message,
    status: "error",
    duration: 8000,
    type: "foreground",
    data: { kind: "error" },
  });
}

export function notifyServerConnectionLost(serverAddress: string) {
  appToastManager.add({
    id: SERVER_CONNECTION_TOAST_ID,
    title: "Server connection lost",
    description: serverConnectionLostDescription(serverAddress),
    status: "error",
    duration: 0,
    type: "foreground",
    data: { kind: "error" },
  });
}

export function clearServerConnectionLost() {
  appToastManager.close(SERVER_CONNECTION_TOAST_ID);
}

export function notifySourceMutation(
  action: SourceMutation,
  sourceLabel?: string,
) {
  const content = sourceMutationToast(action, sourceLabel);
  appToastManager.add({
    title: content.title,
    description: content.description,
    status: content.status,
    duration: content.duration,
    type: "foreground",
    data: { kind: content.kind },
  });
}

export function notifyMetadataProviderMutation(
  action: "added" | "removed",
  providerName?: string,
) {
  const name = providerName?.trim() || "Metadata provider";
  const content =
    action === "added"
      ? {
          title: "Metadata provider added",
          description: `${name} will be used for future library scans.`,
          status: "success" as const,
        }
      : {
          title: "Metadata provider removed",
          description: `${name} will no longer be used for metadata matching.`,
          status: "success" as const,
        };
  appToastManager.add({
    title: content.title,
    description: content.description,
    status: content.status,
    duration: 5000,
    type: "foreground",
    data: { kind: "success" },
  });
}

export function notifyMetadataMatched(trackTitle: string) {
  appToastManager.add({
    title: "Metadata updated",
    description: `${trackTitle} now uses the selected metadata match.`,
    status: "success",
    duration: 5000,
    type: "foreground",
    data: { kind: "success" },
  });
}

export function notifyMetadataReverted(trackTitle: string) {
  appToastManager.add({
    title: "Using file metadata",
    description: `${trackTitle} now uses its original file tags.`,
    status: "success",
    duration: 5000,
    type: "foreground",
    data: { kind: "success" },
  });
}

export function notifyMetadataReset(resetCount: number) {
  appToastManager.add({
    title: "Metadata reset",
    description: `${resetCount} ${resetCount === 1 ? "track now uses" : "tracks now use"} their original file tags.`,
    status: "success",
    duration: 5000,
    type: "foreground",
    data: { kind: "success" },
  });
}

export function notifyMetadataUpdateFailed(
  trackTitle: string,
  message: string,
) {
  appToastManager.add({
    title: "Could not update metadata",
    description: `${trackTitle} was not changed. ${message}`,
    status: "error",
    duration: 8000,
    type: "foreground",
    data: { kind: "error" },
  });
}

export function notifyTrackDownloaded(trackTitle: string) {
  appToastManager.add({
    title: "Download ready",
    description: `${trackTitle} was saved by your browser.`,
    status: "success",
    duration: 5000,
    type: "foreground",
    data: { kind: "success" },
  });
}

export function notifyTrackDownloadFailed(trackTitle: string, message: string) {
  appToastManager.add({
    title: "Download failed",
    description: `${trackTitle} could not be downloaded. ${message}`,
    status: "error",
    duration: 8000,
    type: "foreground",
    data: { kind: "error" },
  });
}

export function notifyLikeFailed(target: string, message: string) {
  appToastManager.add({
    title: "Could not update favorite",
    description: `${target} was not changed. ${message}`,
    status: "error",
    duration: 8000,
    type: "foreground",
    data: { kind: "error" },
  });
}

export function notifyLikeSucceeded(target: LikeTarget) {
  const content = likeSuccessToast(target);
  appToastManager.add({
    title: content.title,
    description: content.description,
    status: content.status,
    duration: content.duration,
    type: "foreground",
    data: { kind: content.kind },
  });
}

export function notifyAddedToQueue(trackTitle: string) {
  appToastManager.add({
    title: "Added to queue",
    description: `${trackTitle} will play next.`,
    status: "success",
    duration: 5000,
    type: "foreground",
    data: { kind: "success" },
  });
}

export function notifyQueueSaveFailed(message: string) {
  appToastManager.add({
    title: "Could not save queue",
    description: `Playback will continue, but the next queue change will retry. ${message}`,
    status: "error",
    duration: 8000,
    type: "foreground",
    data: { kind: "error" },
  });
}
