import { shallowRef } from "vue";

export const serverReachability = shallowRef<boolean | null>(null);

type ReachabilityListener = (reachable: boolean) => void;
const listeners = new Set<ReachabilityListener>();

export function reportServerReachability(reachable: boolean) {
  if (serverReachability.value === reachable) return;
  serverReachability.value = reachable;
  for (const listener of listeners) listener(reachable);
}

export function resetServerReachability() {
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
