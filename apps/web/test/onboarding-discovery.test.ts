import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("server selection prioritizes discovery and reveals manual entry on demand", async () => {
  const source = await readFile(
    new URL("../app/pages/onboarding.vue", import.meta.url),
    "utf8",
  );
  assert.match(
    source,
    /setTimeout\(\(\) => void scanLocalNetwork\(\), 10_000\)/,
  );
  assert.match(source, /@peridot\/ui\/components\/ui\/spinner/);
  assert.match(source, /import \{ PeridotSpinner \}/);
  assert.match(
    source,
    /label="Looking for a server on this network"/,
    "The shared spinner announces the active network search",
  );
  assert.doesNotMatch(source, /v-if="discoveryState === 'scanning'"/);
  assert.match(source, /v-if="discoveredServers.length"/);
  assert.match(source, /v-for="server in discoveredServers"/);
  assert.match(source, /@click="selectDiscoveredServer\(server\)"/);
  assert.match(source, /v-if="!manualEntryOpen"/);
  assert.match(source, /@click="revealManualEntry"/);
  assert.match(source, /aria-controls="manual-server-entry"/);
  assert.match(source, /<div v-else id="manual-server-entry"/);
  assert.match(source, /id="server-address"/);
  assert.doesNotMatch(source, /No servers found\./);
  assert.doesNotMatch(source, />\s*Continue\s*</);
  assert.doesNotMatch(source, /Scan again/);
});
