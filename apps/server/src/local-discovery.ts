import {
  networkInterfaces,
  type NetworkInterfaceInfo,
  type NetworkInterfaceInfoIPv4,
} from "node:os";
import type { FastifyInstance } from "fastify";

export const DISCOVERY_PORT = 17430;
export const DISCOVERY_PROTOCOLS = ["http", "https"] as const;

type InterfaceMap = NodeJS.Dict<NetworkInterfaceInfo[]>;
type DiscoveryFetch = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>;

export interface DiscoveredServer {
  address: string;
  host: string;
}

export interface DiscoveryResult {
  items: DiscoveredServer[];
  scannedSubnets: string[];
}

export function privateIpv4Prefix(address: string): string | null {
  const octets = address.split(".").map(Number);
  if (
    octets.length !== 4 ||
    octets.some((octet) => !Number.isInteger(octet) || octet < 0 || octet > 255)
  ) {
    return null;
  }
  const [first, second, third] = octets as [number, number, number, number];
  const isPrivate =
    first === 10 ||
    (first === 172 && second >= 16 && second <= 31) ||
    (first === 192 && second === 168);
  return isPrivate ? `${first}.${second}.${third}` : null;
}

export function localPrivateSubnetPrefixes(
  interfaces: InterfaceMap = networkInterfaces(),
): string[] {
  const prefixes = Object.values(interfaces)
    .flatMap((entries) => entries ?? [])
    .filter(
      (entry): entry is NetworkInterfaceInfoIPv4 =>
        entry.family === "IPv4" && !entry.internal,
    )
    .map((entry) => privateIpv4Prefix(entry.address))
    .filter((prefix): prefix is string => Boolean(prefix));
  return [...new Set(prefixes)]
    .sort((left, right) => subnetRank(left) - subnetRank(right))
    .slice(0, 3);
}

function subnetRank(prefix: string): number {
  if (prefix.startsWith("192.168.")) return 0;
  if (prefix.startsWith("10.")) return 1;
  return 2;
}

export async function discoverLocalPeridotServers(
  options: {
    fetcher?: DiscoveryFetch;
    interfaces?: InterfaceMap;
    port?: number;
    concurrency?: number;
    timeoutMs?: number;
  } = {},
): Promise<DiscoveryResult> {
  const fetcher = options.fetcher ?? fetch;
  const port =
    Number.isInteger(options.port) &&
    (options.port ?? 0) > 0 &&
    (options.port ?? 0) <= 65_535
      ? (options.port as number)
      : DISCOVERY_PORT;
  const prefixes = localPrivateSubnetPrefixes(options.interfaces);
  const hosts = [
    "127.0.0.1",
    ...prefixes.flatMap((prefix) =>
      Array.from({ length: 254 }, (_, index) => `${prefix}.${index + 1}`),
    ),
  ];
  const targets = hosts.flatMap((host) =>
    DISCOVERY_PROTOCOLS.map((protocol) => ({
      address: `${protocol}://${host}:${port}`,
      host,
      protocol,
    })),
  );
  const foundByHost = new Map<
    string,
    {
      address: string;
      host: string;
      protocol: (typeof DISCOVERY_PROTOCOLS)[number];
    }
  >();
  let cursor = 0;

  async function worker() {
    while (cursor < targets.length) {
      const target = targets[cursor++];
      if (!target) continue;
      try {
        const response = await fetcher(`${target.address}/api/health`, {
          headers: { accept: "application/json" },
          signal: AbortSignal.timeout(options.timeoutMs ?? 350),
        });
        if (!response.ok) continue;
        const body = (await response.json()) as {
          status?: unknown;
          service?: unknown;
        };
        if (body.status === "ok" && body.service === "peridot") {
          const existing = foundByHost.get(target.host);
          if (
            !existing ||
            DISCOVERY_PROTOCOLS.indexOf(target.protocol) <
              DISCOVERY_PROTOCOLS.indexOf(existing.protocol)
          ) {
            foundByHost.set(target.host, target);
          }
        }
      } catch {
        // Unreachable hosts are expected during local network discovery.
      }
    }
  }

  await Promise.all(
    Array.from(
      { length: Math.min(options.concurrency ?? 64, targets.length) },
      () => worker(),
    ),
  );
  return {
    items: [...foundByHost.values()]
      .map(({ address, host }) => ({ address, host }))
      .sort((left, right) =>
        left.host.localeCompare(right.host, undefined, { numeric: true }),
      ),
    scannedSubnets: prefixes.map((prefix) => `${prefix}.0/24`),
  };
}

let cachedDiscovery: Promise<DiscoveryResult> | null = null;
let cacheExpiresAt = 0;

export async function registerLocalDiscoveryRoute(app: FastifyInstance) {
  app.get("/api/discovery/servers", async (_request, reply) => {
    reply.header("cache-control", "no-store");
    if (!cachedDiscovery || Date.now() >= cacheExpiresAt) {
      cachedDiscovery = discoverLocalPeridotServers();
      cacheExpiresAt = Date.now() + 10_000;
      cachedDiscovery.catch(() => {
        cachedDiscovery = null;
        cacheExpiresAt = 0;
      });
    }
    return cachedDiscovery;
  });
}
