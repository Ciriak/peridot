<script setup lang="ts">
import { useRoute } from "#imports";
import { onBeforeUnmount, onMounted, watch } from "vue";
import { useLibraryScan } from "../composables/use-library-scan";
import { useServer } from "../composables/use-server";
import { isLibraryScanActive } from "../lib/library-scan-toast";
import { isPeridotServerReachable } from "../lib/server-connection";
import {
  clearServerConnectionLost,
  notifyLibraryScan,
  notifyScanStatusFailure,
  notifyServerConnectionLost,
} from "../lib/toasts";

const SCAN_POLL_DELAY = 500;
const SCAN_RETRY_DELAY = 2000;
const SCAN_UNAVAILABLE_RETRY_DELAY = 10_000;
const SCAN_FAILURE_LIMIT = 3;
const CONNECTION_POLL_DELAY = 10_000;
const CONNECTION_TIMEOUT = 4000;

const route = useRoute();
const { address } = useServer();
const { scan, refresh } = useLibraryScan();

let scanTimer: ReturnType<typeof setTimeout> | undefined;
let scanFailures = 0;
let connectionTimer: ReturnType<typeof setTimeout> | undefined;
let connectionController: AbortController | undefined;
let connectionState: "unknown" | "connected" | "lost" = "unknown";
let disposed = false;

function clearScanTimer() {
  if (scanTimer) clearTimeout(scanTimer);
  scanTimer = undefined;
}

function scheduleScanRefresh(scanId: string, delay: number) {
  clearScanTimer();
  scanTimer = setTimeout(() => void refreshScan(scanId), delay);
}

async function refreshScan(scanId: string) {
  try {
    const next = await refresh();
    scanFailures = 0;
    if (next?.id === scanId && isLibraryScanActive(next.status)) {
      // The scan state watcher schedules the next poll after each update.
      return;
    }
  } catch (reason) {
    scanFailures += 1;
    if (scanFailures >= SCAN_FAILURE_LIMIT) {
      notifyScanStatusFailure(
        reason instanceof Error
          ? reason.message
          : "The server could not provide the latest scan status.",
      );
      scheduleScanRefresh(scanId, SCAN_UNAVAILABLE_RETRY_DELAY);
    } else {
      scheduleScanRefresh(scanId, SCAN_RETRY_DELAY);
    }
  }
}

watch(
  scan,
  (current) => {
    if (!current) return;
    notifyLibraryScan(current);
    if (isLibraryScanActive(current.status)) {
      scanFailures = 0;
      scheduleScanRefresh(current.id, SCAN_POLL_DELAY);
    } else {
      clearScanTimer();
    }
  },
  { immediate: true },
);

function scheduleConnectionCheck() {
  if (connectionTimer) clearTimeout(connectionTimer);
  connectionTimer = setTimeout(
    () => void checkConnection(),
    CONNECTION_POLL_DELAY,
  );
}

async function checkConnection() {
  const serverAddress = address.value;
  if (!serverAddress || route.path === "/onboarding") {
    connectionState = "unknown";
    clearServerConnectionLost();
    return;
  }

  connectionController?.abort();
  const controller = new AbortController();
  connectionController = controller;
  const timeout = setTimeout(() => controller.abort(), CONNECTION_TIMEOUT);
  const reachable = await isPeridotServerReachable(serverAddress, {
    signal: controller.signal,
  });
  clearTimeout(timeout);
  if (
    disposed ||
    (controller.signal.aborted && connectionController !== controller)
  ) {
    return;
  }

  if (reachable) {
    if (connectionState === "lost") clearServerConnectionLost();
    connectionState = "connected";
  } else {
    if (connectionState !== "lost") {
      notifyServerConnectionLost(serverAddress);
    }
    connectionState = "lost";
  }
  scheduleConnectionCheck();
}

watch([() => address.value, () => route.path === "/onboarding"], () => {
  connectionState = "unknown";
  clearServerConnectionLost();
  if (connectionTimer) clearTimeout(connectionTimer);
  void checkConnection();
});

onMounted(() => void checkConnection());
onBeforeUnmount(() => {
  disposed = true;
  clearScanTimer();
  if (connectionTimer) clearTimeout(connectionTimer);
  connectionController?.abort();
});
</script>

<template>
  <span hidden aria-hidden="true" />
</template>
