import type { HealthResponse } from "@peridot/contracts";
import { reportServerReachability } from "./server-connectivity.ts";

export type ServerConnectionStatus = "unknown" | "connected" | "lost";

type Fetcher = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Response>;

export function serverConnectionRestored(
  previous: ServerConnectionStatus | undefined,
  next: ServerConnectionStatus,
): boolean {
  return previous === "lost" && next === "connected";
}

export async function isPeridotServerReachable(
  serverAddress: string,
  options: { fetcher?: Fetcher; signal?: AbortSignal } = {},
): Promise<boolean> {
  const { fetcher = fetch, signal } = options;
  const address = serverAddress.replace(/\/+$/, "");

  try {
    const response = await fetcher(`${address}/api/health`, {
      headers: { accept: "application/json" },
      signal,
    });
    if (!response.ok) {
      reportServerReachability(false);
      return false;
    }

    const health = (await response.json()) as Partial<HealthResponse>;
    const reachable = health.status === "ok" && health.service === "peridot";
    reportServerReachability(reachable);
    return reachable;
  } catch {
    reportServerReachability(false);
    return false;
  }
}
