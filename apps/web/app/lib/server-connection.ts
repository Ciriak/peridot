import type { HealthResponse } from "@peridot/contracts";

type Fetcher = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Response>;

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

export function serverConnectionLostDescription(serverAddress: string): string {
  return `Peridot cannot reach ${serverAddress}. Check that the server is running and try again.`;
}
