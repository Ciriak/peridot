import { localizedError } from "./messages.ts";

export const DEFAULT_SERVER_PORT = 17431;
export const DEFAULT_SERVER_ADDRESS = `http://127.0.0.1:${DEFAULT_SERVER_PORT}`;
export const FALLBACK_SERVER_PORTS = [17431, 17430] as const;
const SERVER_PROTOCOLS = ["http", "https"] as const;

type ServerProbeFetcher = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Response>;

export function normalizeServerAddress(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    throw localizedError(
      "error.serverAddressRequired",
      "Enter the address of your server.",
    );
  }
  const candidate = /^[a-z][a-z\d+.-]*:\/\//i.test(trimmed)
    ? trimmed
    : `http://${trimmed}`;
  let url: URL;
  try {
    url = new URL(candidate);
  } catch {
    throw localizedError(
      "error.serverAddressInvalid",
      "Enter a valid server address.",
    );
  }
  if (!["http:", "https:"].includes(url.protocol) || !url.hostname) {
    throw localizedError(
      "error.serverAddressScheme",
      "The server address must use HTTP or HTTPS.",
    );
  }
  if (url.username || url.password || url.search || url.hash) {
    throw localizedError(
      "error.serverAddressCredentials",
      "Use the server address without credentials or parameters.",
    );
  }
  url.pathname = url.pathname.replace(/\/+$/, "");
  return url.toString().replace(/\/$/, "");
}

function hasExplicitScheme(address: string): boolean {
  return /^[a-z][a-z\d+.-]*:\/\//i.test(address.trim());
}

function explicitServerPort(address: string): number | null {
  const trimmed = address.trim();
  const candidate = hasExplicitScheme(trimmed)
    ? trimmed
    : `http://${trimmed}`;
  const authority = /^[a-z][a-z\d+.-]*:\/\/([^/?#]+)/i.exec(candidate)?.[1];
  if (!authority) return null;
  const port = authority.startsWith("[")
    ? /^\[[^\]]+\]:(\d+)$/.exec(authority)?.[1]
    : /:(\d+)$/.exec(authority)?.[1];
  return port ? Number(port) : null;
}

export function serverAddressCandidates(value: string): string[] {
  const normalized = normalizeServerAddress(value);
  const url = new URL(normalized);
  const protocols = hasExplicitScheme(value)
    ? [url.protocol.slice(0, -1)]
    : SERVER_PROTOCOLS;
  const configuredPort = explicitServerPort(value);
  const ports = configuredPort
    ? [configuredPort]
    : [null, ...FALLBACK_SERVER_PORTS];
  const candidates = ports.flatMap((port) =>
    protocols.map((protocol) => {
      const candidate = new URL(url);
      candidate.protocol = `${protocol}:`;
      candidate.port = port === null ? "" : String(port);
      return candidate.toString().replace(/\/$/, "");
    }),
  );
  if (
    hasExplicitScheme(value) &&
    configuredPort !== null &&
    candidates.length === 1
  ) {
    return [normalized];
  }
  return [...new Set(candidates)];
}

export async function findPeridotServerAddress(
  value: string,
  options: {
    fetcher?: ServerProbeFetcher;
    timeoutMs?: number;
  } = {},
): Promise<string | null> {
  const candidates = serverAddressCandidates(value);
  const fetcher = options.fetcher ?? fetch;
  const matches = await Promise.all(
    candidates.map(async (address) => {
      try {
        const response = await fetcher(`${address}/api/health`, {
          headers: { accept: "application/json" },
          signal: AbortSignal.timeout(options.timeoutMs ?? 1_500),
        });
        if (!response.ok) return false;
        const body = (await response.json()) as {
          status?: unknown;
          service?: unknown;
        };
        return body.status === "ok" && body.service === "peridot";
      } catch {
        return false;
      }
    }),
  );
  const matchIndex = matches.findIndex(Boolean);
  return matchIndex === -1 ? null : (candidates[matchIndex] ?? null);
}

export function serverLabel(address: string): string {
  try {
    const url = new URL(address);
    return `${url.host}${url.pathname === "/" ? "" : url.pathname}`;
  } catch {
    return address;
  }
}

export function safeRedirectPath(value: unknown): string {
  return typeof value === "string" &&
    value.startsWith("/") &&
    !value.startsWith("//")
    ? value
    : "/";
}
