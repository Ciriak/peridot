import type { ServerConnectionStatus } from "../lib/server-connection";
import { computed } from "vue";
import {
  reportServerReachability,
  serverReachability,
} from "../lib/server-connectivity";

export function useServerConnection() {
  const status = computed<ServerConnectionStatus>({
    get() {
      if (serverReachability.value === null) return "unknown";
      return serverReachability.value ? "connected" : "lost";
    },
    set(next) {
      reportServerReachability(next !== "lost");
    },
  });

  return { status };
}
