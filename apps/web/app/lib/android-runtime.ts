import { Capacitor } from "@capacitor/core";

export function isAndroidRuntime(): boolean {
  return Capacitor.isNativePlatform() && Capacitor.getPlatform() === "android";
}
