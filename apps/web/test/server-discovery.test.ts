import assert from "node:assert/strict";
import test from "node:test";
import {
  discoverLocalPeridotServers,
  localPrivateSubnetPrefixes,
  privateIpv4Prefix,
} from "../server/utils/server-discovery.ts";

const interfaceEntry = (address: string, internal = false) =>
  ({
    address,
    netmask: "255.255.255.0",
    family: "IPv4",
    mac: "00:00:00:00:00:00",
    internal,
    cidr: `${address}/24`,
  }) as const;

test("discovery limits scans to private IPv4 interface subnets", () => {
  assert.equal(privateIpv4Prefix("192.168.20.4"), "192.168.20");
  assert.equal(privateIpv4Prefix("10.42.7.9"), "10.42.7");
  assert.equal(privateIpv4Prefix("172.31.8.2"), "172.31.8");
  assert.equal(privateIpv4Prefix("172.32.8.2"), null);
  assert.equal(privateIpv4Prefix("203.0.113.5"), null);
  assert.deepEqual(
    localPrivateSubnetPrefixes({
      public: [interfaceEntry("203.0.113.5")],
      loopback: [interfaceEntry("127.0.0.1", true)],
      lan: [
        interfaceEntry("10.0.0.8"),
        interfaceEntry("192.168.20.4"),
        interfaceEntry("192.168.20.5"),
      ],
    }),
    ["192.168.20", "10.0.0"],
  );
});

test("discovery only returns hosts with the Peridot health signature", async () => {
  const requested: string[] = [];
  const result = await discoverLocalPeridotServers({
    interfaces: { lan: [interfaceEntry("192.168.50.10")] },
    concurrency: 16,
    fetcher: async (input) => {
      const url = String(input);
      requested.push(url);
      if (url === "http://192.168.50.42:17431/api/health") {
        return Response.json({ status: "ok", service: "peridot" });
      }
      if (url === "http://192.168.50.42:17430/api/health") {
        return Response.json({ status: "ok", service: "peridot" });
      }
      if (url === "http://192.168.50.43:17430/api/health") {
        return Response.json({ status: "ok", service: "peridot" });
      }
      if (url === "http://192.168.50.44:17431/api/health") {
        return Response.json({ status: "ok", service: "another-service" });
      }
      if (url === "https://192.168.50.45:17431/api/health") {
        return Response.json({ status: "ok", service: "peridot" });
      }
      return new Response(null, { status: 404 });
    },
  });

  assert.deepEqual(result, {
    items: [
      {
        address: "http://192.168.50.42:17431",
        host: "192.168.50.42",
      },
      {
        address: "http://192.168.50.43:17430",
        host: "192.168.50.43",
      },
      {
        address: "https://192.168.50.45:17431",
        host: "192.168.50.45",
      },
    ],
    scannedSubnets: ["192.168.50.0/24"],
  });
  assert.equal(requested.length, 1020);
  assert.ok(requested.includes("http://127.0.0.1:17431/api/health"));
  assert.ok(requested.includes("https://127.0.0.1:17431/api/health"));
  assert.ok(requested.includes("http://127.0.0.1:17430/api/health"));
  assert.ok(requested.includes("https://127.0.0.1:17430/api/health"));
});
