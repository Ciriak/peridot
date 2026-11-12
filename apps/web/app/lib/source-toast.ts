import type { MessageDescriptor } from "@peridot/contracts";
import { message } from "./messages.ts";

export type SourceMutation = "added" | "removed";

export interface SourceToastContent {
  titleMessage: MessageDescriptor;
  descriptionMessage: MessageDescriptor;
  status: "success";
  kind: "success";
  duration: number;
}

export function sourceMutationToast(
  action: SourceMutation,
  sourceLabel = "",
): SourceToastContent {
  const label = sourceLabel.trim();

  if (action === "added") {
    return {
      titleMessage: message("toast.sourceAddedTitle"),
      descriptionMessage: label
        ? message("toast.sourceAdded", { source: label })
        : message("toast.sourceAddedGeneric"),
      status: "success",
      kind: "success",
      duration: 5000,
    };
  }

  return {
    titleMessage: message("toast.sourceRemovedTitle"),
    descriptionMessage: label
      ? message("toast.sourceRemoved", { source: label })
      : message("toast.sourceRemovedGeneric"),
    status: "success",
    kind: "success",
    duration: 5000,
  };
}
