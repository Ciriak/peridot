import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import Fastify from "fastify";
import websocket from "@fastify/websocket";
import { buildWebServer } from "../src/web-server.js";

test("embedded web server serves the SPA and proxies API and realtime traffic", async () => {
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

  const upstream = Fastify({ logger: false });
  await upstream.register(websocket);
  upstream.get("/api/health", async () => ({ status: "ok" }));
  upstream.get("/api/stream", async (request, reply) => {
    reply.header("Accept-Ranges", "bytes");
    reply.header("Content-Range", "bytes 1-3/4");
    return request.method === "HEAD" ? null : "abc";
  });
  upstream.get("/api/realtime", { websocket: true }, (socket) => {
    socket.on("message", (message) => socket.send(`echo:${message}`));
  });
  await upstream.listen({ host: "127.0.0.1", port: 0 });
  const address = upstream.server.address();
  assert.ok(address && typeof address !== "string");

  const web = await buildWebServer({
    apiBaseUrl: `http://127.0.0.1:${address.port}`,
    webRoot,
    logger: false,
  });
  await web.listen({ host: "127.0.0.1", port: 0 });
  const webAddress = web.server.address();
  assert.ok(webAddress && typeof webAddress !== "string");
  const baseUrl = `http://127.0.0.1:${webAddress.port}`;

  try {
    const home = await fetch(`${baseUrl}/`);
    assert.equal(home.status, 200);
    assert.match(await home.text(), /Peridot home/);

    const albums = await fetch(`${baseUrl}/albums/`);
    assert.equal(albums.status, 200);
    assert.match(await albums.text(), /Peridot albums/);

    const fallback = await fetch(`${baseUrl}/albums/unknown`);
    assert.equal(fallback.status, 200);
    assert.match(await fallback.text(), /Peridot fallback/);

    const asset = await fetch(`${baseUrl}/asset.txt`);
    assert.equal(await asset.text(), "static asset");

    const health = await fetch(`${baseUrl}/api/health`);
    assert.deepEqual(await health.json(), { status: "ok" });

    const missingApi = await fetch(`${baseUrl}/api/missing`);
    assert.equal(missingApi.status, 404);
    assert.match(missingApi.headers.get("content-type") ?? "", /json/);
    assert.equal((await missingApi.text()).includes("<html"), false);

    const head = await fetch(`${baseUrl}/api/stream`, { method: "HEAD" });
    assert.equal(head.status, 200);
    assert.equal(head.headers.get("accept-ranges"), "bytes");
    assert.equal(head.headers.get("content-range"), "bytes 1-3/4");

    const socket = new WebSocket(
      `${baseUrl.replace(/^http/, "ws")}/api/realtime`,
    );
    const reply = await new Promise<string>((resolve, reject) => {
      socket.addEventListener("open", () => socket.send("hello"));
      socket.addEventListener("message", (event) =>
        resolve(String(event.data)),
      );
      socket.addEventListener("error", () => reject(new Error("socket error")));
      setTimeout(() => reject(new Error("socket timeout")), 3_000).unref();
    });
    socket.close();
    assert.equal(reply, "echo:hello");
  } finally {
    await web.close();
    await upstream.close();
    await rm(webRoot, { recursive: true, force: true });
  }
});
