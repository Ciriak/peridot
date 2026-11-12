import type { LikeTarget } from "@peridot/contracts";
import type { MessageDescriptor } from "@peridot/contracts";
import { message } from "./messages.ts";

export interface LikeToastContent {
  titleMessage: MessageDescriptor;
  descriptionMessage: MessageDescriptor;
  status: "success";
  kind: "success";
  duration: number;
}

export function likeSuccessToast(target: LikeTarget): LikeToastContent {
  const label =
    target.kind === "album"
      ? target.title.trim()
      : target.kind === "artist"
        ? target.name.trim()
        : "";

  return {
    titleMessage: message(
      target.kind === "track"
        ? "toast.trackLikedTitle"
        : target.kind === "album"
          ? "toast.albumLikedTitle"
          : "toast.artistLikedTitle",
    ),
    descriptionMessage: label
      ? message("toast.likedNamed", { target: label })
      : message("toast.trackLiked"),
    status: "success",
    kind: "success",
    duration: 5000,
  };
}
