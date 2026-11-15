import { useState } from "#imports";
import type { RealtimeServerMessage, RealtimeTopic } from "@peridot/contracts";
import {
  createRealtimeTicket,
  reportAuthenticationRedirect,
} from "../lib/peridot-client";
import { realtimeReconnectDelay } from "../lib/realtime";
import { isPeridotServerReachable } from "../lib/server-connection";
import { useServer } from "./use-server";
import { useServerConnection } from "./use-server-connection";
import { useSession } from "./use-session";

type Listener = (message: RealtimeServerMessage) => void;

const FALLBACK_HEALTH_DELAY = 10_000;

let socket: WebSocket | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | undefined;
let healthTimer: ReturnType<typeof setTimeout> | undefined;
let reconnectAttempt = 0;
let activeScope = "";
let helloReceived = false;
let lastSequence = 0;
let disposed = false;
let browserListenersBound = false;
const listeners = new Set<Listener>();
const topicCounts = new Map<RealtimeTopic, number>();

function socketUrl(serverAddress: string, ticket: string) {
  const url = new URL(serverAddress);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  url.pathname = `${url.pathname.replace(/\/$/, "")}/api/realtime`;
  url.search = "";
  url.searchParams.set("ticket", ticket);
  return url.toString();
}

function topics(): RealtimeTopic[] {
  return [...topicCounts.entries()]
    .filter(([, count]) => count > 0)
    .map(([topic]) => topic);
}

function emit(message: RealtimeServerMessage) {
  for (const listener of listeners) listener(message);
}

function bindBrowserListeners(onWake: () => void) {
  if (!import.meta.client || browserListenersBound) return;
  browserListenersBound = true;
  window.addEventListener("online", () => {
    reconnectAttempt = 0;
    onWake();
  });
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") {
      reconnectAttempt = 0;
      onWake();
    }
  });
}

export function useRealtime() {
  const { address } = useServer();
  const { token } = useSession();
  const { status } = useServerConnection();
  const reconnectCount = useState("realtime-reconnect-count", () => 0);

  function clearReconnect() {
    if (reconnectTimer) clearTimeout(reconnectTimer);
    reconnectTimer = undefined;
  }

  function clearHealth() {
    if (healthTimer) clearTimeout(healthTimer);
    healthTimer = undefined;
  }

  function scheduleHealthCheck(serverAddress: string) {
    clearHealth();
    if (!import.meta.client || disposed) return;
    healthTimer = setTimeout(async () => {
      healthTimer = undefined;
      const reachable = await isPeridotServerReachable(serverAddress);
      if (disposed) return;
      status.value = reachable ? "unknown" : "lost";
      scheduleHealthCheck(serverAddress);
    }, FALLBACK_HEALTH_DELAY);
  }

  function sendSubscription() {
    if (!socket || socket.readyState !== WebSocket.OPEN || !helloReceived) {
      return;
    }
    const selected = topics();
    if (!selected.length) return;
    socket.send(
      JSON.stringify({
        type: "subscribe",
        topics: selected,
        ...(lastSequence ? { after: lastSequence } : {}),
      }),
    );
  }

  function scheduleReconnect() {
    if (!import.meta.client || disposed || !address.value || !token.value)
      return;
    clearReconnect();
    const delay = realtimeReconnectDelay(reconnectAttempt);
    reconnectAttempt += 1;
    reconnectCount.value += 1;
    reconnectTimer = setTimeout(() => void connect(true), delay);
  }

  async function connect(force = false) {
    if (!import.meta.client || disposed) return;
    const serverAddress = address.value;
    const sessionToken = token.value;
    if (!serverAddress || !sessionToken) {
      disconnect();
      return;
    }
    const scope = `${serverAddress}\u0000${sessionToken}`;
    if (!force && socket && activeScope === scope) return;
    if (socket) disconnect(false);
    activeScope = scope;
    helloReceived = false;
    try {
      const ticket = await createRealtimeTicket(serverAddress, sessionToken);
      if (disposed || activeScope !== scope) return;
      const nextSocket = new WebSocket(socketUrl(serverAddress, ticket.ticket));
      socket = nextSocket;
      nextSocket.addEventListener("open", () => {
        if (socket !== nextSocket) return;
        reconnectAttempt = 0;
        clearHealth();
        status.value = "connected";
        helloReceived = true;
        sendSubscription();
      });
      nextSocket.addEventListener("message", (event) => {
        if (socket !== nextSocket) return;
        let message: RealtimeServerMessage;
        try {
          message = JSON.parse(String(event.data)) as RealtimeServerMessage;
        } catch {
          return;
        }
        if (message.type === "hello") {
          helloReceived = true;
          return;
        }
        if (message.type === "subscribed") return;
        if (message.type === "error") {
          emit(message);
          return;
        }
        if (message.type === "resync.required") {
          lastSequence = message.currentSequence;
        } else {
          lastSequence = message.eventId;
        }
        emit(message);
      });
      nextSocket.addEventListener("close", (event) => {
        if (socket !== nextSocket) return;
        socket = null;
        helloReceived = false;
        status.value = "lost";
        if (event.code === 4401) reportAuthenticationRedirect("login");
        scheduleHealthCheck(serverAddress);
        scheduleReconnect();
      });
      nextSocket.addEventListener("error", () => {
        if (socket === nextSocket) nextSocket.close();
      });
    } catch {
      status.value = "lost";
      scheduleHealthCheck(serverAddress);
      scheduleReconnect();
    }
  }

  bindBrowserListeners(() => {
    if (!address.value || !token.value) return;
    void connect(true);
  });

  function disconnect(resetTopics = true) {
    clearReconnect();
    clearHealth();
    if (socket) {
      const current = socket;
      socket = null;
      current.close(1000, "Realtime subscription changed");
    }
    helloReceived = false;
    if (resetTopics) {
      topicCounts.clear();
      lastSequence = 0;
    }
  }

  function subscribe(selected: readonly RealtimeTopic[], listener: Listener) {
    if (!import.meta.client) return () => undefined;
    listeners.add(listener);
    for (const topic of selected) {
      topicCounts.set(topic, (topicCounts.get(topic) ?? 0) + 1);
    }
    if (!socket) void connect();
    else sendSubscription();
    return () => {
      listeners.delete(listener);
      for (const topic of selected) {
        const next = Math.max(0, (topicCounts.get(topic) ?? 1) - 1);
        if (next) topicCounts.set(topic, next);
        else topicCounts.delete(topic);
      }
      sendSubscription();
    };
  }

  function restart() {
    reconnectAttempt = 0;
    lastSequence = 0;
    void connect(true);
  }

  function dispose() {
    disposed = true;
    disconnect();
    listeners.clear();
  }

  return {
    subscribe,
    restart,
    dispose,
    connect,
    disconnect,
    lastSequence: () => lastSequence,
  };
}
