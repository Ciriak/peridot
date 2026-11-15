import { App as CapacitorApp } from "@capacitor/app";
import { StatusBar, Style } from "@capacitor/status-bar";
import { defineNuxtPlugin, useRouter } from "#imports";
import { isAndroidRuntime } from "../lib/android-runtime";

export default defineNuxtPlugin(() => {
  if (!isAndroidRuntime()) return;

  const router = useRouter();
  void navigator.serviceWorker
    ?.getRegistrations()
    .then((registrations) =>
      Promise.all(
        registrations.map((registration) => registration.unregister()),
      ),
    )
    .catch(() => undefined);
  void StatusBar.setOverlaysWebView({ overlay: false });
  void StatusBar.setBackgroundColor({ color: "#0A0A0A" });
  void StatusBar.setStyle({ style: Style.Dark });

  void CapacitorApp.addListener("backButton", async () => {
    if (window.history.length > 1) {
      router.back();
      return;
    }
    await CapacitorApp.exitApp();
  });
});
