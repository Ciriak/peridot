import { useState } from "#imports";
import type { ServerConnectionStatus } from "../lib/server-connection";

export function useServerConnection() {
  const status = useState<ServerConnectionStatus>(
    "server-connection-status",
    () => "unknown",
  );

  return { status };
}
