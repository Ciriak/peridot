import { relaunch } from "@tauri-apps/plugin-process";
import { check, type Update } from "@tauri-apps/plugin-updater";
import { defineNuxtPlugin, useState } from "#imports";
import { watch } from "vue";
import { isTauriRuntime } from "../lib/desktop-runtime";

const SIX_HOURS_MS = 6 * 60 * 60 * 1000;
const INITIAL_CHECK_DELAY_MS = 30_000;

export default defineNuxtPlugin(() => {
  if (!isTauriRuntime()) return;
  const playing = useState("player-playing", () => false);
  let pendingUpdate: Update | null = null;
  let checking = false;
  let installing = false;

  async function installWhenIdle() {
    if (!pendingUpdate || installing || playing.value) return;
    installing = true;
    try {
      await pendingUpdate.downloadAndInstall();
      await relaunch();
    } catch {
      installing = false;
    }
  }

  async function checkForUpdate() {
    if (checking) return;
    checking = true;
    try {
      pendingUpdate = await check();
      await installWhenIdle();
    } catch {
      // Client updates remain silent and retry on the next check.
    } finally {
      checking = false;
    }
  }

  setTimeout(() => void checkForUpdate(), INITIAL_CHECK_DELAY_MS);
  setInterval(() => {
    void checkForUpdate();
  }, SIX_HOURS_MS);
  watch(playing, (isPlaying) => {
    if (!isPlaying) void installWhenIdle();
  });
});
