import assert from "node:assert/strict";
import test from "node:test";
import {
  createAdministrator,
  createSource,
  createUserSession,
  deleteSource,
  discoverLocalServers,
  fetchAuthStatus,
  fetchLogs,
  fetchServerSettings,
  getLibraryScan,
  listDirectories,
  listSources,
  reorderSources,
  searchDirectories,
  startLibraryScan,
} from "../app/lib/peridot-client.ts";

test("onboarding reads setup status and creates the first administrator", async (context) => {
  const requests: Array<{ input: string; init?: RequestInit }> = [];
  const originalFetch = globalThis.fetch;
  context.after(() => {
    globalThis.fetch = originalFetch;
  });
  globalThis.fetch = async (input, init) => {
    requests.push({ input: String(input), init });
    const body = init?.body
      ? JSON.parse(String(init.body))
      : { requiresAdminUser: true };
    return Response.json(
      init?.body
        ? {
            token: "session-token",
            expiresAt: "2026-12-10T00:00:00.000Z",
            user: {
              id: "user-1",
              email: body.email,
              username: body.username,
              role: "admin",
            },
          }
        : body,
      { status: init?.body ? 201 : 200 },
    );
  };

  assert.deepEqual(await fetchAuthStatus("http://127.0.0.1:17430"), {
    requiresAdminUser: true,
  });
  const session = await createAdministrator("http://127.0.0.1:17430", {
    email: "owner@example.com",
    username: "owner",
    password: "a-secure-local-password",
  });
  assert.equal(session.user.role, "admin");
  assert.equal(requests[0]?.input, "http://127.0.0.1:17430/api/auth/status");
  assert.equal(requests[1]?.input, "http://127.0.0.1:17430/api/auth/bootstrap");
});

test("sign-in surfaces safe API errors and unreachable servers", async (context) => {
  const originalFetch = globalThis.fetch;
  context.after(() => {
    globalThis.fetch = originalFetch;
  });
  globalThis.fetch = async () =>
    Response.json(
      { error: { code: "invalid_credentials", message: "Incorrect login" } },
      { status: 401 },
    );
  await assert.rejects(
    createUserSession("http://127.0.0.1:17430", {
      identifier: "owner",
      password: "wrong-password",
    }),
    /Incorrect login/,
  );

  globalThis.fetch = async () => {
    throw new Error("network detail that must not escape");
  };
  await assert.rejects(
    fetchAuthStatus("http://127.0.0.1:17430"),
    /Could not reach this Peridot server/,
  );
});

test("local discovery reads the same-origin discovery endpoint", async (context) => {
  const originalFetch = globalThis.fetch;
  context.after(() => {
    globalThis.fetch = originalFetch;
  });
  globalThis.fetch = async (input) => {
    assert.equal(String(input), "/api/discovery/servers");
    return Response.json({
      items: [{ address: "http://192.168.1.8:17430", host: "192.168.1.8" }],
      scannedSubnets: ["192.168.1.0/24"],
    });
  };
  assert.deepEqual(await discoverLocalServers(), {
    items: [{ address: "http://192.168.1.8:17430", host: "192.168.1.8" }],
    scannedSubnets: ["192.168.1.0/24"],
  });
});

test("log polling reads from the admin logs endpoint", async (context) => {
  const originalFetch = globalThis.fetch;
  context.after(() => {
    globalThis.fetch = originalFetch;
  });
  let seen = "";
  globalThis.fetch = async (input, init) => {
    seen = String(input);
    const headers = init?.headers as Record<string, string> | undefined;
    assert.equal(headers?.Authorization, "Bearer s");
    return Response.json({
      items: [
        {
          id: 3,
          time: "2026-11-10T10:00:00.000Z",
          level: "info",
          message: "hello",
        },
      ],
    });
  };
  const result = await fetchLogs("http://127.0.0.1:17430", "s", 2);
  assert.equal(seen, "http://127.0.0.1:17430/api/admin/logs?after=2");
  assert.equal(result.items[0]?.message, "hello");
});

test("authenticated admin calls send the bearer token and expected bodies", async (context) => {
  const originalFetch = globalThis.fetch;
  context.after(() => {
    globalThis.fetch = originalFetch;
  });
  const requests: Array<{ input: string; init?: RequestInit }> = [];
  globalThis.fetch = async (input, init) => {
    requests.push({ input: String(input), init });
    const url = String(input);
    if (init?.method === "POST" && url.endsWith("/api/library/scans")) {
      return Response.json({ id: "scan-1", status: "queued" }, { status: 202 });
    }
    if (url.includes("/api/library/scans/")) {
      return Response.json({ id: "scan-1", status: "completed" });
    }
    if (init?.method === "POST" && url.endsWith("/api/admin/sources")) {
      return Response.json(
        {
          id: "src-1",
          kind: "path",
          name: null,
          path: "/music",
          url: null,
          integration: null,
        },
        { status: 201 },
      );
    }
    if (init?.method === "DELETE") {
      return new Response(null, { status: 204 });
    }
    if (init?.method === "PUT" && url.endsWith("/api/admin/sources/order")) {
      return Response.json({ items: [] });
    }
    if (url.includes("/api/admin/filesystem/tree")) {
      return Response.json({
        items: [{ name: "Artist", path: "/music/Artist" }],
      });
    }
    if (url.includes("/api/admin/filesystem/search")) {
      return Response.json({
        items: [{ name: "Deep Music", path: "/music/A/B/Deep Music" }],
        truncated: false,
      });
    }
    if (url.endsWith("/api/admin/sources")) {
      return Response.json({ items: [] });
    }
    return Response.json({
      trackCount: 2,
      availableTrackCount: 1,
    });
  };

  assert.deepEqual(await fetchServerSettings("http://127.0.0.1:17430", "s"), {
    trackCount: 2,
    availableTrackCount: 1,
  });
  assert.deepEqual(await listSources("http://127.0.0.1:17430", "s"), {
    items: [],
  });
  assert.equal(
    (
      await createSource("http://127.0.0.1:17430", "s", {
        kind: "path",
        path: "/music",
      })
    ).id,
    "src-1",
  );
  assert.deepEqual(
    await reorderSources("http://127.0.0.1:17430", "s", ["src-1"]),
    { items: [] },
  );
  assert.equal(
    (await listDirectories("http://127.0.0.1:17430", "s", "/music")).items
      .length,
    1,
  );
  assert.deepEqual(
    await searchDirectories("http://127.0.0.1:17430", "s", "Deep Music"),
    {
      items: [{ name: "Deep Music", path: "/music/A/B/Deep Music" }],
      truncated: false,
    },
  );
  await deleteSource("http://127.0.0.1:17430", "s", "src-1");
  assert.equal(
    (await startLibraryScan("http://127.0.0.1:17430", "s")).status,
    "queued",
  );
  assert.equal(
    (await getLibraryScan("http://127.0.0.1:17430", "s", "scan-1")).status,
    "completed",
  );

  assert.deepEqual(
    requests.map((request) => request.input),
    [
      "http://127.0.0.1:17430/api/admin/server",
      "http://127.0.0.1:17430/api/admin/sources",
      "http://127.0.0.1:17430/api/admin/sources",
      "http://127.0.0.1:17430/api/admin/sources/order",
      "http://127.0.0.1:17430/api/admin/filesystem/tree?path=%2Fmusic",
      "http://127.0.0.1:17430/api/admin/filesystem/search?query=Deep+Music",
      "http://127.0.0.1:17430/api/admin/sources/src-1",
      "http://127.0.0.1:17430/api/library/scans",
      "http://127.0.0.1:17430/api/library/scans/scan-1",
    ],
  );
  for (const request of requests) {
    const headers = request.init?.headers as Record<string, string> | undefined;
    assert.equal(headers?.Authorization, "Bearer s");
  }
  assert.equal(requests[2]?.init?.method, "POST");
  assert.equal(requests[3]?.init?.method, "PUT");
  assert.equal(requests[6]?.init?.method, "DELETE");
});
