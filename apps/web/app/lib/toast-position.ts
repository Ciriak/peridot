const PLAYER_VIEWPORT_CLASS =
  "fixed inset-x-4 bottom-52 z-50 flex w-auto flex-col gap-2 p-0 md:inset-x-auto md:bottom-32 md:right-6 md:w-96";

const FULLSCREEN_VIEWPORT_CLASS =
  "fixed inset-x-4 bottom-6 z-50 flex w-auto flex-col gap-2 p-0 md:inset-x-auto md:bottom-6 md:right-6 md:w-96";

export function toastViewportClass(layout: unknown): string {
  return layout === undefined || layout === "default"
    ? PLAYER_VIEWPORT_CLASS
    : FULLSCREEN_VIEWPORT_CLASS;
}
