import { CapacitorUpdater } from "@capgo/capacitor-updater";
import { App as CapacitorApp } from "@capacitor/app";
import { defineNuxtPlugin, useRuntimeConfig } from "#imports";
import { isAndroidRuntime } from "../lib/android-runtime";
import {
  androidManifestAssetUrl,
  parseAndroidWebUpdateManifest,
  shouldInstallAndroidWebUpdate,
} from "../lib/client-updates";

const SIX_HOURS_MS = 6 * 60 * 60 * 1000;
const INITIAL_CHECK_DELAY_MS = 15_000;

export default defineNuxtPlugin(() => {
  if (!isAndroidRuntime()) return;
  const runtimeConfig = useRuntimeConfig();
  const releaseApiUrl = runtimeConfig.public.androidWebReleaseApiUrl.trim();

  void CapacitorUpdater.notifyAppReady().catch(() => undefined);
  if (!releaseApiUrl) return;

  let running = false;
  let timer: ReturnType<typeof setTimeout> | undefined;

  async function checkForUpdate() {
    if (running || !navigator.onLine) return;
    running = true;
    try {
      const [current, releaseResponse] = await Promise.all([
        CapacitorUpdater.current(),
        fetch(releaseApiUrl, {
          cache: "no-store",
          headers: {
            Accept: "application/vnd.github+json",
          },
        }),
      ]);
      if (!releaseResponse.ok) return;
      const manifestAssetUrl = androidManifestAssetUrl(
        await releaseResponse.json().catch(() => null),
      );
      if (!manifestAssetUrl) return;
      const manifestResponse = await fetch(manifestAssetUrl, {
        cache: "no-store",
        headers: {
          Accept: "application/octet-stream",
        },
      });
      if (!manifestResponse.ok) return;
      const manifest = parseAndroidWebUpdateManifest(
        await manifestResponse.json().catch(() => null),
      );
      if (
        !manifest ||
        !shouldInstallAndroidWebUpdate(
          current.bundle.version,
          current.native,
          manifest,
        )
      ) {
        return;
      }
      const bundle = await CapacitorUpdater.download({
        url: manifest.url,
        version: manifest.version,
        checksum: manifest.checksum,
        sessionKey: manifest.sessionKey,
      });
      await CapacitorUpdater.next({ id: bundle.id });
    } catch {
      // Client updates remain silent; the current bundle stays active.
    } finally {
      running = false;
    }
  }

  function schedule(delayMs: number) {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = undefined;
      void checkForUpdate();
      schedule(SIX_HOURS_MS);
    }, delayMs);
  }

  schedule(INITIAL_CHECK_DELAY_MS);
  window.addEventListener("online", () => void checkForUpdate());
  void CapacitorApp.addListener("appStateChange", ({ isActive }) => {
    if (isActive) void checkForUpdate();
  });
});
