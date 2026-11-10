import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  createMemberSession,
  createTestContext,
  createWav,
  startScan,
  waitForScan,
} from "./helpers.js";

test("administrators can read server counts and the default source", async () => {
  const context = await createTestContext();
  try {
    const status = await context.app.inject({
      method: "GET",
      url: "/api/admin/server",
      headers: context.authorization,
    });
    assert.equal(status.statusCode, 200);
    assert.deepEqual(status.json(), {
      trackCount: 0,
      availableTrackCount: 0,
    });

    const sources = await context.app.inject({
      method: "GET",
      url: "/api/admin/sources",
      headers: context.authorization,
    });
    assert.equal(sources.statusCode, 200);
    const items = sources.json<{ items: Array<Record<string, unknown>> }>()
      .items;
    assert.equal(items.length, 1);
    assert.equal(items[0]?.kind, "path");
    assert.equal(items[0]?.path, context.libraryRoot);
  } finally {
    await context.close();
  }
});

test("source mutations are allowed by the configured web origin", async () => {
  const context = await createTestContext();
  try {
    for (const method of ["PUT", "DELETE"]) {
      const response = await context.app.inject({
        method: "OPTIONS",
        url: "/api/admin/sources/order",
        headers: {
          origin: "http://127.0.0.1:3000",
          "access-control-request-method": method,
          "access-control-request-headers": "authorization,content-type",
        },
      });

      assert.equal(response.statusCode, 204);
      assert.equal(
        response.headers["access-control-allow-origin"],
        "http://127.0.0.1:3000",
      );
      assert.match(
        String(response.headers["access-control-allow-methods"]),
        new RegExp(`(^|,\\s*)${method}($|,\\s*)`),
      );
    }
  } finally {
    await context.close();
  }
});

test("administrators can add and remove path and url sources", async () => {
  const context = await createTestContext();
  const secondRoot = path.join(context.root, "second");
  try {
    await mkdir(secondRoot);
    const created = await context.app.inject({
      method: "POST",
      url: "/api/admin/sources",
      headers: context.authorization,
      payload: { kind: "path", path: secondRoot },
    });
    assert.equal(created.statusCode, 201);
    assert.equal(created.json().path, secondRoot);

    const url = await context.app.inject({
      method: "POST",
      url: "/api/admin/sources",
      headers: context.authorization,
      payload: { kind: "url", url: "https://example.com/music" },
    });
    assert.equal(url.statusCode, 201);
    assert.equal(url.json().url, "https://example.com/music");

    const list = await context.app.inject({
      method: "GET",
      url: "/api/admin/sources",
      headers: context.authorization,
    });
    assert.equal(list.json<{ items: unknown[] }>().items.length, 3);

    const removed = await context.app.inject({
      method: "DELETE",
      url: `/api/admin/sources/${created.json().id}`,
      headers: context.authorization,
    });
    assert.equal(removed.statusCode, 204);
  } finally {
    await context.close();
  }
});

test("invalid sources are rejected with a clear error", async () => {
  const context = await createTestContext();
  try {
    const payloads = [
      {},
      { kind: "unknown" },
      { kind: "path" },
      { kind: "path", path: "" },
      { kind: "path", path: path.join(context.root, "missing") },
      { kind: "url", url: "not-a-url" },
      { kind: "url", url: "ftp://example.com/music" },
      { kind: "integration" },
    ];
    for (const payload of payloads) {
      const response = await context.app.inject({
        method: "POST",
        url: "/api/admin/sources",
        headers: context.authorization,
        payload,
      });
      assert.equal(response.statusCode, 400);
      assert.equal(response.json().error.code, "invalid_source");
    }
  } finally {
    await context.close();
  }
});

test("duplicate path sources are rejected", async () => {
  const context = await createTestContext();
  try {
    const response = await context.app.inject({
      method: "POST",
      url: "/api/admin/sources",
      headers: context.authorization,
      payload: { kind: "path", path: context.libraryRoot },
    });
    assert.equal(response.statusCode, 400);
    assert.equal(response.json().error.code, "invalid_source");
  } finally {
    await context.close();
  }
});

test("local directory tree returns child folders", async () => {
  const context = await createTestContext();
  const nested = path.join(context.libraryRoot, "Artist", "Album");
  try {
    await mkdir(nested, { recursive: true });
    const response = await context.app.inject({
      method: "GET",
      url: `/api/admin/filesystem/tree?path=${encodeURIComponent(context.libraryRoot)}`,
      headers: context.authorization,
    });
    assert.equal(response.statusCode, 200);
    assert.deepEqual(response.json().items, [
      { name: "Artist", path: path.join(context.libraryRoot, "Artist") },
    ]);
  } finally {
    await context.close();
  }
});

test("filesystem roots are listed when no parent is provided", async () => {
  const context = await createTestContext();
  try {
    const response = await context.app.inject({
      method: "GET",
      url: "/api/admin/filesystem/tree",
      headers: context.authorization,
    });
    assert.equal(response.statusCode, 200);
    assert.ok(response.json().items.length > 0);
    for (const item of response.json().items) {
      assert.equal(typeof item.name, "string");
      assert.equal(typeof item.path, "string");
    }
  } finally {
    await context.close();
  }
});

test("filesystem search finds folders deeply below the selected path", async () => {
  const context = await createTestContext();
  const deepFolder = path.join(
    context.libraryRoot,
    "Artist",
    "Album",
    "Disc 1",
    "Lossless",
    "Deep Music",
  );
  try {
    await mkdir(deepFolder, { recursive: true });
    const response = await context.app.inject({
      method: "GET",
      url:
        `/api/admin/filesystem/search?path=${encodeURIComponent(context.libraryRoot)}` +
        `&query=${encodeURIComponent("deep music")}`,
      headers: context.authorization,
    });

    assert.equal(response.statusCode, 200);
    assert.deepEqual(response.json(), {
      items: [{ name: "Deep Music", path: deepFolder }],
      truncated: false,
    });
  } finally {
    await context.close();
  }
});

test("filesystem search validates its query and caps large result sets", async () => {
  const context = await createTestContext();
  try {
    const invalid = await context.app.inject({
      method: "GET",
      url: "/api/admin/filesystem/search?query=",
      headers: context.authorization,
    });
    assert.equal(invalid.statusCode, 400);
    assert.equal(invalid.json().error.code, "invalid_search");

    const tooLong = await context.app.inject({
      method: "GET",
      url: `/api/admin/filesystem/search?query=${"x".repeat(201)}`,
      headers: context.authorization,
    });
    assert.equal(tooLong.statusCode, 400);
    assert.equal(tooLong.json().error.code, "invalid_search");

    await Promise.all(
      Array.from({ length: 105 }, (_, index) =>
        mkdir(path.join(context.libraryRoot, `Match ${index}`)),
      ),
    );
    const response = await context.app.inject({
      method: "GET",
      url:
        `/api/admin/filesystem/search?path=${encodeURIComponent(context.libraryRoot)}` +
        "&query=match",
      headers: context.authorization,
    });
    const body = response.json<{
      items: Array<{ name: string; path: string }>;
      truncated: boolean;
    }>();

    assert.equal(response.statusCode, 200);
    assert.equal(body.items.length, 100);
    assert.equal(body.truncated, true);
  } finally {
    await context.close();
  }
});

test("administrators can reorder sources", async () => {
  const context = await createTestContext();
  const secondRoot = path.join(context.root, "second");
  try {
    await mkdir(secondRoot);
    await context.app.inject({
      method: "POST",
      url: "/api/admin/sources",
      headers: context.authorization,
      payload: { kind: "path", path: secondRoot },
    });
    await context.app.inject({
      method: "POST",
      url: "/api/admin/sources",
      headers: context.authorization,
      payload: { kind: "url", url: "https://example.com/music" },
    });
    const list = await context.app.inject({
      method: "GET",
      url: "/api/admin/sources",
      headers: context.authorization,
    });
    const ids = list
      .json<{ items: Array<{ id: string }> }>()
      .items.map((source) => source.id);
    const reversed = [...ids].reverse();

    const reorder = await context.app.inject({
      method: "PUT",
      url: "/api/admin/sources/order",
      headers: context.authorization,
      payload: { ids: reversed },
    });
    assert.equal(reorder.statusCode, 200);
    assert.deepEqual(
      reorder
        .json<{ items: Array<{ id: string }> }>()
        .items.map((source) => source.id),
      reversed,
    );
  } finally {
    await context.close();
  }
});

test("a rescan reads all configured path sources", async () => {
  const context = await createTestContext();
  const secondRoot = path.join(context.root, "second");
  try {
    await mkdir(secondRoot);
    await writeFile(path.join(context.libraryRoot, "first.wav"), createWav());
    await writeFile(path.join(secondRoot, "second.wav"), createWav());
    await context.app.inject({
      method: "POST",
      url: "/api/admin/sources",
      headers: context.authorization,
      payload: { kind: "path", path: secondRoot },
    });
    const scan = await startScan(context);
    assert.equal(scan.status, "completed");
    assert.equal(scan.createdCount, 2);
  } finally {
    await context.close();
  }
});

test("source rescans isolate availability changes to the selected source", async () => {
  const context = await createTestContext();
  const secondRoot = path.join(context.root, "second");
  const firstTrack = path.join(context.libraryRoot, "first.wav");
  try {
    await mkdir(secondRoot);
    await writeFile(firstTrack, createWav());
    await writeFile(path.join(secondRoot, "second.wav"), createWav());
    const secondSource = await context.app.inject({
      method: "POST",
      url: "/api/admin/sources",
      headers: context.authorization,
      payload: { kind: "path", path: secondRoot },
    });
    await startScan(context);
    await rm(firstTrack);

    const scoped = await context.app.inject({
      method: "POST",
      url: `/api/admin/sources/${secondSource.json().id}/scans`,
      headers: context.authorization,
    });
    assert.equal(scoped.statusCode, 202);
    assert.equal(scoped.json().sourceId, secondSource.json().id);
    assert.equal(scoped.json().sourceName, "second");
    const scopedScan = await waitForScan(context, scoped.json().id);
    assert.equal(scopedScan.status, "completed");
    assert.equal(scopedScan.unavailableCount, 0);

    const availableAfterSecond = await context.app.inject({
      method: "GET",
      url: "/api/tracks",
      headers: context.authorization,
    });
    assert.equal(availableAfterSecond.json().items.length, 2);

    const firstSource = await context.app.inject({
      method: "GET",
      url: "/api/admin/sources",
      headers: context.authorization,
    });
    const firstSourceId = firstSource
      .json<{
        items: Array<{ id: string; path: string }>;
      }>()
      .items.find((source) => source.path === context.libraryRoot)?.id;
    const firstScoped = await context.app.inject({
      method: "POST",
      url: `/api/admin/sources/${firstSourceId}/scans`,
      headers: context.authorization,
    });
    assert.equal(firstScoped.statusCode, 202);
    await waitForScan(context, firstScoped.json().id);
    const availableAfterFirst = await context.app.inject({
      method: "GET",
      url: "/api/tracks",
      headers: context.authorization,
    });
    assert.equal(availableAfterFirst.json().items.length, 1);
  } finally {
    await context.close();
  }
});

test("only local sources can be rescanned", async () => {
  const context = await createTestContext();
  try {
    const remote = await context.app.inject({
      method: "POST",
      url: "/api/admin/sources",
      headers: context.authorization,
      payload: { kind: "url", url: "https://example.com/music" },
    });
    const response = await context.app.inject({
      method: "POST",
      url: `/api/admin/sources/${remote.json().id}/scans`,
      headers: context.authorization,
    });
    assert.equal(response.statusCode, 400);
    assert.equal(response.json().error.code, "source_not_rescanable");
  } finally {
    await context.close();
  }
});

test("sources require an administrator", async () => {
  const context = await createTestContext();
  const member = await createMemberSession(context);
  try {
    for (const [method, url] of [
      ["GET", "/api/admin/sources"],
      ["POST", "/api/admin/sources"],
      ["POST", "/api/admin/sources/missing/scans"],
      ["GET", "/api/admin/filesystem/search?query=music"],
    ] as const) {
      const memberResponse = await context.app.inject({
        method,
        url,
        headers: member,
      });
      assert.equal(memberResponse.statusCode, 403);

      const anonymousResponse = await context.app.inject({ method, url });
      assert.equal(anonymousResponse.statusCode, 401);
    }
  } finally {
    await context.close();
  }
});
