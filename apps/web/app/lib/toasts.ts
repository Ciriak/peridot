import type { LikeTarget, MessageDescriptor } from "@peridot/contracts";
import { h } from "vue";
import { toast } from "vue-sonner";
import LocalizedToastMessage from "../components/LocalizedToastMessage.vue";
import { likeSuccessToast } from "./like-toast";
import { message } from "./messages.ts";
import {
  offlineSaveSuccessToast,
  offlineTrackRemovalFailureToast,
} from "./offline-toast";
import { playbackFailureToast } from "./playback-toast";
import { sourceMutationToast, type SourceMutation } from "./source-toast";

export type AppToastKind = "success" | "error";

function addToast(content: {
  titleMessage: MessageDescriptor;
  descriptionMessage: MessageDescriptor;
  status: "success" | "error";
  duration: number;
  kind: AppToastKind;
}) {
  const title = h(LocalizedToastMessage, {
    message: content.titleMessage,
  });
  const options = {
    description: h(LocalizedToastMessage, {
      message: content.descriptionMessage,
    }),
    duration: content.duration,
  };

  if (content.status === "error") {
    toast.error(title, options);
  } else {
    toast.success(title, options);
  }
}

export function notifySourceMutation(
  action: SourceMutation,
  sourceLabel?: string,
  unavailableTrackCount?: number,
) {
  const content = sourceMutationToast(
    action,
    sourceLabel,
    unavailableTrackCount,
  );
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

export function notifyPlaybackFailed(trackTitle?: string) {
  addToast(playbackFailureToast(trackTitle));
}

export function notifyOfflineTrackSaved(trackTitle: string) {
  addToast(offlineSaveSuccessToast("track", trackTitle));
}

export function notifyOfflineAlbumSaved(albumTitle: string) {
  addToast(offlineSaveSuccessToast("album", albumTitle));
}

export function notifyDownloadTaskEnded(
  title: string,
  completedWithErrors: boolean,
) {
  addToast({
    titleMessage: message(
      completedWithErrors
        ? "toast.downloadTaskPartialTitle"
        : "toast.downloadTaskCompletedTitle",
    ),
    descriptionMessage: message(
      completedWithErrors
        ? "toast.downloadTaskPartial"
        : "toast.downloadTaskCompleted",
      { item: title },
    ),
    status: completedWithErrors ? "error" : "success",
    duration: completedWithErrors ? 8000 : 5000,
    kind: completedWithErrors ? "error" : "success",
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

export function notifyOfflineTrackRemoveFailed(
  trackTitle: string,
  detailMessage: string,
) {
  addToast(offlineTrackRemovalFailureToast(trackTitle, detailMessage));
}

export function notifyOfflineAlbumFailed(
  albumTitle: string,
  detailMessage: string,
) {
  addToast({
    titleMessage: message("toast.albumOfflineFailedTitle"),
    descriptionMessage: message("toast.albumOfflineFailed", {
      album: albumTitle,
      message: detailMessage,
    }),
    status: "error",
    duration: 8000,
    kind: "error",
  });
}

export function notifyOfflinePlaylistFailed(
  playlistTitle: string,
  detailMessage: string,
) {
  addToast({
    titleMessage: message("toast.playlistOfflineFailedTitle"),
    descriptionMessage: message("toast.playlistOfflineFailed", {
      playlist: playlistTitle,
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

export function notifyOfflineCollectionSaved(title: string) {
  addToast({
    titleMessage: message("toast.collectionOfflineSavedTitle"),
    descriptionMessage: message("toast.collectionOfflineSaved", {
      collection: title,
    }),
    status: "success",
    duration: 5000,
    kind: "success",
  });
}

export function notifyOfflineCollectionFailed(
  title: string,
  detailMessage: string,
) {
  addToast({
    titleMessage: message("toast.collectionOfflineFailedTitle"),
    descriptionMessage: message("toast.collectionOfflineFailed", {
      collection: title,
      message: detailMessage,
    }),
    status: "error",
    duration: 8000,
    kind: "error",
  });
}

export function notifyServerOnline() {
  addToast({
    titleMessage: message("toast.serverOnlineTitle"),
    descriptionMessage: message("toast.serverOnline"),
    status: "success",
    duration: 5000,
    kind: "success",
  });
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

export function notifyPlaylistTrackAdded(
  playlistTitle: string,
  trackTitle: string,
  added: boolean,
) {
  addToast({
    titleMessage: message(
      added
        ? "toast.playlistTrackAddedTitle"
        : "toast.playlistTrackPresentTitle",
    ),
    descriptionMessage: message(
      added ? "toast.playlistTrackAdded" : "toast.playlistTrackPresent",
      { playlist: playlistTitle, track: trackTitle },
    ),
    status: "success",
    duration: 5000,
    kind: "success",
  });
}
