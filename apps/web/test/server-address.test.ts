import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULT_SERVER_ADDRESS,
  findPeridotServerAddress,
  normalizeServerAddress,
  safeRedirectPath,
  serverAddressCandidates,
  serverLabel,
} from "../app/lib/server-address.ts";

test("normalizes common self-hosted server addresses", () => {
  assert.equal(DEFAULT_SERVER_ADDRESS, "http://127.0.0.1:17430");
  assert.equal(
    normalizeServerAddress(" 192.168.1.20:3001/ "),
    "http://192.168.1.20:3001",
  );
  assert.equal(
    normalizeServerAddress("https://music.example.com/peridot/"),
    "https://music.example.com/peridot",
  );
  assert.equal(
    serverLabel("https://music.example.com/peridot"),
    "music.example.com/peridot",
  );
});

test("only accepts local application redirect paths", () => {
  assert.equal(safeRedirectPath("/library?genre=jazz"), "/library?genre=jazz");
  assert.equal(safeRedirectPath("//example.com"), "/");
  assert.equal(safeRedirectPath("https://example.com"), "/");
  assert.equal(safeRedirectPath(["/library"]), "/");
});

test("rejects unsafe or incomplete server addresses", () => {
  assert.throws(() => normalizeServerAddress(""), /Enter the address/);
  assert.throws(
    () => normalizeServerAddress("ftp://music.example.com"),
    /HTTP or HTTPS/,
  );
  assert.throws(
    () => normalizeServerAddress("https://user:secret@example.com"),
    /without credentials/,
  );
  assert.throws(
    () => normalizeServerAddress("https://example.com?token=secret"),
    /without credentials/,
  );
});

test("scheme-less addresses probe HTTP and HTTPS on configured Peridot ports", () => {
  assert.deepEqual(serverAddressCandidates("192.168.1.20"), [
    "http://192.168.1.20",
    "https://192.168.1.20",
    "https://192.168.1.20:80",
    "http://192.168.1.20:17430",
    "https://192.168.1.20:17430",
  ]);
  assert.deepEqual(
    serverAddressCandidates("https://music.example.com/peridot"),
    [
      "https://music.example.com/peridot",
      "https://music.example.com:80/peridot",
      "https://music.example.com:17430/peridot",
    ],
  );
  assert.deepEqual(serverAddressCandidates("192.168.1.20:17430"), [
    "http://192.168.1.20:17430",
    "https://192.168.1.20:17430",
  ]);
  assert.deepEqual(serverAddressCandidates("192.168.1.20:80"), [
    "http://192.168.1.20",
    "https://192.168.1.20:80",
  ]);
});

test("manual address probing selects the Peridot port", async () => {
  const requests: string[] = [];
  const found = await findPeridotServerAddress("192.168.1.20", {
    fetcher: async (input) => {
      const url = String(input);
      requests.push(url);
      if (url === "http://192.168.1.20:17430/api/health") {
        return Response.json({ status: "ok", service: "peridot" });
      }
      return new Response(null, { status: 404 });
    },
  });

  assert.equal(found, "http://192.168.1.20:17430");
  assert.deepEqual(requests.sort(), [
    "http://192.168.1.20/api/health",
    "http://192.168.1.20:17430/api/health",
    "https://192.168.1.20/api/health",
    "https://192.168.1.20:17430/api/health",
    "https://192.168.1.20:80/api/health",
  ]);
});

test("same-origin web clients select the origin that served the app", async () => {
  const requests: string[] = [];
  const found = await findPeridotServerAddress("http://192.168.1.5:17430", {
    fetcher: async (input) => {
      requests.push(String(input));
      return Response.json({ status: "ok", service: "peridot" });
    },
  });

  assert.equal(found, "http://192.168.1.5:17430");
  assert.deepEqual(requests, ["http://192.168.1.5:17430/api/health"]);
});

test("scheme-less addresses discover an HTTPS-only server", async () => {
  const found = await findPeridotServerAddress("192.168.1.20", {
    fetcher: async (input) => {
      if (String(input) === "https://192.168.1.20:17430/api/health") {
        return Response.json({ status: "ok", service: "peridot" });
      }
      return new Response(null, { status: 404 });
    },
  });

  assert.equal(found, "https://192.168.1.20:17430");
});

test("manual address probing requires the Peridot health signature", async () => {
  const found = await findPeridotServerAddress("192.168.1.20:17430", {
    fetcher: async () =>
      Response.json({ status: "ok", service: "another-service" }),
  });

  assert.equal(found, null);
});
