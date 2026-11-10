export type SourceMutation = "added" | "updated" | "removed";

export interface SourceToastContent {
  title: string;
  description: string;
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
      title: "Source added",
      description: label
        ? `${label} is now available to the library.`
        : "The source is now available to the library.",
      status: "success",
      kind: "success",
      duration: 5000,
    };
  }

  if (action === "updated") {
    return {
      title: "Source order updated",
      description: "The new source order was saved.",
      status: "success",
      kind: "success",
      duration: 5000,
    };
  }

  return {
    title: "Source removed",
    description: label
      ? `${label} was removed from the library sources.`
      : "The source was removed from the library sources.",
    status: "success",
    kind: "success",
    duration: 5000,
  };
}
