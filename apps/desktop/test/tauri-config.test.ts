import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";

const desktopRoot = path.resolve(import.meta.dirname, "..");

async function readJson<T>(relativePath: string): Promise<T> {
  return JSON.parse(
    await readFile(path.join(desktopRoot, relativePath), "utf8"),
  ) as T;
}

test("Tauri embeds the generated Nuxt client and uses the development stack", async () => {
  const config = await readJson<{
    build: {
      beforeDevCommand: string;
      beforeBuildCommand: string;
      devUrl: string;
      frontendDist: string;
    };
  }>("src-tauri/tauri.conf.json");

  assert.equal(config.build.devUrl, "http://127.0.0.1");
  assert.equal(config.build.beforeDevCommand, "pnpm --dir ../.. dev");
  assert.equal(
    config.build.beforeBuildCommand,
    "pnpm --dir ../../packages/contracts build && pnpm --dir ../web generate",
  );
  assert.equal(config.build.frontendDist, "../../web/.output/public");
});

test("desktop window keeps a restricted capability surface", async () => {
  const config = await readJson<{
    productName: string;
    identifier: string;
    app: {
      windows: Array<{
        label: string;
        title: string;
        width: number;
        height: number;
        minWidth: number;
        minHeight: number;
        backgroundColor: [number, number, number, number];
      }>;
      security: { csp: string };
    };
  }>("src-tauri/tauri.conf.json");
  const capability = await readJson<{
    windows: string[];
    permissions: string[];
  }>("src-tauri/capabilities/default.json");

  assert.equal(config.productName, "Peridot");
  assert.equal(config.identifier, "app.peridot.desktop");
  assert.deepEqual(config.app.windows, [
    {
      label: "main",
      title: "Peridot",
      width: 1280,
      height: 800,
      minWidth: 900,
      minHeight: 600,
      backgroundColor: [0, 0, 0, 255],
    },
  ]);
  assert.match(config.app.security.csp, /default-src 'self'/);
  assert.match(config.app.security.csp, /connect-src [^;]*https:/);
  assert.equal(capability.identifier, "default");
  assert.equal(
    capability.description,
    "Core capability for the Peridot main window",
  );
  assert.deepEqual(capability.windows, ["main"]);
  assert.deepEqual(capability.permissions, [
    "core:default",
    "global-shortcut:allow-register",
    "global-shortcut:allow-unregister",
    "updater:default",
    "process:allow-restart",
  ]);
});

test("Tauri uses the public signed updater channel", async () => {
  const [config, cargo, source] = await Promise.all([
    readJson<{
      bundle: { createUpdaterArtifacts: boolean };
      plugins: {
        updater: {
          pubkey: string;
          endpoints: string[];
        };
      };
    }>("src-tauri/tauri.conf.json"),
    readFile(path.join(desktopRoot, "src-tauri/Cargo.toml"), "utf8"),
    readFile(path.join(desktopRoot, "src-tauri/src/lib.rs"), "utf8"),
  ]);
  assert.equal(config.bundle.createUpdaterArtifacts, true);
  assert.ok(config.plugins.updater.pubkey.length > 20);
  assert.deepEqual(config.plugins.updater.endpoints, [
    "https://github.com/Ciriak/peridot/releases/latest/download/latest.json",
  ]);
  assert.match(cargo, /tauri-plugin-updater = "2\.14\.1"/);
  assert.match(cargo, /tauri-plugin-process = "2\.4\.0"/);
  assert.match(source, /tauri_plugin_updater::Builder::new\(\)\.build\(\)/);
  assert.match(source, /tauri_plugin_process::init\(\)/);
  assert.doesNotMatch(source, /github.*token|oauth/i);
});

test("Tauri hosts native media-key shortcuts through the official plugin", async () => {
  const [cargo, source] = await Promise.all([
    readFile(path.join(desktopRoot, "src-tauri/Cargo.toml"), "utf8"),
    readFile(path.join(desktopRoot, "src-tauri/src/lib.rs"), "utf8"),
  ]);

  assert.match(cargo, /tauri-plugin-global-shortcut = "2\.4\.1"/);
  assert.match(
    source,
    /tauri_plugin_global_shortcut::Builder::new\(\)\.build\(\)/,
  );
  assert.match(source, /MediaPlayPause/);
  assert.match(source, /MediaTrackNext/);
  assert.match(source, /MediaTrackPrevious/);
});

test("browser media session complements the desktop-only native shortcuts", async () => {
  const [app, session, actions] = await Promise.all([
    readFile(path.join(desktopRoot, "../web/app/app.vue"), "utf8"),
    readFile(
      path.join(desktopRoot, "../web/app/composables/use-web-media-session.ts"),
      "utf8",
    ),
    readFile(
      path.join(desktopRoot, "../web/app/lib/web-media-session.ts"),
      "utf8",
    ),
  ]);

  assert.match(app, /useWebMediaSession\(player\)/);
  assert.match(session, /isTauriRuntime\(\)/);
  assert.match(session, /navigator\.mediaSession/);
  assert.match(session, /MediaMetadata/);
  assert.match(actions, /"previoustrack"/);
  assert.match(actions, /"nexttrack"/);
});
