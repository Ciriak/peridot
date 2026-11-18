import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  createCatalogCursorSettler,
  isStaleCatalogCursor,
  recoverStaleCatalogCursor,
} from "../app/lib/catalog-cursor-recovery.ts";
import { PeridotApiError } from "../app/lib/peridot-client.ts";

function staleCursorError() {
  return new PeridotApiError(
    "The catalog changed while paging.",
    409,
    "stale_catalog_cursor",
    {
      key: "api.message.staleCatalogCursor",
    },
  );
}

test("only catalog cursor conflicts trigger stale-page recovery", () => {
  assert.equal(isStaleCatalogCursor(staleCursorError()), true);
  assert.equal(
    isStaleCatalogCursor(
      new PeridotApiError(
        "Invalid cursor.",
        400,
        "invalid_catalog_query",
        null,
      ),
    ),
    false,
  );
  assert.equal(isStaleCatalogCursor(new Error("network unavailable")), false);
});

test("stale-page recovery retries from the first page after catalog changes", async () => {
  const failures = [staleCursorError(), staleCursorError(), null];
  let refetches = 0;
  let quietWaits = 0;

  const recovered = await recoverStaleCatalogCursor({
    attempts: 3,
    waitForQuiet: async () => {
      quietWaits += 1;
    },
    refetch: async () => ({
      error: failures[refetches++],
    }),
  });

  assert.equal(recovered, true);
  assert.equal(refetches, 3);
  assert.equal(quietWaits, 3);
});

test("stale-page recovery stops immediately for unrelated request failures", async () => {
  let refetches = 0;
  const recovered = await recoverStaleCatalogCursor({
    waitForQuiet: async () => undefined,
    refetch: async () => {
      refetches += 1;
      return { error: new Error("server unavailable") };
    },
  });

  assert.equal(recovered, true);
  assert.equal(refetches, 1);
});

test("recovery waits for catalog changes to settle before refetching", async () => {
  let now = 0;
  const sleeps: number[] = [];
  const settler = createCatalogCursorSettler(500, {
    now: () => now,
    sleep: async (durationMs) => {
      sleeps.push(durationMs);
      now += durationMs;
      if (sleeps.length === 1) settler.markChanged();
    },
  });

  settler.markChanged();
  await settler.waitForQuiet();

  assert.deepEqual(sleeps, [500, 500]);
});

test("catalog infinite queries recover stale pages without surfacing an error", async () => {
  const catalog = await readFile(
    new URL("../app/composables/use-catalog-query.ts", import.meta.url),
    "utf8",
  );

  assert.match(catalog, /catalogCursorSettler\.markChanged\(\)/);
  assert.match(catalog, /recoverStaleCursor/);
  assert.match(catalog, /isStaleCatalogCursor\(result\.error\)/);
  assert.match(catalog, /recoveringStaleCursor\.value/);
  assert.match(
    catalog,
    /retry: \(failureCount, error\) =>\s*!isStaleCatalogCursor\(error\)/,
  );
});
