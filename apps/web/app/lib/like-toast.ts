import type { LikeTarget } from "@peridot/contracts";

export interface LikeToastContent {
  title: string;
  description: string;
  status: "success";
  kind: "success";
  duration: number;
}

export function likeSuccessToast(target: LikeTarget): LikeToastContent {
  const kind =
    target.kind === "track"
      ? "Track"
      : target.kind === "album"
        ? "Album"
        : "Artist";
  const label =
    target.kind === "album"
      ? target.title.trim()
      : target.kind === "artist"
        ? target.name.trim()
        : "";

  return {
    title: `${kind} liked`,
    description: label
      ? `${label} was added to your likes.`
      : "The track was added to your likes.",
    status: "success",
    kind: "success",
    duration: 5000,
  };
}
