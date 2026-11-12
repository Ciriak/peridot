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

  assert.equal(config.build.devUrl, "http://127.0.0.1:3000");
  assert.equal(config.build.beforeDevCommand, "pnpm --dir ../.. dev");
  assert.equal(config.build.beforeBuildCommand, "pnpm --dir ../web generate");
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
  assert.deepEqual(capability.permissions, ["core:default"]);
});
