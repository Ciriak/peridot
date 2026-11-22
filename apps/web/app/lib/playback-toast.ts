import type { MessageDescriptor } from "@peridot/contracts";
import { message } from "./messages.ts";

export interface PlaybackFailureToastContent {
  titleMessage: MessageDescriptor;
  descriptionMessage: MessageDescriptor;
  status: "error";
  kind: "error";
  duration: number;
}

export function playbackFailureToast(
  trackTitle = "",
): PlaybackFailureToastContent {
  const title = trackTitle.trim();
  return {
    titleMessage: message("toast.playbackFailedTitle"),
    descriptionMessage: title
      ? message("toast.playbackFailed", { track: title })
      : message("toast.playbackFailedGeneric"),
    status: "error",
    kind: "error",
    duration: 8000,
  };
}
