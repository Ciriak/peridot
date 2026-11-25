import assert from "node:assert/strict";
import test from "node:test";
import {
  ConnectorInstanceDiscoveryError,
  discoverConnectorInstances,
} from "../src/connector-instance-discovery.js";
import { createJellyfinIntegration } from "../src/jellyfin/index.js";

test("typed addresses probe both schemes on the connector port and prefer HTTPS", async () => {
  const requested: string[] = [];
  const result = await discoverConnectorInstances(
    "jellyfin",
    {
      defaultPorts: [8096],
      protocols: ["https", "http"],
      async probe(baseUrl) {
        requested.push(baseUrl.toString());
        return {
          id: "server-1",
          label: "Living room",
          version: "10.10.0",
        };
      },
    },
    { address: "192.168.1.5", interfaces: {}, timeoutMs: 50 },
  );

  assert.deepEqual(result, {
    items: [
      {
        kind: "jellyfin",
        id: "server-1",
        label: "Living room",
        url: "https://192.168.1.5:8096",
        version: "10.10.0",
      },
    ],
    scannedSubnets: [],
  });
  assert.deepEqual(requested.sort(), [
    "http://192.168.1.5:8096/",
    "https://192.168.1.5:8096/",
  ]);
});

test("typed explicit ports and reverse-proxy paths are preserved", async () => {
  const requested: string[] = [];
  const result = await discoverConnectorInstances(
    "jellyfin",
    {
      defaultPorts: [8096],
      protocols: ["https", "http"],
      async probe(baseUrl) {
        requested.push(baseUrl.toString());
        return baseUrl.protocol === "https:"
          ? { id: "server-2", label: "Proxy", version: null }
          : null;
      },
    },
    {
      address: "https://jellyfin.example.com:8443/jellyfin",
      interfaces: {},
      timeoutMs: 50,
    },
  );

  assert.deepEqual(requested.sort(), [
    "http://jellyfin.example.com:8443/jellyfin",
    "https://jellyfin.example.com:8443/jellyfin",
  ]);
  assert.equal(
    result.items[0]?.url,
    "https://jellyfin.example.com:8443/jellyfin",
  );
});

test("network discovery is limited to visible private subnets and deduplicates instances", async () => {
  const requested: string[] = [];
  const result = await discoverConnectorInstances(
    "jellyfin",
    {
      defaultPorts: [8096],
      protocols: ["https", "http"],
      async probe(baseUrl) {
        requested.push(baseUrl.toString());
        return baseUrl.hostname === "192.168.50.42"
          ? {
              id: "server-42",
              label: "Server 42",
              version: "10.9.0",
            }
          : null;
      },
    },
    {
      interfaces: {
        lan: [
          {
            address: "192.168.50.10",
            netmask: "255.255.255.0",
            family: "IPv4",
            mac: "00:00:00:00:00:00",
            internal: false,
            cidr: "192.168.50.10/24",
          },
        ],
        public: [
          {
            address: "203.0.113.10",
            netmask: "255.255.255.0",
            family: "IPv4",
            mac: "00:00:00:00:00:00",
            internal: false,
            cidr: "203.0.113.10/24",
          },
        ],
      },
      concurrency: 32,
      timeoutMs: 50,
    },
  );

  assert.deepEqual(result, {
    items: [
      {
        kind: "jellyfin",
        id: "server-42",
        label: "Server 42",
        url: "https://192.168.50.42:8096",
        version: "10.9.0",
      },
    ],
    scannedSubnets: ["192.168.50.0/24"],
  });
  assert.equal(requested.length, 512);
  assert.ok(requested.every((url) => !url.includes("203.0.113.")));
});

test("Jellyfin discovery accepts its public product signature only", async () => {
  const requested: string[] = [];
  const integration = createJellyfinIntegration({
    fetch: async (input) => {
      const url = String(input);
      requested.push(url);
      if (url.startsWith("https://jellyfin.local:8096/")) {
        return Response.json({
          ProductName: "Another media server",
          ServerName: "Impostor",
          Id: "wrong",
        });
      }
      return Response.json({
        ProductName: "Jellyfin Server",
        ServerName: "Jellyfin",
        Version: "10.10.3",
        Id: "jellyfin-id",
      });
    },
  });
  assert.ok(integration.instanceDiscovery);
  const result = await discoverConnectorInstances(
    "jellyfin",
    integration.instanceDiscovery,
    {
      address: "jellyfin.local",
      interfaces: {},
      timeoutMs: 50,
    },
  );

  assert.deepEqual(result.items, [
    {
      kind: "jellyfin",
      id: "jellyfin-id",
      label: "Jellyfin",
      url: "http://jellyfin.local:8096",
      version: "10.10.3",
    },
  ]);
  assert.deepEqual(requested.sort(), [
    "http://jellyfin.local:8096/System/Info/Public",
    "https://jellyfin.local:8096/System/Info/Public",
  ]);
});

test("invalid discovery targets are rejected before probing", async () => {
  let probes = 0;
  await assert.rejects(
    discoverConnectorInstances(
      "jellyfin",
      {
        defaultPorts: [8096],
        protocols: ["https", "http"],
        async probe() {
          probes += 1;
          return null;
        },
      },
      {
        address: "https://user:secret@jellyfin.local",
        interfaces: {},
      },
    ),
    ConnectorInstanceDiscoveryError,
  );
  assert.equal(probes, 0);
});
