import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import Fastify from "fastify";
import {
  createTestContext,
  createMemberSession,
  createWav,
} from "./helpers.js";
import { parseReleases } from "../src/torznab.js";

test("rejects DTDs and indexer errors", () => {
  for (const xml of ["<!DOCTYPE rss><rss/>", '<error code="100"/>'])
    assert.throws(() => parseReleases(xml, new URL("http://feed.test")));
});

test("an external release becomes a playable folder track after completion", async (t) => {
  const folder = await mkdtemp(path.join(os.tmpdir(), "torznab-test-"));
  const upstream = Fastify();
  let tags: string[] = [];
  let adds = 0;
  let done = false;
  upstream.get("/feed", async (req) => {
    if ((req.query as { t: string }).t === "caps")
      return '<caps><searching><music-search available="yes" supportedParams="q,artist"/></searching></caps>';
    assert.equal((req.query as { t: string }).t, "music");
    assert.equal((req.query as { cat: string }).cat, "3000");
    return '<rss xmlns:t="http://torznab.com/schemas/2015/feed"><channel><item><title>Release</title><guid>abc</guid><enclosure length="100" url="/download?secret=hidden"/><t:attr name="seeders" value="4"/></item></channel></rss>';
  });
  upstream.addContentTypeParser(
    "application/x-www-form-urlencoded",
    { parseAs: "string" },
    (_req, body, cb) => cb(null, new URLSearchParams(String(body))),
  );
  upstream.post("/api/v2/torrents/add", async (req) => {
    const form = req.body as URLSearchParams;
    assert.equal(form.get("savepath"), folder);
    tags = form.get("tags")!.split(",");
    adds++;
    return "Ok.";
  });
  upstream.get("/api/v2/torrents/info", async (req) =>
    tags.includes((req.query as { tag: string }).tag)
      ? [
          {
            hash: "abc",
            tags: tags.join(", "),
            state: "uploading",
            save_path: folder,
            progress: done ? 1 : 0,
          },
        ]
      : [],
  );
  upstream.get("/api/v2/torrents/files", async () => [
    { name: "song.wav", progress: 1 },
  ]);
  upstream.post("/api/v2/torrents/removeTags", async () => {
    tags = tags.filter((t) => t !== "peridot-import");
    return "";
  });
  const url = "http://fixture.test";
  t.mock.method(globalThis, "fetch", async (input: URL, init: RequestInit) => {
    const response = await upstream.inject({
      url: input.pathname + input.search,
      method: init.method === "POST" ? "POST" : "GET",
      ...(init.body
        ? {
            payload: String(init.body),
            headers: { "content-type": "application/x-www-form-urlencoded" },
          }
        : {}),
    });
    return new Response(response.body, { status: response.statusCode });
  });
  const config = {
    PERIDOT_TORZNAB_URL: url + "/feed",
    PERIDOT_TORZNAB_KEY: "test-key",
    PERIDOT_QBIT_URL: url,
    PERIDOT_IMPORT_FOLDER: folder,
    PERIDOT_QBIT_SAVE_PATH: folder,
  };
  const old = new Map(Object.keys(config).map((k) => [k, process.env[k]]));
  Object.assign(process.env, config);
  t.after(async () => {
    for (const [k, v] of old) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
    await upstream.close();
    await rm(folder, { recursive: true, force: true });
  });
  const ctx = await createTestContext();
  t.after(() => ctx.close());
  const headers = await createMemberSession(ctx);
  await ctx.database.orm.Source.create({
    kind: "path",
    path: folder,
    position: 1,
  });
  const base = "/api/torznab";
  const denied = await ctx.app.inject({
    url: base + "/search?q=test",
  });
  assert.equal(denied.statusCode, 401);
  for (const sessionHeaders of [ctx.authorization, headers]) {
    const config = await ctx.app.inject({ url: base, headers: sessionHeaders });
    assert.deepEqual(config.json(), { enabled: true });
  }
  assert.equal(
    (await ctx.app.inject({ method: "POST", url: base + "/imports/abc" }))
      .statusCode,
    401,
  );
  const result = await ctx.app.inject({
    url: base + "/search?q=test",
    headers,
  });
  assert.equal(result.statusCode, 200);
  assert.doesNotMatch(result.body, /hidden|test-key/);
  const [release] = result.json();
  assert.equal(release.seeders, 4);
  const route = base + "/imports/" + release.id;
  for (let i = 0; i < 2; i++)
    assert.equal(
      (await ctx.app.inject({ method: "POST", url: route, headers }))
        .statusCode,
      202,
    );
  assert.equal(adds, 1);
  await writeFile(path.join(folder, "song.wav"), createWav());
  done = true;
  let id: string | undefined;
  for (let i = 0; i < 50 && !id; i++) {
    await new Promise((r) => setTimeout(r, 500));
    id = (await ctx.app.inject({ url: route, headers })).json().trackIds[0];
  }
  assert.ok(id, "completed audio should be indexed");
  const audio = await ctx.app.inject({
    url: "/api/tracks/" + id + "/audio",
    headers,
  });
  assert.equal(audio.statusCode, 200);
});
