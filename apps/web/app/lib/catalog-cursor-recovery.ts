import { PeridotApiError } from "./peridot-client.ts";

export const CATALOG_CURSOR_QUIET_MS = 500;
export const CATALOG_CURSOR_RECOVERY_ATTEMPTS = 3;

export function isStaleCatalogCursor(
  reason: unknown,
): reason is PeridotApiError {
  return (
    reason instanceof PeridotApiError &&
    reason.statusCode === 409 &&
    reason.code === "stale_catalog_cursor"
  );
}

interface CatalogCursorClock {
  now: () => number;
  sleep: (durationMs: number) => Promise<void>;
}

const systemClock: CatalogCursorClock = {
  now: Date.now,
  sleep: (durationMs) =>
    new Promise((resolve) => setTimeout(resolve, durationMs)),
};

export function createCatalogCursorSettler(
  quietMs = CATALOG_CURSOR_QUIET_MS,
  clock = systemClock,
) {
  let lastChangeAt = Number.NEGATIVE_INFINITY;

  return {
    markChanged(at = clock.now()) {
      lastChangeAt = Math.max(lastChangeAt, at);
    },
    async waitForQuiet() {
      while (true) {
        const remaining = quietMs - (clock.now() - lastChangeAt);
        if (remaining <= 0) return;
        await clock.sleep(remaining);
      }
    },
  };
}

export const catalogCursorSettler = createCatalogCursorSettler();

export async function recoverStaleCatalogCursor(options: {
  refetch: () => Promise<{ error: unknown }>;
  waitForQuiet: () => Promise<void>;
  attempts?: number;
}): Promise<boolean> {
  const attempts = options.attempts ?? CATALOG_CURSOR_RECOVERY_ATTEMPTS;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    await options.waitForQuiet();
    try {
      const result = await options.refetch();
      if (!isStaleCatalogCursor(result.error)) return true;
    } catch (reason) {
      if (!isStaleCatalogCursor(reason)) return true;
    }
  }
  return false;
}
