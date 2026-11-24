<script setup lang="ts">
import { useRoute } from "#imports";
import type { RealtimeServerMessage } from "@peridot/contracts";
import { onBeforeUnmount, onMounted, watch } from "vue";
import { useCatalogRevision } from "../composables/use-catalog-query";
import { useRealtime } from "../composables/use-realtime";
import { useServer } from "../composables/use-server";
import { useServerConnection } from "../composables/use-server-connection";
import { useSession } from "../composables/use-session";
import { useTasks } from "../composables/use-tasks";
import { useUser } from "../composables/use-user";
import { unseenReleaseImportStage } from "../lib/release-import-notifications";
import { serverConnectionRestored } from "../lib/server-connection";
import {
  notifyReleaseAddingToLibrary,
  notifyReleaseDownloading,
  notifyServerOnline,
} from "../lib/toasts";

const route = useRoute();
const { address } = useServer();
const { status: connectionStatus } = useServerConnection();
const { token } = useSession();
const { user } = useUser();
const { refresh, upsert } = useTasks();
const {
  applyRevision,
  requestResync,
  resetOfflineCatalog,
  reset: resetCatalogRevision,
} = useCatalogRevision();
const realtime = useRealtime();
let unsubscribe: (() => void) | undefined;
let activeScope = "";
let notificationsStartedAt = 0;
const notifiedReleaseStages = new Set<string>();

function notifyReleaseImport(message: RealtimeServerMessage) {
  if (message.type !== "task.updated") return;
  const task = message.task;
  const stage = unseenReleaseImportStage(
    task,
    user.value?.id,
    notificationsStartedAt,
    notifiedReleaseStages,
  );
  if (!stage) return;
  if (stage === "downloading") {
    notifyReleaseDownloading(task.titleMessage);
  } else {
    notifyReleaseAddingToLibrary(task.titleMessage);
  }
}

function onRealtimeMessage(message: RealtimeServerMessage) {
  if (message.type === "task.updated") {
    upsert(message.task);
    notifyReleaseImport(message);
    return;
  }
  if (message.type === "catalog.changed") {
    applyRevision(message.revision, message.reason);
    return;
  }
  if (message.type === "resync.required") {
    void refresh().catch(() => undefined);
    void resetOfflineCatalog();
    requestResync();
  }
}

function currentScope() {
  return `${address.value ?? ""}\u0000${token.value ?? ""}`;
}

function stop() {
  unsubscribe?.();
  unsubscribe = undefined;
}

function start() {
  stop();
  if (
    !import.meta.client ||
    route.path === "/onboarding" ||
    !address.value ||
    !token.value
  ) {
    realtime.disconnect();
    activeScope = "";
    resetCatalogRevision();
    notificationsStartedAt = 0;
    notifiedReleaseStages.clear();
    return;
  }
  if (activeScope && activeScope !== currentScope()) {
    resetCatalogRevision();
  }
  activeScope = currentScope();
  notificationsStartedAt = Date.now();
  notifiedReleaseStages.clear();
  unsubscribe = realtime.subscribe(["tasks", "catalog"], onRealtimeMessage);
  void refresh().catch(() => undefined);
}

watch([address, token, () => route.path === "/onboarding"], () => {
  if (currentScope() === activeScope && unsubscribe) return;
  start();
});
watch(connectionStatus, (next, previous) => {
  if (route.path === "/onboarding" || !address.value || !token.value) return;
  if (serverConnectionRestored(previous, next)) notifyServerOnline();
});

onMounted(start);
onBeforeUnmount(stop);
</script>

<template>
  <span hidden aria-hidden="true" />
</template>
