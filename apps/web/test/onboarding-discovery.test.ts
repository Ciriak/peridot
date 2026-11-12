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
    /:label="t\('onboarding\.looking'\)"/,
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
  assert.match(
    source,
    /\(route\.query\.auth === "login" \|\| route\.query\.auth === "setup"\)/,
    "Lost authentication and first-administrator setup open the account step",
  );
  assert.match(
    source,
    /const step = ref<"server" \| "account">\(/,
    "The sign-in step is selected before the first render",
  );
  assert.match(source, /void connectToServer\(\);/);
  assert.doesNotMatch(source, /No servers found\./);
  assert.doesNotMatch(source, />\s*Continue\s*</);
  assert.doesNotMatch(source, /Scan again/);
});

test("administrator setup collects a display name while sign-in is email-only", async () => {
  const source = await readFile(
    new URL("../app/pages/onboarding.vue", import.meta.url),
    "utf8",
  );

  assert.match(source, /<label for="email"[\s\S]*?t\("onboarding\.email"\)/);
  assert.match(source, /<Input[\s\S]*?id="email"[\s\S]*?type="email"/);
  assert.match(source, /v-if="requiresAdminUser" class="space-y-2"/);
  assert.match(source, /id="display-name"/);
  assert.match(source, /autocomplete="nickname"/);
  assert.match(source, /minlength="2"/);
  assert.match(source, /maxlength="80"/);
  assert.match(
    source,
    /v-if="requiresAdminUser" class="space-y-2"[\s\S]*?id="confirm-password"/,
  );
  assert.match(
    source,
    /id="confirm-password"[\s\S]*?autocomplete="new-password"/,
  );
  assert.match(source, /t\("onboarding\.passwordsMismatch"\)/);
  assert.match(source, /:disabled="loading \|\| Boolean\(confirmationError\)"/);
  assert.match(
    source,
    /requiresAdminUser\.value\s+\? await createAdministrator\([\s\S]*?displayName: displayName\.value/,
  );
  assert.match(
    source,
    /: await createUserSession\([\s\S]*?email: email\.value/,
  );
  assert.doesNotMatch(
    source,
    /Username or email|id="username"|v-model="username"/,
  );
});
