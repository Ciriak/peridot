import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  androidManifestAssetUrl,
  compareClientVersions,
  parseAndroidWebUpdateManifest,
  shouldInstallAndroidWebUpdate,
} from "../app/lib/client-updates.ts";

const manifest = {
  version: "0.0.12",
  url: "https://github.com/Ciriak/peridot/releases/download/client-dev/android-web.zip",
  checksum: "signed-checksum",
  sessionKey: "encrypted-session-key",
  minimumNativeVersion: "0.0.3",
};

test("client update versions follow Semantic Version ordering", () => {
  assert.equal(compareClientVersions("0.0.4", "0.0.3"), 1);
  assert.equal(compareClientVersions("v0.0.3", "0.0.3"), 0);
  assert.equal(compareClientVersions("0.0.3-dev.2", "0.0.3-dev.1"), 1);
  assert.equal(compareClientVersions("0.0.3", "0.0.3-dev.2"), 1);
  assert.equal(compareClientVersions("invalid", "0.0.3"), null);
});

test("Android web manifests require GitHub assets and signed metadata", () => {
  assert.deepEqual(parseAndroidWebUpdateManifest(manifest), manifest);
  assert.equal(
    parseAndroidWebUpdateManifest({
      ...manifest,
      url: "https://example.com/update.zip",
    }),
    null,
  );
  assert.equal(
    parseAndroidWebUpdateManifest({ ...manifest, checksum: "" }),
    null,
  );
});

test("Android update manifests are read through anonymous GitHub APIs", () => {
  assert.equal(
    androidManifestAssetUrl({
      assets: [
        {
          name: "android-web-manifest.json",
          url: "https://api.github.com/repos/Ciriak/peridot/releases/assets/123",
        },
      ],
    }),
    "https://api.github.com/repos/Ciriak/peridot/releases/assets/123",
  );
  assert.equal(
    androidManifestAssetUrl({
      assets: [
        {
          name: "android-web-manifest.json",
          url: "https://example.com/releases/assets/123",
        },
      ],
    }),
    null,
  );
});

test("Android web updates require newer compatible bundles", () => {
  assert.equal(
    shouldInstallAndroidWebUpdate("0.0.11", "0.0.3", manifest),
    true,
  );
  assert.equal(
    shouldInstallAndroidWebUpdate("0.0.12", "0.0.3", manifest),
    false,
  );
  assert.equal(
    shouldInstallAndroidWebUpdate("0.0.11", "0.0.2", manifest),
    false,
  );
});

test("client updater loaders remain silent", async () => {
  const [androidUpdater, desktopUpdater] = await Promise.all([
    readFile(
      new URL("../app/plugins/android-web-updater.client.ts", import.meta.url),
      "utf8",
    ),
    readFile(
      new URL("../app/plugins/desktop-updater.client.ts", import.meta.url),
      "utf8",
    ),
  ]);
  for (const source of [androidUpdater, desktopUpdater]) {
    assert.doesNotMatch(
      source,
      /toast|new Notification|Notification\.permission|role="status"/i,
    );
  }
  assert.match(androidUpdater, /CapacitorUpdater\.notifyAppReady\(\)/);
  assert.match(androidUpdater, /CapacitorUpdater\.next\(/);
  assert.match(desktopUpdater, /downloadAndInstall\(\)/);
});

test("CI publishes signed Android and desktop update artifacts", async () => {
  const workflow = await readFile(
    new URL("../../../.github/workflows/ci.yml", import.meta.url),
    "utf8",
  );
  assert.match(workflow, /package-android-web:/);
  assert.match(workflow, /android-web-update/);
  assert.match(workflow, /publish-desktop:/);
  assert.match(workflow, /target: darwin-universal\s+runner: macos-15/);
  assert.doesNotMatch(workflow, /runner: macos-14\b/);
  assert.match(workflow, /desktop-updater-manifest\.mjs/);
  assert.match(workflow, /declare -A uploaded/);
  assert.match(workflow, /uploaded\[\$name\]=1/);
  assert.match(workflow, /client-\$\{channel\}/);
  assert.match(workflow, /channel=beta/);
  assert.match(workflow, /type=raw,value=beta/);
  assert.doesNotMatch(workflow, /type=ref,event=branch/);
  assert.match(
    workflow,
    /NUXT_PUBLIC_SENTRY_DSN: \$\{\{ secrets\.NUXT_PUBLIC_SENTRY_DSN \}\}/,
  );
  assert.match(
    workflow,
    /SENTRY_AUTH_TOKEN: \$\{\{ secrets\.SENTRY_AUTH_TOKEN \}\}/,
  );
  assert.match(
    workflow,
    /sentry_auth_token=\$\{\{ secrets\.SENTRY_AUTH_TOKEN \}\}/,
  );
});
