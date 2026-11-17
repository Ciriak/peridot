import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import Fastify from "fastify";
import { registerWebApplication } from "../src/web-server.js";

test("embedded web application serves static assets and the SPA fallback", async () => {
  const webRoot = await mkdtemp(path.join(tmpdir(), "peridot-web-"));
  await mkdir(path.join(webRoot, "albums"));
  await writeFile(
    path.join(webRoot, "index.html"),
    "<!doctype html><title>Peridot home</title>",
  );
  await writeFile(
    path.join(webRoot, "200.html"),
    "<!doctype html><title>Peridot fallback</title>",
  );
  await writeFile(
    path.join(webRoot, "albums", "index.html"),
    "<!doctype html><title>Peridot albums</title>",
  );
  await writeFile(path.join(webRoot, "asset.txt"), "static asset");

  const app = Fastify({ logger: false });
  app.get("/api/health", async () => ({ status: "ok" }));
  await registerWebApplication(app, { webRoot });

  try {
    const home = await app.inject({ method: "GET", url: "/" });
    assert.equal(home.statusCode, 200);
    assert.match(home.body, /Peridot home/);

    const albums = await app.inject({ method: "GET", url: "/albums/" });
    assert.equal(albums.statusCode, 200);
    assert.match(albums.body, /Peridot albums/);

    const fallback = await app.inject({
      method: "GET",
      url: "/albums/unknown",
    });
    assert.equal(fallback.statusCode, 200);
    assert.match(fallback.body, /Peridot fallback/);

    const asset = await app.inject({ method: "GET", url: "/asset.txt" });
    assert.equal(asset.body, "static asset");

    const health = await app.inject({ method: "GET", url: "/api/health" });
    assert.deepEqual(health.json(), { status: "ok" });

    const missingApi = await app.inject({
      method: "GET",
      url: "/api/missing",
    });
    assert.equal(missingApi.statusCode, 404);
    assert.match(String(missingApi.headers["content-type"]), /json/);
    assert.doesNotMatch(missingApi.body, /<html/);
  } finally {
    await app.close();
    await rm(webRoot, { recursive: true, force: true });
  }
});
