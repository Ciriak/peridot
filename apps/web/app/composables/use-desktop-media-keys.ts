import type { Ref } from "vue";
import { onBeforeUnmount, watch } from "vue";
import { isTauriRuntime } from "../lib/desktop-runtime";
import { desktopMediaKeyAction } from "../lib/desktop-media-keys";

const MEDIA_SHORTCUTS = [
  "MediaPlayPause",
  "MediaTrackNext",
  "MediaTrackPrevious",
] as const;

export interface DesktopMediaPlayer {
  currentTrackId: Readonly<Ref<string | null>>;
  next: () => void;
  previous: () => void;
  togglePlayback: () => void;
}

export function useDesktopMediaKeys(player: DesktopMediaPlayer) {
  if (!isTauriRuntime()) return;

  let registered = false;
  let syncTail = Promise.resolve();

  function handleShortcut(event: {
    shortcut: string;
    state: "Pressed" | "Released";
  }) {
    switch (desktopMediaKeyAction(event)) {
      case "playPause":
        player.togglePlayback();
        break;
      case "next":
        player.next();
        break;
      case "previous":
        player.previous();
        break;
    }
  }

  function synchronizeRegistration(hasActiveTrack: boolean) {
    syncTail = syncTail
      .catch(() => undefined)
      .then(async () => {
        if (hasActiveTrack === registered) return;
        const { register, unregister } =
          await import("@tauri-apps/plugin-global-shortcut");
        if (hasActiveTrack) {
          await unregister([...MEDIA_SHORTCUTS]).catch(() => undefined);
          await register([...MEDIA_SHORTCUTS], handleShortcut);
        } else {
          await unregister([...MEDIA_SHORTCUTS]);
        }
        registered = hasActiveTrack;
      })
      .catch((reason: unknown) => {
        console.warn("Peridot could not update desktop media keys.", reason);
      });
  }

  watch(() => Boolean(player.currentTrackId.value), synchronizeRegistration, {
    immediate: true,
  });

  onBeforeUnmount(() => {
    synchronizeRegistration(false);
  });
}
