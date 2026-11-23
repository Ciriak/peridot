import {
  migrateIndexerClients,
  readClientConnections,
} from "../src/download-clients.js";
import { CredentialStore } from "../src/credential-store.js";
import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
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

test("release media types follow standard and explicit categories", () => {
  const xml = `
    <rss xmlns:t="http://torznab.com/schemas/2015/feed">
      <channel>
        <item><title>Audiobook</title><link>/audiobook</link><t:attr name="category" value="3030"/></item>
        <item><title>Music</title><link>/music</link><t:attr name="category" value="3040"/></item>
        <item><title>Podcast</title><link>/podcast</link><category>Audio &gt; Podcasts</category></item>
        <item><title>Named audiobook</title><link>/named-audiobook</link><category>Books &gt; Audiobooks</category><t:attr name="category" value="7000"/></item>
        <item><title>Unknown</title><link>/unknown</link></item>
        <item><title>Movie</title><link>/movie</link><t:attr name="category" value="2000"/></item>
      </channel>
    </rss>
  `;

  assert.deepEqual(
    parseReleases(xml, new URL("http://feed.test")).map((release) => ({
      title: release.title,
      mediaType: release.mediaType,
    })),
    [
      { title: "Audiobook", mediaType: "audiobook" },
      { title: "Music", mediaType: "music" },
      { title: "Podcast", mediaType: "podcast" },
      { title: "Named audiobook", mediaType: "audiobook" },
      { title: "Unknown", mediaType: null },
    ],
  );
});

test("an external release becomes a playable folder track after completion", async (t) => {
  const folder = await realpath(
    await mkdtemp(path.join(os.tmpdir(), "torznab-test-")),
  );
  const upstream = Fastify();
  let tags: string[] = [];
  let adds = 0;
  let done = false;
  upstream.get("/feed", async (req) => {
    if ((req.query as { t: string }).t === "caps")
      return '<caps><searching><music-search available="yes" supportedParams="q,artist"/></searching></caps>';
    assert.equal((req.query as { t: string }).t, "music");
    assert.equal((req.query as { cat: string }).cat, "3000");
    return '<rss xmlns:t="http://torznab.com/schemas/2015/feed"><channel><item><title>Release</title><guid>abc</guid><enclosure length="100" url="/download?secret=hidden"/><t:attr name="seeders" value="4"/><t:attr name="category" value="3040"/></item></channel></rss>';
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
  upstream.get("/api/v2/torrents/categories", async () => ({
    music: { name: "music", savePath: folder },
  }));
  upstream.get("/api/v2/torrents/tags", async () => ["lossless"]);
  upstream.addContentTypeParser(
    "application/x-www-form-urlencoded",
    { parseAs: "string" },
    (_req, body, cb) => cb(null, new URLSearchParams(String(body))),
  );
  upstream.post("/api/v2/torrents/add", async (req) => {
    const form = req.body as URLSearchParams;
    assert.equal(form.get("savepath"), null);
    assert.equal(form.get("autoTMM"), "true");
    assert.equal(form.get("category"), "music");
    assert.ok(form.get("tags")?.split(",").includes("lossless"));
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
    const headers = new Headers(init.headers);
    if (input.pathname.startsWith("/api/v2/")) {
      assert.equal(
        headers.get("authorization"),
        input.host === "second.test"
          ? "Bearer second-secret"
          : "Bearer client-secret",
      );
      assert.equal(headers.has("cookie"), false);
      assert.notEqual(input.pathname, "/api/v2/auth/login");
    } else {
      assert.equal(headers.has("authorization"), false);
    }
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
  const clients = "/api/admin/download-clients";
  const clientInput = {
    kind: "qbittorrent",
    name: "Test downloader",
    url,
    apiKey: "client-secret",
  };
  const saved = await ctx.app.inject({
    method: "POST",
    url: clients,
    headers: ctx.authorization,
    payload: clientInput,
  });
  assert.equal(saved.statusCode, 201, saved.body);
  const downloadClientId = saved.json().id;
  assert.equal(
    (await ctx.app.inject({ url: clients, headers })).statusCode,
    403,
  );
  const listing = await ctx.app.inject({
    url: clients,
    headers: ctx.authorization,
  });
  assert.doesNotMatch(listing.body, /client-secret|credentialCiphertext/);
  assert.equal(listing.json()[0].hasApiKey, true);
  for (const [method, path, address, expected] of [
    ["POST", clients, url, 400],
    ["PUT", clients + "/" + downloadClientId, url, 200],
    ["PUT", clients + "/" + downloadClientId, "http://other.test", 400],
  ] as const) {
    const response = await ctx.app.inject({
      method,
      url: path,
      headers: ctx.authorization,
      payload: { kind: "qbittorrent", name: "Renamed", url: address },
    });
    assert.equal(response.statusCode, expected, response.body);
  }
  const options = await ctx.app.inject({
    url: clients + "/" + downloadClientId + "/options",
    headers: ctx.authorization,
  });
  assert.deepEqual(options.json(), {
    categories: ["music"],
    tags: ["lossless"],
  });
  const secondClient = await ctx.app.inject({
    method: "POST",
    url: clients,
    headers: ctx.authorization,
    payload: {
      ...clientInput,
      name: "Second downloader",
      url: "http://second.test",
      apiKey: "second-secret",
    },
  });
  assert.equal(secondClient.statusCode, 201);
  const secondOptions = await ctx.app.inject({
    url: clients + "/" + secondClient.json().id + "/options",
    headers: ctx.authorization,
  });
  assert.equal(secondOptions.statusCode, 200);
  const input = {
    kind: "torznab",
    name: "Audio indexer",
    url: url + "/feed",
    apiKey: "test-key",
    downloadClientId,
    category: "music",
    tags: "lossless",
    categoryPath: true,
    folderId: folderSource.id,
  };
  for (const host of ["one", "two"]) {
    const added = await ctx.app.inject({
      method: "POST",
      url: "/api/admin/sources",
      headers: ctx.authorization,
      payload: {
        ...input,
        downloadClientId:
          host === "one" ? downloadClientId : secondClient.json().id,
        name: host,
        url: "http://" + host + ".test/feed",
      },
    });
    assert.equal(added.statusCode, 201, added.body);
    assert.doesNotMatch(added.body, /test-key/);
  }
  assert.equal(
    (
      await ctx.app.inject({
        method: "DELETE",
        url: clients + "/" + downloadClientId,
        headers: ctx.authorization,
      })
    ).statusCode,
    409,
  );
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
  assert.equal(release.mediaType, "music");
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
  const tokenResponse = await ctx.app.inject({
    method: "POST",
    url: `/api/tracks/${id}/playback-token`,
    headers,
  });
  assert.equal(tokenResponse.statusCode, 200);
  const playbackToken = tokenResponse.json<{ token: string }>().token;
  const audio = await ctx.app.inject({
    url:
      "/api/tracks/" +
      id +
      "/audio?playbackToken=" +
      encodeURIComponent(playbackToken),
  });
  assert.equal(audio.statusCode, 200, `${id} ${audio.body}`);
});

test("legacy indexers share one migrated client and retain feed credentials after retry", async (t) => {
  const key = Buffer.alloc(32, 17).toString("base64");
  const ctx = await createTestContext({ credentialEncryptionKey: key });
  t.after(() => ctx.close());
  const store = new CredentialStore(key);
  for (const feed of ["one", "two"]) {
    await ctx.database.orm.Source.create({
      kind: "torznab",
      position: 1,
      configuration: JSON.stringify({
        clientUrl: "http://qbit.test/",
        folderId: "music",
      }),
      credentialCiphertext: store.encrypt(
        JSON.stringify({
          feed,
          apiKey: "fixture-key",
          username: "fixture",
          password: "old-password",
        }),
        "source",
      ),
    });
  }
  await migrateIndexerClients(ctx.database, store);
  await migrateIndexerClients(ctx.database, store);
  const clients = await ctx.database.orm.DownloadClient.all();
  assert.equal(clients.length, 1);
  assert.equal(
    store.decrypt(clients[0]!.credentialCiphertext, "source"),
    "old-password",
  );
  assert.equal(
    (await readClientConnections(ctx.database, store)).get(clients[0]!.id)
      ?.username,
    "fixture",
  );
  const clientPath = "/api/admin/download-clients/" + clients[0]!.id;
  const payload = {
    name: "Reconfigured",
    kind: "qbittorrent",
    url: clients[0]!.url,
  };
  let logins = 0;
  let requests = 0;
  t.mock.method(globalThis, "fetch", async (url: URL, init: RequestInit) => {
    const headers = new Headers(init.headers);
    assert.equal(headers.has("authorization"), false);
    if (url.pathname.endsWith("/auth/login")) {
      assert.equal((init.body as URLSearchParams).get("username"), "fixture");
      assert.equal(
        (init.body as URLSearchParams).get("password"),
        "old-password",
      );
      logins++;
      const legacy = logins === 1;
      return new Response(legacy ? "Ok." : null, {
        status: legacy ? 200 : 204,
        headers: {
          "set-cookie":
            (legacy ? "SID" : "QBT_SID_8080") + "=session; HttpOnly",
        },
      });
    }
    requests++;
    if (requests === 2) return new Response("", { status: 403 });
    assert.equal(
      headers.get("cookie"),
      logins === 1 ? "SID=session" : "QBT_SID_8080=session",
    );
    return Response.json(url.pathname.endsWith("/tags") ? [] : {});
  });
  assert.equal(
    (
      await ctx.app.inject({
        url: clientPath + "/options",
        headers: ctx.authorization,
      })
    ).statusCode,
    200,
  );
  assert.equal(logins, 2);
  for (const [body, expected] of [
    [{ ...payload, authType: "password", username: "fixture" }, 200],
    [{ ...payload, authType: "password", username: "changed" }, 400],
    [payload, 400],
    [{ ...payload, apiKey: "new-key" }, 200],
  ] as const) {
    const res = await ctx.app.inject({
      method: "PUT",
      url: clientPath,
      headers: ctx.authorization,
      payload: body,
    });
    assert.equal(res.statusCode, expected, res.body);
  }
  assert.equal(
    (await readClientConnections(ctx.database, store)).get(clients[0]!.id)
      ?.clientApiKey,
    "new-key",
  );
  for (const row of await ctx.database.orm.Source.where({
    kind: "torznab",
  }).all()) {
    assert.deepEqual(JSON.parse(row.configuration!), {
      downloadClientId: clients[0]!.id,
      folderId: "music",
    });
    const secrets = JSON.parse(
      store.decrypt(row.credentialCiphertext!, "source"),
    );
    assert.equal(secrets.apiKey, "fixture-key");
    assert.equal(secrets.password, undefined);
  }
});
