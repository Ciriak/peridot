<script setup lang="ts">
import {
  computed,
  definePageMeta,
  navigateTo,
  onBeforeUnmount,
  onMounted,
  ref,
  useI18n,
  watch,
} from "#imports";
import { Icon } from "@iconify/vue/offline";
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
const logsQuery = useServerLogsQuery();
const serverSettings = useServerSettingsQuery();
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
const sourceRefreshEnabled = ref(true);
const sourceRefreshCron = ref("0 3 * * *");
const sourceRefreshSaving = ref(false);
const sourceRefreshNotice = ref("");
const sourceRefreshError = ref("");

watch(
  serverSettings.settings,
  (settings) => {
    if (!settings) return;
    sourceRefreshEnabled.value = settings.sourceRefresh.enabled;
    sourceRefreshCron.value = settings.sourceRefresh.cron;
  },
  { immediate: true },
);

const nextSourceRefresh = computed(() => {
  const nextRunAt = serverSettings.settings.value?.sourceRefresh.nextRunAt;
  return nextRunAt ? d(new Date(nextRunAt), "medium") : null;
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

async function saveSourceRefresh() {
  if (sourceRefreshSaving.value) return;
  sourceRefreshSaving.value = true;
  sourceRefreshNotice.value = "";
  sourceRefreshError.value = "";
  try {
    await serverSettings.save({
      sourceRefresh: {
        enabled: sourceRefreshEnabled.value,
        cron: sourceRefreshCron.value,
      },
    });
    sourceRefreshNotice.value = t("settings.server.scheduleSaved");
  } catch (reason) {
    if (isAuthenticationRedirectError(reason)) return;
    sourceRefreshError.value = errorMessage(
      reason,
      "settings.server.scheduleSaveError",
    );
  } finally {
    sourceRefreshSaving.value = false;
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
  if (!restarting.value) return;
  if (status === "lost") {
    restartSawDisconnect = true;
    return;
  }
  if (status === "connected" && restartSawDisconnect) {
    restarting.value = false;
    restartSawDisconnect = false;
    restartNotice.value = t("settings.server.restartComplete");
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
    <section aria-labelledby="source-refresh-heading" class="space-y-4">
      <h3 id="source-refresh-heading" class="text-lg font-semibold">
        {{ t("settings.server.scheduleTitle") }}
      </h3>
      <div class="space-y-5 rounded-lg border bg-card p-6 text-card-foreground">
        <div class="flex items-start justify-between gap-4">
          <div class="space-y-1">
            <p class="text-sm font-medium">
              {{ t("settings.server.scheduleEnabled") }}
            </p>
            <p class="text-sm text-muted-foreground">
              {{ t("settings.server.scheduleEnabledHelp") }}
            </p>
          </div>
          <Switch
            v-model="sourceRefreshEnabled"
            :disabled="sourceRefreshSaving || connectionStatus === 'lost'"
            :aria-label="t('settings.server.scheduleEnabled')"
          />
        </div>
        <div class="space-y-2">
          <label for="source-refresh-cron" class="text-sm font-medium">
            {{ t("settings.server.scheduleCron") }}
          </label>
          <Input
            id="source-refresh-cron"
            v-model="sourceRefreshCron"
            :disabled="
              !sourceRefreshEnabled ||
              sourceRefreshSaving ||
              connectionStatus === 'lost'
            "
            :placeholder="t('settings.server.scheduleCronPlaceholder')"
            autocomplete="off"
            spellcheck="false"
          />
          <p class="text-sm text-muted-foreground">
            {{ t("settings.server.scheduleCronHelp") }}
            <a
              href="https://crontab.guru/"
              target="_blank"
              rel="noopener noreferrer"
              class="inline-flex items-center gap-1 underline underline-offset-4 hover:text-foreground"
            >
              {{ t("settings.server.scheduleCronHelpLink") }}
              <Icon
                :icon="icons.externalLink"
                aria-hidden="true"
                class="size-3"
              />
            </a>
          </p>
        </div>
        <div
          class="flex flex-col gap-3 border-t pt-4 sm:flex-row sm:items-center sm:justify-between"
        >
          <p class="text-sm text-muted-foreground">
            <template v-if="!sourceRefreshEnabled">
              {{ t("settings.server.scheduleDisabled") }}
            </template>
            <template v-else-if="nextSourceRefresh">
              {{
                t("settings.server.scheduleNext", {
                  date: nextSourceRefresh,
                })
              }}
            </template>
            <template v-else>
              {{ t("settings.server.schedulePending") }}
            </template>
          </p>
          <Button
            type="button"
            size="sm"
            :disabled="sourceRefreshSaving || connectionStatus === 'lost'"
            @click="saveSourceRefresh"
          >
            {{
              sourceRefreshSaving
                ? t("common.saving")
                : t("settings.server.scheduleSave")
            }}
          </Button>
        </div>
        <p
          v-if="sourceRefreshNotice"
          role="status"
          aria-live="polite"
          class="text-sm text-muted-foreground"
        >
          {{ sourceRefreshNotice }}
        </p>
        <p
          v-if="sourceRefreshError || serverSettings.error.value"
          role="alert"
          class="text-sm text-destructive"
        >
          {{ sourceRefreshError || serverSettings.error.value }}
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
          variant="outline"
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
              <Button type="button" :disabled="restarting">
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
