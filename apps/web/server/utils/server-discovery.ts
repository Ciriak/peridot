import {
  networkInterfaces,
  type NetworkInterfaceInfo,
  type NetworkInterfaceInfoIPv4,
} from "node:os";

export const DISCOVERY_PORTS = [17431, 17430] as const;
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
    ports?: readonly number[];
    concurrency?: number;
    timeoutMs?: number;
  } = {},
): Promise<DiscoveryResult> {
  const fetcher = options.fetcher ?? fetch;
  const ports = [
    ...new Set(
      (options.ports ?? DISCOVERY_PORTS).filter(
        (port) => Number.isInteger(port) && port > 0 && port <= 65_535,
      ),
    ),
  ];
  const prefixes = localPrivateSubnetPrefixes(options.interfaces);
  const hosts = [
    "127.0.0.1",
    ...prefixes.flatMap((prefix) =>
      Array.from({ length: 254 }, (_, index) => `${prefix}.${index + 1}`),
    ),
  ];
  const targets = hosts.flatMap((host) =>
    ports.flatMap((port) =>
      DISCOVERY_PROTOCOLS.map((protocol) => ({
        address: `${protocol}://${host}:${port}`,
        host,
        port,
        protocol,
      })),
    ),
  );
  const foundByHost = new Map<
    string,
    {
      address: string;
      host: string;
      port: number;
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
            ports.indexOf(target.port) < ports.indexOf(existing.port) ||
            (target.port === existing.port &&
              DISCOVERY_PROTOCOLS.indexOf(target.protocol) <
                DISCOVERY_PROTOCOLS.indexOf(existing.protocol))
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
