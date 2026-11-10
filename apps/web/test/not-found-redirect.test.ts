import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("the catch-all page replaces unknown routes with the home page", async () => {
  const source = await readFile(
    new URL("../app/pages/[...path].vue", import.meta.url),
    "utf8",
  );

  assert.match(
    source,
    /await navigateTo\("\/", \{ redirectCode: 302, replace: true \}\)/,
  );
});
