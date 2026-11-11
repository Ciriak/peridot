import type { HealthResponse } from "@peridot/contracts";

export type ServerConnectionStatus = "unknown" | "connected" | "lost";
export type TopbarStatus = "connection-lost" | "task-progress" | "idle";

type Fetcher = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Response>;

export function topbarStatus(
  connectionStatus: ServerConnectionStatus,
  hasActiveTasks: boolean,
): TopbarStatus {
  if (connectionStatus === "lost") return "connection-lost";
  if (hasActiveTasks) return "task-progress";
  return "idle";
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
    if (!response.ok) return false;

    const health = (await response.json()) as Partial<HealthResponse>;
    return health.status === "ok" && health.service === "peridot";
  } catch {
    return false;
  }
}
