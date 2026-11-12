import type { LikeTarget, MessageDescriptor } from "@peridot/contracts";
import { createToastManager } from "reka-ui";
import { likeSuccessToast } from "./like-toast";
import { message } from "./messages.ts";
import { sourceMutationToast, type SourceMutation } from "./source-toast";

export type AppToastKind = "success" | "error";

export interface AppToastData {
  kind: AppToastKind;
  titleMessage: MessageDescriptor;
  descriptionMessage: MessageDescriptor;
}

export const appToastManager = createToastManager<AppToastData>();

function addToast(content: {
  titleMessage: MessageDescriptor;
  descriptionMessage: MessageDescriptor;
  status: "success" | "error";
  duration: number;
  kind: AppToastKind;
}) {
  appToastManager.add({
    status: content.status,
    duration: content.duration,
    type: "foreground",
    data: {
      kind: content.kind,
      titleMessage: content.titleMessage,
      descriptionMessage: content.descriptionMessage,
    },
  });
}

export function notifySourceMutation(
  action: SourceMutation,
  sourceLabel?: string,
) {
  const content = sourceMutationToast(action, sourceLabel);
  addToast(content);
}

export function notifyMetadataProviderMutation(
  action: "added" | "disabled" | "enabled" | "updated",
  providerName?: string,
) {
  const name = providerName?.trim() || "Metadata provider";
  const content: Record<
    "added" | "disabled" | "enabled" | "updated",
    { titleMessage: MessageDescriptor; descriptionMessage: MessageDescriptor }
  > = {
    added: {
      titleMessage: message("toast.providerAddedTitle"),
      descriptionMessage: message("toast.providerAdded", { provider: name }),
    },
    disabled: {
      titleMessage: message("toast.providerDisabledTitle"),
      descriptionMessage: message("toast.providerDisabled", {
        provider: name,
      }),
    },
    enabled: {
      titleMessage: message("toast.providerEnabledTitle"),
      descriptionMessage: message("toast.providerEnabled", {
        provider: name,
      }),
    },
    updated: {
      titleMessage: message("toast.providerUpdatedTitle"),
      descriptionMessage: message("toast.providerUpdated", {
        provider: name,
      }),
    },
  };
  addToast({
    ...content[action],
    status: "success",
    duration: 5000,
    kind: "success",
  });
}

export function notifyMetadataMatched(trackTitle: string) {
  addToast({
    titleMessage: message("toast.metadataMatchedTitle"),
    descriptionMessage: message("toast.metadataMatched", {
      track: trackTitle,
    }),
    status: "success",
    duration: 5000,
    kind: "success",
  });
}

export function notifyArtistMetadataMatched(artistName: string) {
  addToast({
    titleMessage: message("toast.artistMetadataMatchedTitle"),
    descriptionMessage: message("toast.artistMetadataMatched", {
      artist: artistName,
    }),
    status: "success",
    duration: 5000,
    kind: "success",
  });
}

export function notifyMetadataReverted(trackTitle: string) {
  addToast({
    titleMessage: message("toast.metadataRevertedTitle"),
    descriptionMessage: message("toast.metadataReverted", {
      track: trackTitle,
    }),
    status: "success",
    duration: 5000,
    kind: "success",
  });
}

export function notifyArtistMetadataReverted(artistName: string) {
  addToast({
    titleMessage: message("toast.artistMetadataRevertedTitle"),
    descriptionMessage: message("toast.artistMetadataReverted", {
      artist: artistName,
    }),
    status: "success",
    duration: 5000,
    kind: "success",
  });
}

export function notifyMetadataReset(trackCount: number, artistCount: number) {
  const count = trackCount + artistCount;
  addToast({
    titleMessage: message("toast.metadataResetTitle"),
    descriptionMessage: message(
      "toast.metadataReset",
      { count, trackCount, artistCount },
      count,
    ),
    status: "success",
    duration: 5000,
    kind: "success",
  });
}

export function notifyMetadataUpdateFailed(
  trackTitle: string,
  detailMessage: string,
) {
  addToast({
    titleMessage: message("toast.metadataUpdateFailedTitle"),
    descriptionMessage: message("toast.metadataUpdateFailed", {
      track: trackTitle,
      message: detailMessage,
    }),
    status: "error",
    duration: 8000,
    kind: "error",
  });
}

export function notifyTrackDownloadFailed(
  trackTitle: string,
  detailMessage: string,
) {
  addToast({
    titleMessage: message("toast.downloadFailedTitle"),
    descriptionMessage: message("toast.downloadFailed", {
      track: trackTitle,
      message: detailMessage,
    }),
    status: "error",
    duration: 8000,
    kind: "error",
  });
}

export function notifyTrackSavedOffline(trackTitle: string) {
  addToast({
    titleMessage: message("toast.offlineSavedTitle"),
    descriptionMessage: message("toast.offlineSaved", {
      track: trackTitle,
    }),
    status: "success",
    duration: 5000,
    kind: "success",
  });
}

export function notifyTrackOfflineCopyRemoved(trackTitle: string) {
  addToast({
    titleMessage: message("toast.offlineRemovedTitle"),
    descriptionMessage: message("toast.offlineRemoved", {
      track: trackTitle,
    }),
    status: "success",
    duration: 5000,
    kind: "success",
  });
}

export function notifyOfflineTrackFailed(
  trackTitle: string,
  detailMessage: string,
) {
  addToast({
    titleMessage: message("toast.offlineFailedTitle"),
    descriptionMessage: message("toast.offlineFailed", {
      track: trackTitle,
      message: detailMessage,
    }),
    status: "error",
    duration: 8000,
    kind: "error",
  });
}

export function notifyLikeFailed(target: string, detailMessage: string) {
  addToast({
    titleMessage: message("toast.likeFailedTitle"),
    descriptionMessage: message("toast.likeFailed", {
      target,
      message: detailMessage,
    }),
    status: "error",
    duration: 8000,
    kind: "error",
  });
}

export function notifyLikeSucceeded(target: LikeTarget) {
  const content = likeSuccessToast(target);
  addToast(content);
}

export function notifyAddedToQueue(trackTitle: string) {
  addToast({
    titleMessage: message("toast.addedToQueueTitle"),
    descriptionMessage: message("toast.addedToQueue", { track: trackTitle }),
    status: "success",
    duration: 5000,
    kind: "success",
  });
}

export function notifyQueueSaveFailed(detailMessage: string) {
  addToast({
    titleMessage: message("toast.queueSaveFailedTitle"),
    descriptionMessage: message("toast.queueSaveFailed", {
      message: detailMessage,
    }),
    status: "error",
    duration: 8000,
    kind: "error",
  });
}
