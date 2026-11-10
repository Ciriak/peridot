import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("app layout respects the owner's Tailwind and shadcn styling authority", async () => {
  const source = await readFile(
    new URL("../app/app.vue", import.meta.url),
    "utf8",
  );
  assert.doesNotMatch(source, /<style\b/i, "No custom CSS blocks");
  assert.doesNotMatch(source, /\s:?style\s*=/i, "No inline styles");
  assert.doesNotMatch(
    source,
    /[\w-]+-\[[^\]]+\]/,
    "No arbitrary Tailwind values",
  );
  assert.doesNotMatch(
    source,
    /#[\da-f]{3,8}\b|\b(?:rgb|hsl|oklch)\(/i,
    "No local color values",
  );
});
