<script setup lang="ts">
import {
  computed,
  definePageMeta,
  navigateTo,
  onBeforeUnmount,
  onMounted,
  ref,
  useI18n,
  useRuntimeConfig,
  watch,
} from "#imports";
import { Icon } from "@iconify/vue/offline";
import {
  DEFAULT_FILE_LOG_RETENTION_DAYS,
  DEFAULT_SCAN_WORKER_COUNT,
  MAX_FILE_LOG_RETENTION_DAYS,
  MAX_SCAN_WORKER_COUNT,
  SCAN_WORKER_WARNING_THRESHOLD,
} from "@peridot/contracts";
import { Button } from "@peridot/ui/components/ui/button";
import { Input } from "@peridot/ui/components/ui/input";
import { Switch } from "@peridot/ui/components/ui/switch";
import {
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogOverlay,
  AlertDialogPortal,
  AlertDialogRoot,
  AlertDialogTitle,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuPortal,
  DropdownMenuRoot,
  DropdownMenuTrigger,
} from "reka-ui";
import { useServer } from "../../composables/use-server";
import {
  useServerLogsQuery,
  useServerSettingsQuery,
  useUpdatesQuery,
} from "../../composables/use-admin-queries";
import { useLocalizedMessage } from "../../composables/use-localized-message";
import { useRealtime } from "../../composables/use-realtime";
import { useSession } from "../../composables/use-session";
import { useServerConnection } from "../../composables/use-server-connection";
import { useUser } from "../../composables/use-user";
import { icons } from "../../lib/icons";
import { clearAllOfflineTracks } from "../../lib/offline-audio";
import { clearAllPeridotQueries } from "../../lib/query-persister";
import {
  isAuthenticationRedirectError,
  requestServerRestart,
  revokeSession,
} from "../../lib/peridot-client";

definePageMeta({ layout: "settings" });

const { t, d } = useI18n();
const { errorMessage } = useLocalizedMessage();
const { address } = useServer();
const { status: connectionStatus } = useServerConnection();
const { token } = useSession();
const { user } = useUser();
const realtime = useRealtime();
const runtimeConfig = useRuntimeConfig();
const logsQuery = useServerLogsQuery();
const serverSettings = useServerSettingsQuery();
const updates = useUpdatesQuery();
const clientVersion = runtimeConfig.public.clientVersion;
const logs = logsQuery.items;
let logAfter = 0;
let unsubscribeLogs: (() => void) | undefined;
const logLevels = ["trace", "debug", "info", "warn", "error", "fatal"];
const activeLevels = ref<string[]>(["debug", "warn", "error", "fatal"]);
const logSearch = ref("");
const restartOpen = ref(false);
const restarting = ref(false);
const restartNotice = ref("");
const restartError = ref("");
let restartSawDisconnect = false;
const disconnectOpen = ref(false);
const disconnecting = ref(false);
const logError = ref("");
const fileLoggingEnabled = ref(true);
const fileLogRetentionDays = ref<string | number>(
  String(DEFAULT_FILE_LOG_RETENTION_DAYS),
);
const savedFileLogRetentionDays = ref(DEFAULT_FILE_LOG_RETENTION_DAYS);
const fileLoggingSaving = ref(false);
const fileLoggingNotice = ref("");
const fileLoggingError = ref("");
const scanWorkerCount = ref<string | number>(String(DEFAULT_SCAN_WORKER_COUNT));
const savedScanWorkerCount = ref(DEFAULT_SCAN_WORKER_COUNT);
const scanWorkerSaving = ref(false);
const scanWorkerNotice = ref("");
const scanWorkerError = ref("");
const updateChecking = ref(false);
const updateCheckingNotice = ref("");
const updateCheckingError = ref("");

const updateStatus = computed(() => updates.status.value);
const updateChannel = computed(() => {
  const channel = updateStatus.value?.channel;
  if (channel === "dev") return t("settings.server.updates.channel.dev");
  if (channel === "beta") return t("settings.server.updates.channel.beta");
  if (channel === "stable") return t("settings.server.updates.channel.stable");
  return t("settings.server.updates.channel.local");
});
const updateRevision = computed(
  () =>
    updateStatus.value?.currentTag ??
    updateStatus.value?.currentCommit?.slice(0, 8) ??
    t("settings.server.updates.unknownRevision"),
);
const updateCheckTime = computed(() => {
  const checkedAt = updateStatus.value?.checkedAt;
  return checkedAt ? d(new Date(checkedAt), "medium") : null;
});

watch(
  serverSettings.settings,
  (settings) => {
    if (settings) {
      fileLoggingEnabled.value = settings.fileLogging?.enabled ?? true;
      const retentionDays =
        settings.fileLogging?.retentionDays ?? DEFAULT_FILE_LOG_RETENTION_DAYS;
      fileLogRetentionDays.value = String(retentionDays);
      savedFileLogRetentionDays.value = retentionDays;
      const workerCount =
        settings.scanning?.workerCount ?? DEFAULT_SCAN_WORKER_COUNT;
      scanWorkerCount.value = String(workerCount);
      savedScanWorkerCount.value = workerCount;
    }
  },
  { immediate: true },
);

const parsedScanWorkerCount = computed(() => {
  const text = String(scanWorkerCount.value).trim();
  if (!/^\d+$/.test(text)) return null;
  const count = Number(text);
  return Number.isSafeInteger(count) &&
    count >= 1 &&
    count <= MAX_SCAN_WORKER_COUNT
    ? count
    : null;
});
const scanWorkerWarning = computed(
  () =>
    parsedScanWorkerCount.value !== null &&
    parsedScanWorkerCount.value > SCAN_WORKER_WARNING_THRESHOLD,
);

const logFilePath = computed(
  () => serverSettings.settings.value?.fileLogging?.path ?? "",
);
const parsedFileLogRetentionDays = computed(() => {
  const text = String(fileLogRetentionDays.value).trim();
  if (!/^\d+$/.test(text)) return null;
  const days = Number(text);
  return Number.isSafeInteger(days) &&
    days >= 1 &&
    days <= MAX_FILE_LOG_RETENTION_DAYS
    ? days
    : null;
});

async function refreshLogs() {
  logError.value = "";
  await logsQuery.refresh();
  const newest = logs.value[0];
  if (newest && newest.id > logAfter) logAfter = newest.id;
}

function logTime(value: string): string {
  return d(new Date(value), "time");
}

function toggleLevel(level: string) {
  activeLevels.value = activeLevels.value.includes(level)
    ? activeLevels.value.filter((item) => item !== level)
    : [...activeLevels.value, level];
}

function clearLevels() {
  activeLevels.value = [];
}

const visibleLogs = computed(() => {
  const query = logSearch.value.trim().toLowerCase();
  return logs.value.filter((entry) => {
    if (
      activeLevels.value.length &&
      !activeLevels.value.includes(entry.level)
    ) {
      return false;
    }
    return !query || entry.message.toLowerCase().includes(query);
  });
});

function requestDisconnect() {
  disconnectOpen.value = true;
}

function requestRestart() {
  restartNotice.value = "";
  restartError.value = "";
  restartOpen.value = true;
}

async function confirmRestart() {
  if (restarting.value) return;
  restarting.value = true;
  restartSawDisconnect = false;
  restartError.value = "";
  try {
    await requestServerRestart(address.value ?? "", token.value ?? "");
    restartNotice.value = t("settings.server.restartRequested");
  } catch (reason) {
    restarting.value = false;
    if (isAuthenticationRedirectError(reason)) return;
    restartError.value = errorMessage(reason, "settings.server.restartError");
  }
}

async function checkUpdates() {
  if (updateChecking.value) return;
  updateChecking.value = true;
  updateCheckingNotice.value = "";
  updateCheckingError.value = "";
  try {
    const result = await updates.check();
    updateCheckingNotice.value =
      result.state === "available"
        ? t("settings.server.updates.available")
        : t("settings.server.updates.current");
  } catch (reason) {
    if (isAuthenticationRedirectError(reason)) return;
    updateCheckingError.value = errorMessage(
      reason,
      "settings.server.updates.checkError",
    );
  } finally {
    updateChecking.value = false;
  }
}

async function saveFileLogging() {
  if (fileLoggingSaving.value) return;
  fileLoggingNotice.value = "";
  fileLoggingError.value = "";
  const retentionDays = parsedFileLogRetentionDays.value;
  if (retentionDays === null) {
    fileLoggingError.value = t("settings.server.fileLogging.invalidRetention");
    return;
  }
  if (retentionDays === savedFileLogRetentionDays.value) {
    const current = serverSettings.settings.value?.fileLogging;
    if (current?.enabled === fileLoggingEnabled.value) return;
  }

  fileLoggingSaving.value = true;
  try {
    await serverSettings.save({
      fileLogging: {
        enabled: fileLoggingEnabled.value,
        retentionDays,
      },
    });
    savedFileLogRetentionDays.value = retentionDays;
    fileLoggingNotice.value = t("settings.server.fileLogging.saved");
  } catch (reason) {
    if (isAuthenticationRedirectError(reason)) return;
    fileLoggingError.value = errorMessage(
      reason,
      "settings.server.fileLogging.saveError",
    );
  } finally {
    fileLoggingSaving.value = false;
  }
}

function changeFileLogging(enabled: boolean) {
  fileLoggingEnabled.value = enabled;
  void saveFileLogging();
}

async function saveScanWorkerCount() {
  if (scanWorkerSaving.value) return;
  const workerCount = parsedScanWorkerCount.value;
  scanWorkerNotice.value = "";
  scanWorkerError.value = "";
  if (workerCount === null) {
    scanWorkerError.value = t("settings.server.scanning.invalid");
    return;
  }
  if (workerCount === savedScanWorkerCount.value) return;

  scanWorkerSaving.value = true;
  try {
    await serverSettings.save({
      scanning: { workerCount },
    });
    savedScanWorkerCount.value = workerCount;
    scanWorkerNotice.value = t("settings.server.scanning.saved");
  } catch (reason) {
    if (isAuthenticationRedirectError(reason)) return;
    scanWorkerError.value = errorMessage(
      reason,
      "settings.server.scanning.saveError",
    );
  } finally {
    scanWorkerSaving.value = false;
  }
}

async function confirmDisconnect() {
  if (disconnecting.value) return;
  disconnecting.value = true;
  const currentAddress = address.value;
  const currentToken = token.value;
  address.value = null;
  token.value = null;
  user.value = null;
  await Promise.all([clearAllPeridotQueries(), clearAllOfflineTracks()]);
  try {
    if (currentAddress && currentToken) {
      await revokeSession(currentAddress, currentToken);
    }
  } catch {
    // Local credentials are cleared even if the server cannot be reached.
  } finally {
    disconnecting.value = false;
    await navigateTo("/onboarding", { replace: true });
  }
}

onMounted(() => {
  if (user.value?.role !== "admin") {
    logError.value = t("settings.tasks.adminRequired");
    return;
  }
  void refreshLogs();
  void serverSettings.load();
  void updates.load();
  unsubscribeLogs = realtime.subscribe(["logs"], (message) => {
    if (message.type === "log.appended") {
      if (message.entry.id <= logAfter) return;
      logAfter = message.entry.id;
      logsQuery.append(message.entry);
    } else if (message.type === "resync.required") {
      void refreshLogs();
    }
  });
});
onBeforeUnmount(() => {
  unsubscribeLogs?.();
});

watch(connectionStatus, (status) => {
  if (restarting.value) {
    if (status === "lost") {
      restartSawDisconnect = true;
      return;
    }
    if (status === "connected" && restartSawDisconnect) {
      restarting.value = false;
      restartSawDisconnect = false;
      restartNotice.value = t("settings.server.restartComplete");
    }
  }
});
</script>

<template>
  <div class="space-y-2">
    <h2 class="text-2xl font-semibold tracking-tight">
      {{ t("settings.server.title") }}
    </h2>
    <p class="text-sm text-muted-foreground">
      {{ t("settings.server.description") }}
    </p>
  </div>

  <section
    v-if="user?.role !== 'admin'"
    role="alert"
    class="rounded-lg border bg-card p-6 text-sm text-card-foreground"
  >
    {{ t("settings.tasks.adminRequired") }}
  </section>

  <template v-else>
    <section aria-labelledby="software-updates-heading" class="space-y-4">
      <h3 id="software-updates-heading" class="text-lg font-semibold">
        {{ t("settings.server.updates.title") }}
      </h3>
      <div class="space-y-5 rounded-lg border bg-card p-6 text-card-foreground">
        <dl class="grid gap-4 text-sm sm:grid-cols-2 lg:grid-cols-4">
          <div class="space-y-1">
            <dt class="text-muted-foreground">
              {{ t("settings.server.updates.serverVersion") }}
            </dt>
            <dd class="font-medium">{{ updateStatus?.version ?? "—" }}</dd>
          </div>
          <div class="space-y-1">
            <dt class="text-muted-foreground">
              {{ t("settings.server.updates.clientVersion") }}
            </dt>
            <dd class="break-all font-medium">{{ clientVersion }}</dd>
          </div>
          <div class="space-y-1">
            <dt class="text-muted-foreground">
              {{ t("settings.server.updates.channel") }}
            </dt>
            <dd class="font-medium">{{ updateChannel }}</dd>
          </div>
          <div class="space-y-1">
            <dt class="text-muted-foreground">
              {{ t("settings.server.updates.revision") }}
            </dt>
            <dd class="break-all font-mono text-xs">{{ updateRevision }}</dd>
          </div>
        </dl>
        <p class="text-sm text-muted-foreground">
          <template v-if="updateStatus?.state === 'available'">
            {{ t("settings.server.updates.availableDetail") }}
          </template>
          <template v-else-if="updateStatus?.state === 'current'">
            {{ t("settings.server.updates.currentDetail") }}
          </template>
          <template v-else>
            {{ t("settings.server.updates.unchecked") }}
          </template>
          <template v-if="updateCheckTime">
            {{
              t("settings.server.updates.checkedAt", { date: updateCheckTime })
            }}
          </template>
        </p>
        <div
          class="flex flex-col gap-3 border-t pt-4 sm:flex-row sm:items-center sm:justify-between"
        >
          <p class="text-sm text-muted-foreground">
            {{
              updateStatus?.channel === "local"
                ? t("settings.server.updates.localHelp")
                : t("settings.server.updates.manualHelp")
            }}
          </p>
          <div class="flex gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              :disabled="
                updateChecking ||
                connectionStatus === 'lost' ||
                updateStatus?.channel === 'local'
              "
              @click="checkUpdates"
            >
              <Icon :icon="icons.restart" aria-hidden="true" class="size-4" />
              {{
                updateChecking
                  ? t("settings.server.updates.checking")
                  : t("settings.server.updates.check")
              }}
            </Button>
          </div>
        </div>
        <p
          v-if="updateCheckingNotice"
          role="status"
          aria-live="polite"
          class="text-sm text-muted-foreground"
        >
          {{ updateCheckingNotice }}
        </p>
        <p
          v-if="updateCheckingError || updates.error.value"
          role="alert"
          class="text-sm text-destructive"
        >
          {{ updateCheckingError || updates.error.value }}
        </p>
      </div>
    </section>

    <section aria-labelledby="server-heading" class="space-y-4">
      <h3 id="server-heading" class="text-lg font-semibold">
        {{ t("settings.server.title") }}
      </h3>
      <div
        class="flex flex-col gap-4 rounded-lg border bg-card p-6 text-card-foreground sm:flex-row sm:items-center sm:justify-between"
      >
        <div class="min-w-0">
          <p class="text-sm text-muted-foreground">
            {{ t("settings.server.connected") }}
          </p>
          <p class="mt-1 truncate text-sm font-medium">
            {{ address ?? t("common.notConnected") }}
          </p>
        </div>
        <Button
          type="button"
          variant="destructive"
          size="sm"
          :disabled="restarting || connectionStatus === 'lost'"
          @click="requestRestart"
        >
          <Icon :icon="icons.restart" aria-hidden="true" class="size-4" />
          {{
            restarting
              ? t("settings.server.restarting")
              : t("settings.server.restart")
          }}
        </Button>
      </div>
      <p
        v-if="restartNotice"
        role="status"
        aria-live="polite"
        class="text-sm text-muted-foreground"
      >
        {{ restartNotice }}
      </p>
      <p v-if="restartError" role="alert" class="text-sm text-destructive">
        {{ restartError }}
      </p>
    </section>

    <AlertDialogRoot v-model:open="restartOpen">
      <AlertDialogPortal>
        <AlertDialogOverlay class="fixed inset-0 z-50 bg-background/80" />
        <AlertDialogContent
          class="fixed left-1/2 top-1/2 z-50 w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-lg border bg-card p-6 text-card-foreground shadow-lg"
        >
          <AlertDialogTitle class="text-lg font-semibold">
            {{ t("settings.server.restartTitle") }}
          </AlertDialogTitle>
          <AlertDialogDescription class="text-sm text-muted-foreground">
            {{ t("settings.server.restartDescription") }}
          </AlertDialogDescription>
          <div class="mt-6 flex justify-end gap-3">
            <AlertDialogCancel as-child>
              <Button type="button" variant="outline">{{
                t("common.cancel")
              }}</Button>
            </AlertDialogCancel>
            <AlertDialogAction as-child @click="confirmRestart">
              <Button
                type="button"
                variant="destructive"
                :disabled="restarting"
              >
                <Icon :icon="icons.restart" aria-hidden="true" class="size-4" />
                {{
                  restarting
                    ? t("settings.server.restarting")
                    : t("settings.server.restart")
                }}
              </Button>
            </AlertDialogAction>
          </div>
        </AlertDialogContent>
      </AlertDialogPortal>
    </AlertDialogRoot>

    <AlertDialogRoot v-model:open="disconnectOpen">
      <AlertDialogPortal>
        <AlertDialogOverlay class="fixed inset-0 z-50 bg-background/80" />
        <AlertDialogContent
          class="fixed left-1/2 top-1/2 z-50 w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-lg border bg-card p-6 text-card-foreground shadow-lg"
        >
          <AlertDialogTitle class="text-lg font-semibold">
            {{ t("settings.server.disconnectTitle") }}
          </AlertDialogTitle>
          <AlertDialogDescription class="text-sm text-muted-foreground">
            {{
              t("settings.server.disconnectDescription", {
                server: address ?? t("settings.server.title"),
              })
            }}
          </AlertDialogDescription>
          <div class="mt-6 flex justify-end gap-3">
            <AlertDialogCancel as-child>
              <Button type="button" variant="outline">{{
                t("common.cancel")
              }}</Button>
            </AlertDialogCancel>
            <AlertDialogAction as-child @click="confirmDisconnect">
              <Button type="button" variant="destructive">{{
                t("settings.server.disconnect")
              }}</Button>
            </AlertDialogAction>
          </div>
        </AlertDialogContent>
      </AlertDialogPortal>
    </AlertDialogRoot>

    <section aria-labelledby="scan-performance-heading" class="space-y-4">
      <h3 id="scan-performance-heading" class="text-lg font-semibold">
        {{ t("settings.server.scanning.title") }}
      </h3>
      <div class="space-y-4 rounded-lg border bg-card p-6 text-card-foreground">
        <div class="space-y-2">
          <label for="scan-worker-count" class="text-sm font-medium">
            {{ t("settings.server.scanning.workerCount") }}
          </label>
          <Input
            id="scan-worker-count"
            v-model="scanWorkerCount"
            type="number"
            min="1"
            :max="MAX_SCAN_WORKER_COUNT"
            step="1"
            :disabled="scanWorkerSaving || connectionStatus === 'lost'"
            :aria-invalid="
              String(scanWorkerCount).trim() !== '' &&
              parsedScanWorkerCount === null
            "
            :aria-describedby="
              scanWorkerWarning
                ? 'scan-worker-help scan-worker-warning'
                : 'scan-worker-help'
            "
            class="max-w-32"
            @blur="saveScanWorkerCount"
            @keydown.enter.prevent="saveScanWorkerCount"
          />
        </div>
        <p id="scan-worker-help" class="text-sm text-muted-foreground">
          {{ t("settings.server.scanning.workerCountHelp") }}
          {{ t("settings.server.scanning.defaultHelp") }}
        </p>
        <p
          v-if="scanWorkerWarning"
          id="scan-worker-warning"
          role="status"
          class="flex items-start gap-2 text-sm text-destructive"
        >
          <Icon
            :icon="icons.warning"
            aria-hidden="true"
            class="mt-0.5 size-4"
          />
          {{ t("settings.server.scanning.warning") }}
        </p>
        <p
          v-if="scanWorkerNotice"
          role="status"
          aria-live="polite"
          class="text-sm text-muted-foreground"
        >
          {{ scanWorkerNotice }}
        </p>
        <p
          v-if="scanWorkerError || serverSettings.error.value"
          role="alert"
          class="text-sm text-destructive"
        >
          {{ scanWorkerError || serverSettings.error.value }}
        </p>
      </div>
    </section>

    <section aria-labelledby="log-file-heading" class="space-y-4">
      <h3 id="log-file-heading" class="text-lg font-semibold">
        {{ t("settings.server.fileLogging.title") }}
      </h3>
      <div class="space-y-5 rounded-lg border bg-card p-6 text-card-foreground">
        <div class="flex items-start justify-between gap-4">
          <div class="space-y-1">
            <p class="text-sm font-medium">
              {{ t("settings.server.fileLogging.enabled") }}
            </p>
            <p class="text-sm text-muted-foreground">
              {{ t("settings.server.fileLogging.enabledHelp") }}
            </p>
          </div>
          <Switch
            :model-value="fileLoggingEnabled"
            :disabled="fileLoggingSaving || connectionStatus === 'lost'"
            :aria-label="t('settings.server.fileLogging.enabled')"
            @update:model-value="changeFileLogging"
          />
        </div>
        <div class="space-y-2 border-t pt-4">
          <label for="file-log-retention-days" class="text-sm font-medium">
            {{ t("settings.server.fileLogging.retentionDays") }}
          </label>
          <Input
            id="file-log-retention-days"
            v-model="fileLogRetentionDays"
            type="number"
            min="1"
            :max="MAX_FILE_LOG_RETENTION_DAYS"
            step="1"
            :disabled="fileLoggingSaving || connectionStatus === 'lost'"
            :aria-invalid="
              String(fileLogRetentionDays).trim() !== '' &&
              parsedFileLogRetentionDays === null
            "
            aria-describedby="file-log-retention-help"
            class="max-w-32"
            @blur="saveFileLogging"
            @keydown.enter.prevent="saveFileLogging"
          />
          <p id="file-log-retention-help" class="text-sm text-muted-foreground">
            {{ t("settings.server.fileLogging.retentionDaysHelp") }}
          </p>
        </div>
        <div class="space-y-1 border-t pt-4">
          <p class="text-sm font-medium">
            {{ t("settings.server.fileLogging.path") }}
          </p>
          <p class="break-all font-mono text-xs text-muted-foreground">
            {{ logFilePath || t("settings.server.fileLogging.pathPending") }}
          </p>
        </div>
        <p
          v-if="fileLoggingNotice"
          role="status"
          aria-live="polite"
          class="text-sm text-muted-foreground"
        >
          {{ fileLoggingNotice }}
        </p>
        <p
          v-if="fileLoggingError || serverSettings.error.value"
          role="alert"
          class="text-sm text-destructive"
        >
          {{ fileLoggingError || serverSettings.error.value }}
        </p>
      </div>
    </section>

    <section aria-labelledby="server-log-heading" class="space-y-4">
      <div class="flex items-center justify-between gap-4">
        <h3 id="server-log-heading" class="text-lg font-semibold">
          {{ t("settings.server.log") }}
        </h3>
        <DropdownMenuRoot>
          <DropdownMenuTrigger as-child>
            <Button type="button" variant="outline" size="sm">
              <Icon
                :icon="icons.filterIcon"
                aria-hidden="true"
                class="size-4"
              />
              {{ t("settings.server.filters") }}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuPortal>
            <DropdownMenuContent
              class="z-50 w-72 rounded-lg border bg-popover p-3 text-popover-foreground shadow-lg"
            >
              <DropdownMenuLabel
                class="px-1 text-xs font-medium text-muted-foreground"
              >
                {{ t("settings.server.categories") }}
              </DropdownMenuLabel>
              <div class="flex flex-wrap gap-1.5">
                <Button
                  type="button"
                  :variant="activeLevels.length === 0 ? 'default' : 'outline'"
                  size="xs"
                  @click="clearLevels"
                >
                  {{ t("common.all") }}
                </Button>
                <Button
                  v-for="level in logLevels"
                  :key="level"
                  type="button"
                  :variant="
                    activeLevels.includes(level) ? 'default' : 'outline'
                  "
                  size="xs"
                  :aria-pressed="activeLevels.includes(level)"
                  @click="toggleLevel(level)"
                >
                  {{ level }}
                </Button>
              </div>
              <DropdownMenuLabel
                class="mt-2 px-1 text-xs font-medium text-muted-foreground"
              >
                {{ t("common.search") }}
              </DropdownMenuLabel>
              <Input
                v-model="logSearch"
                type="search"
                :aria-label="t('settings.server.search')"
                :placeholder="t('settings.server.searchPlaceholder')"
                class="w-full"
              />
            </DropdownMenuContent>
          </DropdownMenuPortal>
        </DropdownMenuRoot>
      </div>
      <p v-if="logError" role="alert" class="text-sm text-destructive">
        {{ logError }}
      </p>
      <div class="rounded-lg border bg-card p-4 text-card-foreground">
        <div
          class="h-64 space-y-1 overflow-y-auto rounded-md bg-muted/50 p-3 font-mono text-xs leading-6"
        >
          <p v-if="!logs.length" class="text-muted-foreground">
            {{ t("settings.server.noLogs") }}
          </p>
          <p v-else-if="!visibleLogs.length" class="text-muted-foreground">
            {{ t("settings.server.noMatches") }}
          </p>
          <p
            v-for="entry in visibleLogs"
            :key="entry.id"
            class="break-all"
            :class="
              entry.level === 'error' || entry.level === 'fatal'
                ? 'text-destructive'
                : ''
            "
          >
            <span class="text-muted-foreground">{{ logTime(entry.time) }}</span>
            <span class="ml-2 uppercase">{{ entry.level }}</span>
            <span class="ml-2">{{ entry.message }}</span>
          </p>
        </div>
      </div>
    </section>

    <div id="server-disconnect" class="mt-auto flex justify-end">
      <Button
        type="button"
        variant="destructive"
        size="sm"
        :disabled="disconnecting"
        @click="requestDisconnect"
      >
        <Icon :icon="icons.logout" aria-hidden="true" class="size-4" />
        {{
          disconnecting
            ? t("settings.server.disconnecting")
            : t("settings.server.disconnect")
        }}
      </Button>
    </div>
  </template>
</template>
