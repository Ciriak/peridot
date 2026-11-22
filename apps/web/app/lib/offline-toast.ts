import type { MessageDescriptor } from "@peridot/contracts";
import { message } from "./messages.ts";

export type OfflineSaveTarget = "album" | "track";

export interface OfflineSaveSuccessToast {
  titleMessage: MessageDescriptor;
  descriptionMessage: MessageDescriptor;
  status: "success";
  kind: "success";
  duration: number;
}

export interface OfflineTrackRemovalFailureToast {
  titleMessage: MessageDescriptor;
  descriptionMessage: MessageDescriptor;
  status: "error";
  kind: "error";
  duration: number;
}

export function offlineSaveSuccessToast(
  target: OfflineSaveTarget,
  title: string,
): OfflineSaveSuccessToast {
  const name = title.trim();
  return {
    titleMessage: message(
      target === "album"
        ? "toast.albumOfflineSavedTitle"
        : "toast.offlineSavedTitle",
    ),
    descriptionMessage:
      target === "album"
        ? message("toast.albumOfflineSaved", { album: name })
        : message("toast.offlineSaved", { track: name }),
    status: "success",
    kind: "success",
    duration: 5000,
  };
}

export function offlineTrackRemovalFailureToast(
  trackTitle: string,
  detailMessage: string,
): OfflineTrackRemovalFailureToast {
  return {
    titleMessage: message("toast.offlineRemoveFailedTitle"),
    descriptionMessage: message("toast.offlineRemoveFailed", {
      track: trackTitle.trim(),
      message: detailMessage,
    }),
    status: "error",
    kind: "error",
    duration: 8000,
  };
}
