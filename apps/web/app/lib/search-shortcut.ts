export interface SearchShortcutEvent {
  altKey?: boolean;
  ctrlKey: boolean;
  isComposing?: boolean;
  key: string;
  metaKey: boolean;
  shiftKey?: boolean;
}

export type SearchShortcutModifier = "ctrl" | "command";

export function isSearchShortcut(event: SearchShortcutEvent): boolean {
  return (
    !event.altKey &&
    !event.shiftKey &&
    !event.isComposing &&
    event.key.toLowerCase() === "k" &&
    (event.ctrlKey || event.metaKey)
  );
}

export function searchShortcutModifier(
  platform: string,
): SearchShortcutModifier {
  return /mac|iphone|ipad|ipod/i.test(platform) ? "command" : "ctrl";
}
