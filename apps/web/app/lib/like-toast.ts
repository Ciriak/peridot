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
    target.kind === "album" ||
    target.kind === "audiobook" ||
    target.kind === "podcast"
      ? target.title.trim()
      : target.kind === "playlist"
        ? target.name.trim()
        : target.kind === "artist"
          ? target.name.trim()
          : "";

  return {
    titleMessage: message(
      target.kind === "media"
        ? "toast.trackLikedTitle"
        : target.kind === "album"
          ? "toast.albumLikedTitle"
          : target.kind === "audiobook"
            ? "toast.audiobookLikedTitle"
            : target.kind === "podcast"
              ? "toast.podcastLikedTitle"
              : target.kind === "playlist"
                ? "toast.playlistLikedTitle"
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
