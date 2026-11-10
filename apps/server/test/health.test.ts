import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { DEFAULT_SERVER_PORT, loadServerConfig } from "../src/config.js";
import { prepareDevelopmentEnvironment } from "../src/dev-config.js";
import { createTestContext } from "./helpers.js";

test("health endpoint responds without database or external services", async () => {
  const context = await createTestContext();
  try {
    await context.database.$disconnect();
    const response = await context.app.inject({
      method: "GET",
      url: "/api/health",
    });
    assert.equal(response.statusCode, 200);
    assert.deepEqual(response.json(), { status: "ok", service: "peridot" });
    assert.equal((await context.app.inject("/api/missing")).statusCode, 404);
  } finally {
    await context.close();
  }
});

test("server configuration validates storage and browser origins", async () => {
  assert.equal(DEFAULT_SERVER_PORT, 17430);
  const root = await mkdtemp(path.join(tmpdir(), "peridot-config-"));
  const libraryRoot = path.join(root, "music");
  await mkdir(libraryRoot);
  try {
    await assert.rejects(loadServerConfig({}), /DATABASE_URL is required/);
    await assert.rejects(
      loadServerConfig({
        DATABASE_URL: "file:test.db",
        MUSIC_LIBRARY_PATH: libraryRoot,
        PERIDOT_WEB_ORIGINS: "file:///invalid",
      }),
      /HTTP\(S\) origins/,
    );
    const config = await loadServerConfig({
      DATABASE_URL: "file:test.db",
      MUSIC_LIBRARY_PATH: libraryRoot,
      PERIDOT_WEB_ORIGINS: "https://music.example.com",
    });
    assert.equal(config.libraryRoot, libraryRoot);
    assert.deepEqual(config.webOrigins, ["https://music.example.com"]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("development startup prepares local defaults without overriding configuration", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "peridot-dev-config-"));
  const defaultLibrary = path.join(root, "music");
  const customLibrary = path.join(root, "custom-music");
  try {
    const defaults: NodeJS.ProcessEnv = {
      MUSIC_LIBRARY_PATH: defaultLibrary,
    };
    await prepareDevelopmentEnvironment(defaults);
    assert.equal(defaults.DATABASE_URL, "file:./peridot.db");
    assert.equal(defaults.MUSIC_LIBRARY_PATH, defaultLibrary);

    const custom: NodeJS.ProcessEnv = {
      DATABASE_URL: "file:custom.db",
      MUSIC_LIBRARY_PATH: customLibrary,
    };
    await prepareDevelopmentEnvironment(custom);
    assert.equal(custom.DATABASE_URL, "file:custom.db");
    assert.equal(custom.MUSIC_LIBRARY_PATH, customLibrary);

    const { stat } = await import("node:fs/promises");
    assert.equal((await stat(defaultLibrary)).isDirectory(), true);
    assert.equal((await stat(customLibrary)).isDirectory(), true);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
