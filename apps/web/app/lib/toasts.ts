import type { LikeTarget } from "@peridot/contracts";
import { createToastManager } from "reka-ui";
import { likeSuccessToast } from "./like-toast";
import { sourceMutationToast, type SourceMutation } from "./source-toast";

export type AppToastKind = "success" | "error";

export interface AppToastData {
  kind: AppToastKind;
}

export const appToastManager = createToastManager<AppToastData>();

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
  action: "added" | "disabled" | "enabled" | "updated",
  providerName?: string,
) {
  const name = providerName?.trim() || "Metadata provider";
  const content = {
    added: {
      title: "Metadata provider added",
      description: `${name} will be used for future library scans.`,
    },
    disabled: {
      title: "Metadata provider disabled",
      description: `${name} will no longer be used for metadata matching.`,
    },
    enabled: {
      title: "Metadata provider enabled",
      description: `${name} will be used for future metadata matching.`,
    },
    updated: {
      title: "Metadata provider updated",
      description: `${name} connection details were saved.`,
    },
  }[action];
  appToastManager.add({
    title: content.title,
    description: content.description,
    status: "success",
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
