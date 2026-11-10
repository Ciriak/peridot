<script setup lang="ts">
import {
  computed,
  definePageMeta,
  navigateTo,
  onBeforeUnmount,
  onMounted,
  ref,
} from "#imports";
import { Icon } from "@iconify/vue/offline";
import type { LogEntryResponse } from "@peridot/contracts";
import { Button } from "@peridot/ui/components/ui/button";
import { Input } from "@peridot/ui/components/ui/input";
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
import { useSession } from "../../composables/use-session";
import { useUser } from "../../composables/use-user";
import { icons } from "../../lib/icons";
import { fetchLogs, revokeSession } from "../../lib/peridot-client";

definePageMeta({ layout: "settings" });

const { address } = useServer();
const { token } = useSession();
const { user } = useUser();
const logs = ref<LogEntryResponse[]>([]);
let logAfter = 0;
let logTimer: ReturnType<typeof setInterval> | undefined;
const logLevels = ["trace", "debug", "info", "warn", "error", "fatal"];
const activeLevels = ref<string[]>(["debug", "warn", "error", "fatal"]);
const logSearch = ref("");
const disconnectOpen = ref(false);
const disconnecting = ref(false);
const logError = ref("");

async function refreshLogs() {
  try {
    const result = await fetchLogs(
      address.value ?? "",
      token.value ?? "",
      logAfter,
    );
    logError.value = "";
    if (result.items.length) {
      logAfter = result.items[result.items.length - 1]?.id ?? logAfter;
      logs.value = [...result.items].reverse().concat(logs.value).slice(0, 500);
    }
  } catch {
    // The log view tolerates transient polling failures.
  }
}

function logTime(value: string): string {
  return new Date(value).toLocaleTimeString();
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

async function confirmDisconnect() {
  if (disconnecting.value) return;
  disconnecting.value = true;
  const currentAddress = address.value;
  const currentToken = token.value;
  address.value = null;
  token.value = null;
  user.value = null;
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
    logError.value = "Administrator access is required.";
    return;
  }
  void refreshLogs();
  logTimer = setInterval(() => void refreshLogs(), 2000);
});
onBeforeUnmount(() => {
  if (logTimer) clearInterval(logTimer);
});
</script>

<template>
  <div class="space-y-2">
    <h2 class="text-2xl font-semibold tracking-tight">Administration</h2>
    <p class="text-sm text-muted-foreground">
      Manage this server connection and inspect server activity.
    </p>
  </div>

  <section
    v-if="user?.role !== 'admin'"
    role="alert"
    class="rounded-lg border bg-card p-6 text-sm text-card-foreground"
  >
    Administrator access is required.
  </section>

  <template v-else>
    <section aria-labelledby="server-heading" class="space-y-4">
      <h3 id="server-heading" class="text-lg font-semibold">Server</h3>
      <div
        class="flex flex-col gap-4 rounded-lg border bg-card p-6 text-card-foreground sm:flex-row sm:items-center sm:justify-between"
      >
        <div class="min-w-0">
          <p class="text-sm text-muted-foreground">Connected server</p>
          <p class="mt-1 truncate text-sm font-medium">
            {{ address ?? "Not connected" }}
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          :disabled="disconnecting"
          @click="requestDisconnect"
        >
          <Icon :icon="icons.logout" aria-hidden="true" class="size-4" />
          {{ disconnecting ? "Disconnecting…" : "Disconnect" }}
        </Button>
      </div>
    </section>

    <AlertDialogRoot v-model:open="disconnectOpen">
      <AlertDialogPortal>
        <AlertDialogOverlay class="fixed inset-0 z-50 bg-background/80" />
        <AlertDialogContent
          class="fixed left-1/2 top-1/2 z-50 w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-lg border bg-card p-6 text-card-foreground shadow-lg"
        >
          <AlertDialogTitle class="text-lg font-semibold">
            Disconnect from server?
          </AlertDialogTitle>
          <AlertDialogDescription class="text-sm text-muted-foreground">
            This signs you out of {{ address ?? "this server" }} in this
            browser. You will need to select the server and sign in again.
          </AlertDialogDescription>
          <div class="mt-6 flex justify-end gap-3">
            <AlertDialogCancel as-child>
              <Button type="button" variant="outline">Cancel</Button>
            </AlertDialogCancel>
            <AlertDialogAction as-child @click="confirmDisconnect">
              <Button type="button" variant="destructive">Disconnect</Button>
            </AlertDialogAction>
          </div>
        </AlertDialogContent>
      </AlertDialogPortal>
    </AlertDialogRoot>

    <section aria-labelledby="server-log-heading" class="space-y-4">
      <div class="flex items-center justify-between gap-4">
        <h3 id="server-log-heading" class="text-lg font-semibold">
          Server log
        </h3>
        <DropdownMenuRoot>
          <DropdownMenuTrigger as-child>
            <Button type="button" variant="outline" size="sm">
              <Icon
                :icon="icons.filterIcon"
                aria-hidden="true"
                class="size-4"
              />
              Filters
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuPortal>
            <DropdownMenuContent
              class="z-50 w-72 rounded-lg border bg-popover p-3 text-popover-foreground shadow-lg"
            >
              <DropdownMenuLabel
                class="px-1 text-xs font-medium text-muted-foreground"
              >
                Categories
              </DropdownMenuLabel>
              <div class="flex flex-wrap gap-1.5">
                <Button
                  type="button"
                  :variant="activeLevels.length === 0 ? 'default' : 'outline'"
                  size="xs"
                  @click="clearLevels"
                >
                  All
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
                Search
              </DropdownMenuLabel>
              <Input
                v-model="logSearch"
                type="search"
                aria-label="Search server log"
                placeholder="Search log"
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
            No log entries yet.
          </p>
          <p v-else-if="!visibleLogs.length" class="text-muted-foreground">
            No matching log entries.
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
  </template>
</template>
