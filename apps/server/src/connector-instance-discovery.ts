import {
  networkInterfaces,
  type NetworkInterfaceInfo,
  type NetworkInterfaceInfoIPv4,
} from "node:os";
import type { ConnectorInstanceResponse } from "@peridot/contracts";

export type ConnectorProbeProtocol = "http" | "https";

export interface ConnectorInstanceProbeResult {
  id: string;
  label: string;
  version: string | null;
}

export interface ConnectorInstanceDiscoveryCapability {
  readonly defaultPorts: readonly number[];
  readonly protocols: readonly ConnectorProbeProtocol[];
  probe(
    baseUrl: URL,
    signal: AbortSignal,
  ): Promise<ConnectorInstanceProbeResult | null>;
}

interface AddressHint {
  url: URL;
  explicitPort: number | null;
}

interface DiscoveryCandidate {
  address: string;
  rank: number;
}

type InterfaceMap = NodeJS.Dict<NetworkInterfaceInfo[]>;

const DISCOVERY_CONCURRENCY = 64;
const DISCOVERY_TIMEOUT_MS = 350;
const PRIVATE_HOST_COUNT = 254;
const MAX_PRIVATE_SUBNETS = 3;

export class ConnectorInstanceDiscoveryError extends Error {
  readonly statusCode = 400;

  constructor(message: string) {
    super(message);
    this.name = "ConnectorInstanceDiscoveryError";
  }
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
    .slice(0, MAX_PRIVATE_SUBNETS);
}

function subnetRank(prefix: string): number {
  if (prefix.startsWith("192.168.")) return 0;
  if (prefix.startsWith("10.")) return 1;
  return 2;
}

function addressHint(value: string): AddressHint | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const candidate = /^[a-z][a-z\d+.-]*:\/\//i.test(trimmed)
    ? trimmed
    : `http://${trimmed}`;
  let url: URL;
  try {
    url = new URL(candidate);
  } catch {
    throw new ConnectorInstanceDiscoveryError(
      "Enter a valid host, IP address, or URL to scan.",
    );
  }
  if (
    !["http:", "https:"].includes(url.protocol) ||
    !url.hostname ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  ) {
    throw new ConnectorInstanceDiscoveryError(
      "Enter a host, IP address, or HTTP URL without credentials or parameters.",
    );
  }
  const authority = /^[a-z][a-z\d+.-]*:\/\/([^/?#]+)/i.exec(candidate)?.[1];
  const explicitPort = authority?.startsWith("[")
    ? /^\[[^\]]+\]:(\d+)$/.exec(authority)?.[1]
    : /:(\d+)$/.exec(authority ?? "")?.[1];
  const parsedPort = explicitPort ? Number(explicitPort) : null;
  if (
    parsedPort !== null &&
    (!Number.isInteger(parsedPort) || parsedPort < 1 || parsedPort > 65_535)
  ) {
    throw new ConnectorInstanceDiscoveryError(
      "Enter a valid network port to scan.",
    );
  }
  url.pathname = url.pathname.replace(/\/+$/, "") || "/";
  return { url, explicitPort: parsedPort };
}

function configuredPorts(values: readonly number[]): number[] {
  return [
    ...new Set(
      values.filter(
        (port) => Number.isInteger(port) && port >= 1 && port <= 65_535,
      ),
    ),
  ];
}

function configuredProtocols(
  values: readonly ConnectorProbeProtocol[],
): ConnectorProbeProtocol[] {
  return [...new Set(values)];
}

function candidateAddress(
  hint: AddressHint,
  protocol: ConnectorProbeProtocol,
  port: number,
): string {
  const candidate = new URL(hint.url.toString());
  candidate.protocol = `${protocol}:`;
  candidate.port = String(port);
  return candidate.toString().replace(/\/$/, "");
}

function discoveryCandidates(
  hint: AddressHint | null,
  ports: readonly number[],
  protocols: readonly ConnectorProbeProtocol[],
  interfaces: InterfaceMap | undefined,
): {
  candidates: DiscoveryCandidate[];
  scannedSubnets: string[];
} {
  const candidates: DiscoveryCandidate[] = [];
  const addresses = new Set<string>();
  const append = (address: string) => {
    if (addresses.has(address)) return;
    addresses.add(address);
    candidates.push({ address, rank: candidates.length });
  };

  if (hint) {
    for (const protocol of protocols) {
      for (const port of ports) {
        append(candidateAddress(hint, protocol, port));
      }
    }
    return { candidates, scannedSubnets: [] };
  }

  const prefixes = localPrivateSubnetPrefixes(interfaces);
  const hosts = [
    "localhost",
    "127.0.0.1",
    ...prefixes.flatMap((prefix) =>
      Array.from(
        { length: PRIVATE_HOST_COUNT },
        (_, index) => `${prefix}.${index + 1}`,
      ),
    ),
  ];
  for (const host of hosts) {
    for (const protocol of protocols) {
      for (const port of ports) {
        const url = new URL("http://localhost");
        url.protocol = `${protocol}:`;
        url.hostname = host;
        url.port = String(port);
        append(url.toString().replace(/\/$/, ""));
      }
    }
  }
  return {
    candidates,
    scannedSubnets: prefixes.map((prefix) => `${prefix}.0/24`),
  };
}

function probeSignal(timeoutMs: number, parent?: AbortSignal): AbortSignal {
  const timeout = AbortSignal.timeout(timeoutMs);
  return parent ? AbortSignal.any([parent, timeout]) : timeout;
}

function validTimeout(value: number | undefined): number {
  return value !== undefined &&
    Number.isFinite(value) &&
    value > 0 &&
    value <= 30_000
    ? value
    : DISCOVERY_TIMEOUT_MS;
}

export async function discoverConnectorInstances(
  kind: string,
  capability: ConnectorInstanceDiscoveryCapability,
  options: {
    address?: string | null;
    interfaces?: InterfaceMap;
    concurrency?: number;
    timeoutMs?: number;
    signal?: AbortSignal;
  } = {},
): Promise<{
  items: ConnectorInstanceResponse[];
  scannedSubnets: string[];
}> {
  const ports = configuredPorts(capability.defaultPorts);
  const protocols = configuredProtocols(capability.protocols);
  if (!ports.length || !protocols.length) {
    throw new ConnectorInstanceDiscoveryError(
      "Instance discovery is not configured for this connector.",
    );
  }

  const hint = addressHint(options.address ?? "");
  const targetPorts = hint?.explicitPort ? [hint.explicitPort] : ports;
  const { candidates, scannedSubnets } = discoveryCandidates(
    hint,
    targetPorts,
    protocols,
    options.interfaces,
  );
  const found: Array<
    ConnectorInstanceResponse & {
      rank: number;
      identity: string;
    }
  > = [];
  let cursor = 0;

  async function worker() {
    while (cursor < candidates.length) {
      if (options.signal?.aborted) return;
      const candidate = candidates[cursor++];
      if (!candidate) continue;
      try {
        const result = await capability.probe(
          new URL(candidate.address),
          probeSignal(validTimeout(options.timeoutMs), options.signal),
        );
        if (!result) continue;
        const id = result.id.trim() || candidate.address;
        const label = result.label.trim() || kind;
        found.push({
          kind,
          id,
          label,
          url: candidate.address,
          version: result.version?.trim() || null,
          rank: candidate.rank,
          identity: id,
        });
      } catch {
        // Unreachable or incorrect services are expected during discovery.
      }
    }
  }

  const concurrency = Math.max(
    1,
    Math.min(options.concurrency ?? DISCOVERY_CONCURRENCY, candidates.length),
  );
  await Promise.all(Array.from({ length: concurrency }, () => worker()));

  const unique = new Map<
    string,
    ConnectorInstanceResponse & { rank: number }
  >();
  for (const item of found.sort((left, right) => left.rank - right.rank)) {
    if (!unique.has(item.identity)) {
      unique.set(item.identity, {
        kind: item.kind,
        id: item.id,
        label: item.label,
        url: item.url,
        version: item.version,
        rank: item.rank,
      });
    }
  }
  return {
    items: [...unique.values()]
      .sort((left, right) =>
        left.label.localeCompare(right.label, undefined, {
          numeric: true,
        }),
      )
      .map((item) => ({
        kind: item.kind,
        id: item.id,
        label: item.label,
        url: item.url,
        version: item.version,
      })),
    scannedSubnets,
  };
}
