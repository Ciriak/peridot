import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  DEFAULT_SERVER_PORT,
  DESKTOP_WEB_ORIGINS,
  MOBILE_WEB_ORIGINS,
  loadServerConfig,
} from "../src/config.js";
import { prepareDevelopmentEnvironment } from "../src/dev-config.js";
import { createTestContext } from "./helpers.js";

test("health endpoint responds without database or external services", async () => {
  const context = await createTestContext();
  try {
    await context.database.close();
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
    const defaults = await loadServerConfig({
      DATABASE_URL: "file:test.db",
      MUSIC_LIBRARY_PATH: libraryRoot,
    });
    assert.deepEqual(defaults.webOrigins, [
      "http://127.0.0.1:3000",
      "http://localhost:3000",
      ...DESKTOP_WEB_ORIGINS,
      ...MOBILE_WEB_ORIGINS,
    ]);
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
    assert.equal(config.libraryRoot, await realpath(libraryRoot));
    assert.deepEqual(config.webOrigins, [
      "https://music.example.com",
      ...MOBILE_WEB_ORIGINS,
    ]);

    const desktop = await loadServerConfig({
      DATABASE_URL: "file:test.db",
      MUSIC_LIBRARY_PATH: libraryRoot,
      PERIDOT_WEB_ORIGINS: "tauri://localhost",
    });
    assert.deepEqual(desktop.webOrigins, [
      "tauri://localhost",
      ...MOBILE_WEB_ORIGINS,
    ]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("Android WebView origin can call API routes", async () => {
  const context = await createTestContext({
    webOrigins: ["https://music.example.com", "http://localhost"],
  });
  try {
    const response = await context.app.inject({
      method: "OPTIONS",
      url: "/api/auth/status",
      headers: {
        origin: "http://localhost",
        "access-control-request-method": "GET",
      },
    });
    assert.equal(response.statusCode, 204);
    assert.equal(
      response.headers["access-control-allow-origin"],
      "http://localhost",
    );
  } finally {
    await context.close();
  }
});

test("Tauri desktop origins can call API routes", async () => {
  const context = await createTestContext({
    webOrigins: ["http://tauri.localhost"],
  });
  try {
    const response = await context.app.inject({
      method: "OPTIONS",
      url: "/api/auth/status",
      headers: {
        origin: "http://tauri.localhost",
        "access-control-request-method": "GET",
      },
    });
    assert.equal(response.statusCode, 204);
    assert.equal(
      response.headers["access-control-allow-origin"],
      "http://tauri.localhost",
    );
  } finally {
    await context.close();
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
