import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("server selection is automatic and advances only from a discovered server", async () => {
  const source = await readFile(
    new URL("../app/pages/onboarding.vue", import.meta.url),
    "utf8",
  );
  assert.match(
    source,
    /setTimeout\(\(\) => void scanLocalNetwork\(\), 10_000\)/,
  );
  assert.match(source, /@peridot\/ui\/components\/ui\/spinner/);
  assert.match(source, /label="Scanning for servers"/);
  assert.match(source, /@click="selectDiscoveredServer\(server\)"/);
  assert.doesNotMatch(source, /No servers found\./);
  assert.doesNotMatch(source, />\s*Continue\s*</);
  assert.doesNotMatch(source, /Scan again/);
});
