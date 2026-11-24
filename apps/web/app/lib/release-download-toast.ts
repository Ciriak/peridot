import { message } from "./messages.ts";

export function releaseDownloadFailureToast(
  releaseTitle: string,
  detailMessage: string,
) {
  return {
    titleMessage: message("toast.downloadFailedTitle"),
    descriptionMessage: message("toast.releaseDownloadFailed", {
      release: releaseTitle.trim(),
      message: detailMessage,
    }),
    status: "error" as const,
    kind: "error" as const,
    duration: 8000,
  };
}
