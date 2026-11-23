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
  upstream.get(
    "/movies",
    async () =>
      '<caps><searching><search available="yes" supportedParams="q"/></searching><categories><category id="2000"/></categories></caps>',
  );
  upstream.get("/mixed", async (req) => {
    if ((req.query as { t: string }).t === "caps")
      return '<caps><searching><search available="yes" supportedParams="q"/></searching><categories><category id="2000"/><category id="3000"><subcat id="3040"/></category></categories></caps>';
    assert.equal((req.query as { cat: string }).cat, "3000,3040");
    return "<rss><channel><item><title>Film</title><category>2000</category><link>/movie</link></item></channel></rss>";
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
  t.after(async () => {
    await upstream.close();
    await rm(folder, { recursive: true, force: true });
  });
  const ctx = await createTestContext();
  t.after(() => ctx.close());
  const headers = await createMemberSession(ctx);
  const folderSource = await ctx.database.orm.Source.create({
    kind: "path",
    path: folder,
    position: 1,
  });
  const input = {
    kind: "torznab",
    name: "Audio indexer",
    url: url + "/feed",
    apiKey: "test-key",
    clientUrl: url,
    folderId: folderSource.id,
  };
  for (const host of ["one", "two"]) {
    const added = await ctx.app.inject({
      method: "POST",
      url: "/api/admin/sources",
      headers: ctx.authorization,
      payload: { ...input, name: host, url: "http://" + host + ".test/feed" },
    });
    assert.equal(added.statusCode, 201, added.body);
    assert.doesNotMatch(added.body, /test-key/);
  }
  const addFeed = (suffix: string) =>
    ctx.app.inject({
      method: "POST",
      url: "/api/admin/sources",
      headers: ctx.authorization,
      payload: { kind: "torznab", url: url + suffix },
    });
  assert.equal((await addFeed("/movies")).statusCode, 400);
  const mixed = await addFeed("/mixed");
  assert.equal(mixed.statusCode, 201, mixed.body);
  assert.equal(mixed.json().configuration.categories, "3000,3040");
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
  assert.equal(result.json().length, 2);
  const [release, second] = result.json();
  assert.notEqual(release.id, second.id);
  assert.notEqual(release.sourceName, second.sourceName);
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
