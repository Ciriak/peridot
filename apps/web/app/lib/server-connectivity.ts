import { shallowRef } from "vue";

export const SERVER_OFFLINE_COOLDOWN_MS = 5_000;

export const serverReachability = shallowRef<boolean | null>(null);

type ReachabilityListener = (reachable: boolean) => void;
const listeners = new Set<ReachabilityListener>();
let offlineTimer: ReturnType<typeof setTimeout> | undefined;

function publishReachability(reachable: boolean) {
  if (serverReachability.value === reachable) return;
  serverReachability.value = reachable;
  for (const listener of listeners) listener(reachable);
}

function clearOfflineTransition() {
  if (offlineTimer === undefined) return;
  clearTimeout(offlineTimer);
  offlineTimer = undefined;
}

export function reportServerReachability(reachable: boolean) {
  if (reachable) {
    clearOfflineTransition();
    publishReachability(true);
    return;
  }

  if (serverReachability.value === false || offlineTimer !== undefined) return;

  offlineTimer = setTimeout(() => {
    offlineTimer = undefined;
    publishReachability(false);
  }, SERVER_OFFLINE_COOLDOWN_MS);
  (offlineTimer as { unref?: () => void }).unref?.();
}

export function resetServerReachability() {
  clearOfflineTransition();
  serverReachability.value = null;
}

export function subscribeServerReachability(
  listener: ReachabilityListener,
): () => void {
  listeners.add(listener);
  if (serverReachability.value !== null) {
    listener(serverReachability.value);
  }
  return () => listeners.delete(listener);
}
