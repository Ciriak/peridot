import assert from "node:assert/strict";
import test from "node:test";
import {
  createQbittorrentInstanceDiscovery,
  QBITTORRENT_DEFAULT_PORT,
} from "../src/qbittorrent-discovery.js";
import { discoverConnectorInstances } from "../src/connector-instance-discovery.js";

const LOGIN_PAGE = `<!doctype html>
<html>
  <head>
    <meta name="description" content="qBittorrent WebUI">
    <title>qBittorrent WebUI</title>
  </head>
</html>`;

const LEGACY_LOGIN_PAGE = `<!DOCTYPE html>
<html>
  <head>
    <title>qBittorrent QBT_TR(Web UI)QBT_TR[CONTEXT=OptionsDialog]</title>
    <link rel="icon" href="images/qbittorrent32.png" />
  </head>
</html>`;

test("qBittorrent discovery uses the official Web UI metadata and prefers HTTPS", async () => {
  const requested: string[] = [];
  const result = await discoverConnectorInstances(
    "qbittorrent",
    createQbittorrentInstanceDiscovery(async (input) => {
      requested.push(String(input));
      return new Response(LOGIN_PAGE, {
        headers: { "content-type": "text/html; charset=UTF-8" },
      });
    }),
    {
      address: "192.168.1.8",
      interfaces: {},
      timeoutMs: 50,
    },
  );

  assert.equal(QBITTORRENT_DEFAULT_PORT, 8080);
  assert.deepEqual(result, {
    items: [
      {
        kind: "qbittorrent",
        id: "192.168.1.8:8080/",
        label: "qBittorrent",
        url: "https://192.168.1.8:8080",
        version: null,
      },
    ],
    scannedSubnets: [],
  });
  assert.deepEqual(requested.sort(), [
    "http://192.168.1.8:8080/",
    "https://192.168.1.8:8080/",
  ]);
});

test("qBittorrent discovery rejects unrelated or unauthenticated API responses", async () => {
  const discovery = createQbittorrentInstanceDiscovery(async (input) => {
    const url = new URL(String(input));
    if (url.protocol === "https:") {
      return new Response("<title>Another application</title>", {
        headers: { "content-type": "text/html" },
      });
    }
    return new Response("Forbidden", {
      status: 403,
      headers: { "content-type": "text/plain" },
    });
  });
  const result = await discoverConnectorInstances("qbittorrent", discovery, {
    address: "qbittorrent.local",
    interfaces: {},
    timeoutMs: 50,
  });

  assert.deepEqual(result.items, []);
});

test("qBittorrent discovery supports the older localized Web UI shell", async () => {
  const discovery = createQbittorrentInstanceDiscovery(
    async () =>
      new Response(LEGACY_LOGIN_PAGE, {
        headers: { "content-type": "text/html" },
      }),
  );
  const result = await discoverConnectorInstances("qbittorrent", discovery, {
    address: "qbit.local:8080",
    interfaces: {},
    timeoutMs: 50,
  });

  assert.equal(result.items[0]?.url, "https://qbit.local:8080");
  assert.equal(result.items[0]?.label, "qBittorrent");
});
