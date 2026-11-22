import type { ToastClasses, ToasterProps } from "vue-sonner";

export const TOAST_POSITION = "top-right" satisfies ToasterProps["position"];
export const TOAST_OFFSET = { top: 80, right: 24 };
export const TOAST_MOBILE_OFFSET = { top: 80, right: 16, left: 16 };
export const TOAST_SWIPE_DIRECTIONS = ["right"] satisfies NonNullable<
  ToasterProps["swipeDirections"]
>;

export const TOAST_CLASSES = {
  toast: "!rounded-lg !border-border !bg-popover !text-popover-foreground",
  description: "!text-muted-foreground",
  closeButton: "!border-border !bg-popover !text-popover-foreground",
} satisfies ToastClasses;
