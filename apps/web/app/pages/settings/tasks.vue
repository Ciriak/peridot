<script setup lang="ts">
import { computed, definePageMeta, onMounted, ref, watch } from "#imports";
import type { TaskResponse, TaskStatus } from "@peridot/contracts";
import { Badge } from "@peridot/ui/components/ui/badge";
import { Button } from "@peridot/ui/components/ui/button";
import { ProgressCircle } from "@peridot/ui/components/ui/progress-circle";
import { PeridotSpinner } from "@peridot/ui/components/ui/spinner";
import { useServer } from "../../composables/use-server";
import { useSession } from "../../composables/use-session";
import { useTasks } from "../../composables/use-tasks";
import { useUser } from "../../composables/use-user";
import {
  isAuthenticationRedirectError,
  listTasks,
} from "../../lib/peridot-client";
import {
  activeTaskPercent,
  isActiveTaskStatus,
  orderedActiveTasks,
  taskProgressLabel,
  taskStatusLabel,
} from "../../lib/task-progress";

definePageMeta({ layout: "settings" });

const HISTORY_PAGE_SIZE = 50;
const taskDateFormatter = new Intl.DateTimeFormat("en-US", {
  dateStyle: "medium",
  timeStyle: "short",
});

const { address } = useServer();
const { token } = useSession();
const { user } = useUser();
const { tasks, activeTasks, loading, loaded, refresh } = useTasks();
const canManageTasks = computed(() => user.value?.role === "admin");
const history = ref<TaskResponse[]>([]);
const historyLoading = ref(false);
const historyLoaded = ref(false);
const historyHasMore = ref(false);
const historyError = ref("");
const previousStatuses = new Map<string, TaskStatus>();
let historyRequest = 0;

const activeRows = computed(() => orderedActiveTasks(activeTasks.value));

function currentScope(): string {
  return `${address.value ?? ""}\u0000${token.value ?? ""}`;
}

function taskKindLabel(task: TaskResponse): string {
  if (task.kind === "library_scan") return "Library scan";
  if (task.kind === "metadata_fetch") return "Metadata matching";
  return "Plugin task";
}

function taskStatusClass(status: TaskStatus): string {
  switch (status) {
    case "running":
      return "border-primary text-primary";
    case "queued":
      return "text-secondary-foreground";
    case "completed":
      return "border-success text-success";
    case "failed":
    case "interrupted":
      return "border-destructive text-destructive";
  }
}

function taskCircleProgress(task: TaskResponse): number | null {
  return task.status === "running" ? activeTaskPercent(task) : null;
}

function taskTimeLabel(task: TaskResponse): string {
  if (task.status === "running" && task.startedAt) {
    return `Started ${taskDateFormatter.format(new Date(task.startedAt))}`;
  }
  if (task.completedAt) {
    const action = task.status === "completed" ? "Completed" : "Ended";
    return `${action} ${taskDateFormatter.format(new Date(task.completedAt))}`;
  }
  return `Queued ${taskDateFormatter.format(new Date(task.createdAt))}`;
}

function visibleDetails(task: TaskResponse) {
  return task.details.filter(
    (detail) => detail.key !== "source" && !detail.key.startsWith("progress."),
  );
}

async function refreshHistory() {
  if (!canManageTasks.value || !address.value || !token.value) return;
  const requestedScope = currentScope();
  const request = ++historyRequest;
  historyLoading.value = true;
  historyError.value = "";
  try {
    const result = await listTasks(address.value, token.value, {
      status: "terminal",
      limit: HISTORY_PAGE_SIZE,
      offset: 0,
    });
    if (requestedScope !== currentScope() || request !== historyRequest) return;
    history.value = result.items;
    historyLoaded.value = true;
    historyHasMore.value = result.items.length === HISTORY_PAGE_SIZE;
  } catch (reason) {
    if (requestedScope !== currentScope() || request !== historyRequest) return;
    if (isAuthenticationRedirectError(reason)) return;
    historyError.value = "Task history is unavailable.";
    historyLoaded.value = true;
  } finally {
    if (request === historyRequest) historyLoading.value = false;
  }
}

async function loadMoreHistory() {
  if (
    !canManageTasks.value ||
    historyLoading.value ||
    !historyHasMore.value ||
    !address.value ||
    !token.value
  ) {
    return;
  }
  const requestedScope = currentScope();
  const request = ++historyRequest;
  historyLoading.value = true;
  historyError.value = "";
  try {
    const result = await listTasks(address.value, token.value, {
      status: "terminal",
      limit: HISTORY_PAGE_SIZE,
      offset: history.value.length,
    });
    if (requestedScope !== currentScope() || request !== historyRequest) return;
    const existing = new Set(history.value.map((task) => task.id));
    history.value = [
      ...history.value,
      ...result.items.filter((task) => !existing.has(task.id)),
    ];
    historyHasMore.value = result.items.length === HISTORY_PAGE_SIZE;
  } catch (reason) {
    if (requestedScope !== currentScope() || request !== historyRequest) return;
    if (isAuthenticationRedirectError(reason)) return;
    historyError.value = "Older task history could not be loaded.";
  } finally {
    if (request === historyRequest) historyLoading.value = false;
  }
}

watch([address, token, user], () => {
  previousStatuses.clear();
  history.value = [];
  historyLoaded.value = false;
  historyHasMore.value = false;
  historyError.value = "";
  historyRequest += 1;
  if (canManageTasks.value && import.meta.client) void refreshHistory();
});

watch(tasks, (current) => {
  if (!canManageTasks.value) return;
  let historyChanged = false;
  for (const task of current) {
    const previous = previousStatuses.get(task.id);
    if (
      previous &&
      isActiveTaskStatus(previous) &&
      !isActiveTaskStatus(task.status)
    ) {
      historyChanged = true;
    }
    previousStatuses.set(task.id, task.status);
  }
  if (historyChanged) void refreshHistory();
});

onMounted(() => {
  if (!canManageTasks.value) return;
  void refreshHistory();
  void refresh().catch(() => {
    // The shared task monitor retries transient status failures.
  });
});
</script>

<template>
  <div class="space-y-2">
    <h2 class="text-2xl font-semibold tracking-tight">Tasks</h2>
    <p class="text-sm text-muted-foreground">
      Follow current library work and review recently completed tasks.
    </p>
  </div>

  <section
    v-if="!canManageTasks"
    role="alert"
    class="rounded-lg border bg-card p-6 text-sm text-card-foreground"
  >
    Administrator access is required.
  </section>

  <template v-else>
    <section aria-labelledby="active-tasks-heading" class="space-y-4">
      <div class="flex items-center justify-between gap-4">
        <h3 id="active-tasks-heading" class="text-lg font-semibold">
          In progress
        </h3>
        <Badge variant="outline">{{ activeRows.length }}</Badge>
      </div>

      <div
        v-if="!loaded && loading && !activeRows.length"
        role="status"
        class="flex items-center gap-2 rounded-lg border bg-card p-4 text-sm text-card-foreground"
      >
        <PeridotSpinner class="size-5" />
        Loading tasks
      </div>
      <div v-else-if="activeRows.length" class="space-y-3">
        <article
          v-for="task in activeRows"
          :key="task.id"
          class="rounded-lg border bg-card p-4 text-card-foreground"
        >
          <div class="flex items-start gap-4">
            <ProgressCircle
              size="sm"
              :value="taskCircleProgress(task)"
              :label="`Progress for ${task.title}`"
              class="mt-0.5 size-6"
            />
            <div class="min-w-0 flex-1">
              <div class="flex flex-wrap items-start justify-between gap-2">
                <div class="min-w-0">
                  <h4 class="truncate text-sm font-semibold">
                    {{ task.title }}
                  </h4>
                  <p class="mt-1 text-xs text-muted-foreground">
                    {{ taskKindLabel(task) }}
                    <template v-if="task.source?.name">
                      · {{ task.source.name }}
                    </template>
                  </p>
                </div>
                <Badge variant="outline" :class="taskStatusClass(task.status)">
                  {{ taskStatusLabel(task) }}
                </Badge>
              </div>
              <div
                class="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground"
              >
                <span class="font-medium text-foreground">
                  {{ taskProgressLabel(task) }}
                </span>
                <time :datetime="task.startedAt ?? task.createdAt">
                  {{ taskTimeLabel(task) }}
                </time>
              </div>
            </div>
          </div>
        </article>
      </div>
      <p
        v-else
        class="rounded-lg border bg-card p-4 text-sm text-muted-foreground"
      >
        No tasks are running or queued.
      </p>
    </section>

    <section aria-labelledby="task-history-heading" class="space-y-4">
      <h3 id="task-history-heading" class="text-lg font-semibold">History</h3>

      <div
        v-if="historyLoading && !history.length"
        role="status"
        class="flex items-center gap-2 rounded-lg border bg-card p-4 text-sm text-card-foreground"
      >
        <PeridotSpinner class="size-5" />
        Loading task history
      </div>
      <div v-else-if="history.length" class="space-y-3">
        <article
          v-for="task in history"
          :key="task.id"
          class="rounded-lg border bg-card p-4 text-card-foreground"
        >
          <div class="flex flex-wrap items-start justify-between gap-2">
            <div class="min-w-0">
              <h4 class="truncate text-sm font-semibold">{{ task.title }}</h4>
              <p class="mt-1 text-xs text-muted-foreground">
                {{ taskKindLabel(task) }}
                <template v-if="task.source?.name">
                  · {{ task.source.name }}
                </template>
              </p>
            </div>
            <Badge variant="outline" :class="taskStatusClass(task.status)">
              {{ taskStatusLabel(task) }}
            </Badge>
          </div>

          <p
            v-if="task.failureSummary"
            role="alert"
            class="mt-3 text-sm text-destructive"
          >
            {{ task.failureSummary }}
          </p>
          <dl
            v-if="visibleDetails(task).length"
            class="mt-3 flex flex-wrap gap-x-4 gap-y-2 text-xs"
          >
            <div
              v-for="detail in visibleDetails(task)"
              :key="detail.key"
              class="flex gap-1"
            >
              <dt class="text-muted-foreground">{{ detail.label }}:</dt>
              <dd class="font-medium">{{ detail.value }}</dd>
            </div>
          </dl>
          <time
            :datetime="task.completedAt ?? task.createdAt"
            class="mt-3 block text-xs text-muted-foreground"
          >
            {{ taskTimeLabel(task) }}
          </time>
        </article>

        <Button
          v-if="historyHasMore"
          type="button"
          variant="outline"
          :disabled="historyLoading"
          @click="loadMoreHistory"
        >
          {{ historyLoading ? "Loading older tasks…" : "Load older tasks" }}
        </Button>
      </div>
      <p
        v-else-if="historyError"
        role="alert"
        class="rounded-lg border bg-card p-4 text-sm text-destructive"
      >
        {{ historyError }}
      </p>
      <p
        v-else-if="historyLoaded"
        class="rounded-lg border bg-card p-4 text-sm text-muted-foreground"
      >
        No completed task history is available.
      </p>
      <p
        v-if="historyError && history.length"
        role="alert"
        class="text-sm text-destructive"
      >
        {{ historyError }}
      </p>
    </section>
  </template>
</template>
