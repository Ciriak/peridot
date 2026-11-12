<script setup lang="ts">
import { computed, definePageMeta, onMounted, useI18n, watch } from "#imports";
import {
  TASK_ACTIVE_METADATA_PROVIDER_DETAIL_KEY,
  type TaskResponse,
  type TaskStatus,
} from "@peridot/contracts";
import { Badge } from "@peridot/ui/components/ui/badge";
import { Button } from "@peridot/ui/components/ui/button";
import { ProgressCircle } from "@peridot/ui/components/ui/progress-circle";
import { PeridotSpinner } from "@peridot/ui/components/ui/spinner";
import { useServer } from "../../composables/use-server";
import { useSession } from "../../composables/use-session";
import { useTaskHistoryQuery } from "../../composables/use-admin-queries";
import { useTasks } from "../../composables/use-tasks";
import { useUser } from "../../composables/use-user";
import { useLocalizedMessage } from "../../composables/use-localized-message";
import {
  activeTaskPercent,
  isActiveTaskStatus,
  orderedActiveTasks,
  taskProgressMessage,
  taskStatusMessage,
} from "../../lib/task-progress";

definePageMeta({ layout: "settings" });

const { t, d } = useI18n();
const { translate } = useLocalizedMessage();

const { address } = useServer();
const { token } = useSession();
const { user } = useUser();
const { tasks, activeTasks, loading, loaded, refresh } = useTasks();
const canManageTasks = computed(() => user.value?.role === "admin");
const historyQuery = useTaskHistoryQuery();
const history = historyQuery.items;
const historyLoading = historyQuery.loading;
const historyLoaded = historyQuery.loaded;
const historyHasMore = historyQuery.hasMore;
const historyError = computed(() => historyQuery.error.value ?? "");
const previousStatuses = new Map<string, TaskStatus>();

const activeRows = computed(() => orderedActiveTasks(activeTasks.value));

function taskKindLabel(task: TaskResponse): string {
  if (task.kind === "library_scan") return t("settings.tasks.libraryScan");
  if (task.kind === "metadata_fetch") return t("settings.tasks.metadataMatch");
  return t("settings.tasks.pluginTask");
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
    return t("settings.tasks.started", {
      date: d(new Date(task.startedAt), "medium"),
    });
  }
  if (task.completedAt) {
    return t(
      task.status === "completed"
        ? "settings.tasks.completed"
        : "settings.tasks.ended",
      { date: d(new Date(task.completedAt), "medium") },
    );
  }
  return t("settings.tasks.queued", {
    date: d(new Date(task.createdAt), "medium"),
  });
}

function visibleDetails(task: TaskResponse) {
  return task.details.filter(
    (detail) =>
      detail.key !== "source" &&
      detail.key !== TASK_ACTIVE_METADATA_PROVIDER_DETAIL_KEY &&
      !detail.key.startsWith("progress."),
  );
}

async function refreshHistory() {
  if (!canManageTasks.value) return;
  await historyQuery.refresh();
}

async function loadMoreHistory() {
  if (!canManageTasks.value) return;
  await historyQuery.loadMore();
}

watch([address, token, user], () => {
  previousStatuses.clear();
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
    <h2 class="text-2xl font-semibold tracking-tight">
      {{ t("settings.tasks.title") }}
    </h2>
    <p class="text-sm text-muted-foreground">
      {{ t("settings.tasks.description") }}
    </p>
  </div>

  <section
    v-if="!canManageTasks"
    role="alert"
    class="rounded-lg border bg-card p-6 text-sm text-card-foreground"
  >
    {{ t("settings.tasks.adminRequired") }}
  </section>

  <template v-else>
    <section aria-labelledby="active-tasks-heading" class="space-y-4">
      <div class="flex items-center justify-between gap-4">
        <h3 id="active-tasks-heading" class="text-lg font-semibold">
          {{ t("settings.tasks.inProgress") }}
        </h3>
        <Badge variant="outline">{{ activeRows.length }}</Badge>
      </div>

      <div
        v-if="!loaded && loading && !activeRows.length"
        role="status"
        class="flex items-center gap-2 rounded-lg border bg-card p-4 text-sm text-card-foreground"
      >
        <PeridotSpinner :label="t('settings.tasks.loading')" class="size-5" />
        {{ t("settings.tasks.loading") }}
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
              :label="
                t('settings.tasks.progressFor', {
                  title: translate(task.titleMessage),
                })
              "
              class="mt-0.5 size-6"
            />
            <div class="min-w-0 flex-1">
              <div class="flex flex-wrap items-start justify-between gap-2">
                <div class="min-w-0">
                  <h4 class="truncate text-sm font-semibold">
                    {{ translate(task.titleMessage) }}
                  </h4>
                  <p class="mt-1 text-xs text-muted-foreground">
                    {{ taskKindLabel(task) }}
                    <template v-if="task.source?.name">
                      · {{ task.source.name }}
                    </template>
                  </p>
                </div>
                <Badge variant="outline" :class="taskStatusClass(task.status)">
                  {{ translate(taskStatusMessage(task)) }}
                </Badge>
              </div>
              <div
                class="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground"
              >
                <span class="font-medium text-foreground">
                  {{ translate(taskProgressMessage(task)) }}
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
        {{ t("settings.tasks.noneActive") }}
      </p>
    </section>

    <section aria-labelledby="task-history-heading" class="space-y-4">
      <h3 id="task-history-heading" class="text-lg font-semibold">
        {{ t("settings.tasks.history") }}
      </h3>

      <div
        v-if="historyLoading && !history.length"
        role="status"
        class="flex items-center gap-2 rounded-lg border bg-card p-4 text-sm text-card-foreground"
      >
        <PeridotSpinner
          :label="t('settings.tasks.loadingHistory')"
          class="size-5"
        />
        {{ t("settings.tasks.loadingHistory") }}
      </div>
      <div v-else-if="history.length" class="space-y-3">
        <article
          v-for="task in history"
          :key="task.id"
          class="rounded-lg border bg-card p-4 text-card-foreground"
        >
          <div class="flex flex-wrap items-start justify-between gap-2">
            <div class="min-w-0">
              <h4 class="truncate text-sm font-semibold">
                {{ translate(task.titleMessage) }}
              </h4>
              <p class="mt-1 text-xs text-muted-foreground">
                {{ taskKindLabel(task) }}
                <template v-if="task.source?.name">
                  · {{ task.source.name }}
                </template>
              </p>
            </div>
            <Badge variant="outline" :class="taskStatusClass(task.status)">
              {{ translate(taskStatusMessage(task)) }}
            </Badge>
          </div>

          <p
            v-if="task.failureMessage"
            role="alert"
            class="mt-3 text-sm text-destructive"
          >
            {{ translate(task.failureMessage) }}
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
              <dt class="text-muted-foreground">
                {{ translate(detail.labelMessage) }}:
              </dt>
              <dd class="font-medium">
                {{
                  detail.valueMessage
                    ? translate(detail.valueMessage)
                    : detail.value
                }}
              </dd>
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
          {{
            historyLoading
              ? t("settings.tasks.loadingOlder")
              : t("settings.tasks.loadOlder")
          }}
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
        {{ t("settings.tasks.emptyHistory") }}
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
