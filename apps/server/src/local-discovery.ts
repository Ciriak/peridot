import type { NetworkInterfaceInfo } from "node:os";
import type { FastifyInstance } from "fastify";
import {
  discoverConnectorInstances,
  localPrivateSubnetPrefixes,
  privateIpv4Prefix,
} from "./connector-instance-discovery.js";

export const DISCOVERY_PORT = 17430;
export const DISCOVERY_PROTOCOLS = ["http", "https"] as const;

export { localPrivateSubnetPrefixes, privateIpv4Prefix };

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
  const result = await discoverConnectorInstances(
    "peridot",
    {
      defaultPorts: [port],
      protocols: DISCOVERY_PROTOCOLS,
      async probe(baseUrl, signal) {
        const base = baseUrl.toString();
        const healthUrl = new URL(
          "api/health",
          base.endsWith("/") ? base : `${base}/`,
        );
        const response = await fetcher(healthUrl, {
          headers: { accept: "application/json" },
          signal,
        });
        if (!response.ok) return null;
        const body = (await response.json()) as {
          status?: unknown;
          service?: unknown;
        };
        return body.status === "ok" && body.service === "peridot"
          ? {
              id: baseUrl.hostname,
              label: "Peridot",
              version: null,
            }
          : null;
      },
    },
    {
      ...(options.interfaces ? { interfaces: options.interfaces } : {}),
      ...(options.concurrency !== undefined
        ? { concurrency: options.concurrency }
        : {}),
      ...(options.timeoutMs !== undefined
        ? { timeoutMs: options.timeoutMs }
        : {}),
    },
  );
  return {
    items: result.items
      .map(({ url }) => ({
        address: url,
        host: new URL(url).hostname,
      }))
      .sort((left, right) =>
        left.host.localeCompare(right.host, undefined, { numeric: true }),
      ),
    scannedSubnets: result.scannedSubnets,
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
