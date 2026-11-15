import { localizedError } from "./messages.ts";

export const DEFAULT_SERVER_PORT = 17431;
export const DEFAULT_SERVER_ADDRESS = `http://127.0.0.1:${DEFAULT_SERVER_PORT}`;
export const FALLBACK_SERVER_PORTS = [17431, 17430] as const;

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

function hasExplicitPort(address: string): boolean {
  const trimmed = address.trim();
  const candidate = /^[a-z][a-z\d+.-]*:\/\//i.test(trimmed)
    ? trimmed
    : `http://${trimmed}`;
  const authority = /^[a-z][a-z\d+.-]*:\/\/([^/?#]+)/i.exec(candidate)?.[1];
  if (!authority) return false;
  return authority.startsWith("[")
    ? /^\[[^\]]+\]:\d+$/.test(authority)
    : /:\d+$/.test(authority);
}

export function serverAddressCandidates(value: string): string[] {
  const normalized = normalizeServerAddress(value);
  if (hasExplicitPort(value)) return [normalized];

  const url = new URL(normalized);
  const candidates = [normalized];
  for (const port of FALLBACK_SERVER_PORTS) {
    const candidate = new URL(url);
    candidate.port = String(port);
    candidates.push(candidate.toString().replace(/\/$/, ""));
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
