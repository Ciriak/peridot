import type { LibraryScanResponse } from "@peridot/contracts";
import { createToastManager } from "reka-ui";
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
