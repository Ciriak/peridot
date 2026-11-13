export interface DesktopMediaShortcutEvent {
  shortcut: string;
  state: "Pressed" | "Released";
}

export type DesktopMediaKeyAction = "playPause" | "next" | "previous";

export function desktopMediaKeyAction(
  event: DesktopMediaShortcutEvent,
): DesktopMediaKeyAction | null {
  if (event.state !== "Pressed") return null;

  switch (event.shortcut.toLowerCase().replaceAll("_", "")) {
    case "mediaplaypause":
      return "playPause";
    case "mediatracknext":
      return "next";
    case "mediatrackprevious":
      return "previous";
    default:
      return null;
  }
}
