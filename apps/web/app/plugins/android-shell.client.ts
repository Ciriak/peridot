import { App as CapacitorApp } from "@capacitor/app";
import { StatusBar, Style } from "@capacitor/status-bar";
import { defineNuxtPlugin, useRouter } from "#imports";
import { isAndroidRuntime } from "../lib/android-runtime";
import { mobilePlayerNavigationForLaunchUrl } from "../lib/mobile-player-route";

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

  async function openMobilePlayerFromUrl(url: string | null | undefined) {
    await router.isReady();
    const current = router.currentRoute.value;
    const destination = mobilePlayerNavigationForLaunchUrl(url, {
      path: current.path,
      query: current.query,
      layout: current.meta.layout,
    });
    if (destination) await router.push(destination);
  }

  void CapacitorApp.getLaunchUrl()
    .then((launch) => openMobilePlayerFromUrl(launch?.url))
    .catch(() => undefined);
  void CapacitorApp.addListener("appUrlOpen", ({ url }) => {
    void openMobilePlayerFromUrl(url).catch(() => undefined);
  });

  void CapacitorApp.addListener("backButton", async () => {
    if (window.history.length > 1) {
      router.back();
      return;
    }
    await CapacitorApp.exitApp();
  });
});
