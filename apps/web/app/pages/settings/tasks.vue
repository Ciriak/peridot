<script setup lang="ts">
import {
  computed,
  definePageMeta,
  onMounted,
  ref,
  useI18n,
  watch,
} from "#imports";
import { Icon } from "@iconify/vue/offline";
import { useIntervalFn, useNow } from "@vueuse/core";
import {
  TASK_ACTIVE_METADATA_PROVIDER_DETAIL_KEY,
  type TaskResponse,
  type TaskStatus,
} from "@peridot/contracts";
import { Badge } from "@peridot/ui/components/ui/badge";
import { Button } from "@peridot/ui/components/ui/button";
import { ProgressCircle } from "@peridot/ui/components/ui/progress-circle";
import { PeridotSpinner } from "@peridot/ui/components/ui/spinner";
import AutoLoadMore from "../../components/AutoLoadMore.vue";
import { useOfflineDownloadTasks } from "../../composables/use-offline-download-tasks";
import { useServer } from "../../composables/use-server";
import { useServerConnection } from "../../composables/use-server-connection";
import { useSession } from "../../composables/use-session";
import { useTaskHistoryQuery } from "../../composables/use-admin-queries";
import { useTasks } from "../../composables/use-tasks";
import { useUser } from "../../composables/use-user";
import { useLocalizedMessage } from "../../composables/use-localized-message";
import {
  isDownloadTaskTerminal,
  type DownloadTask,
  type DownloadTaskStatus,
} from "../../lib/download-tasks";
import { icons } from "../../lib/icons";
import {
  activeTaskPercent,
  estimatedRemainingMs,
  estimatedTaskRemainingMs,
  isActiveTaskStatus,
  orderedActiveTasks,
  taskProgressMessage,
  taskStatusMessage,
} from "../../lib/task-progress";
import {
  formatRemainingDuration,
  formatTimeAgo,
} from "../../lib/relative-time";
import { isAuthenticationRedirectError } from "../../lib/peridot-client";

definePageMeta({ layout: "settings" });

type TaskRowSource = "server" | "download";
type TaskRowAction = "cancel" | "stop" | "retry";

interface TaskRowDetail {
  key: string;
  label: string;
  value: string;
}

interface TaskRow {
  key: string;
  id: string;
  source: TaskRowSource;
  title: string;
  context: string;
  status: TaskStatus | DownloadTaskStatus;
  statusLabel: string;
  statusClass: string;
  progress: number | null;
  progressLabel: string;
  action: TaskRowAction | null;
  actionLabel: string;
  actionAriaLabel: string;
  actionDisabled: boolean;
  failureMessage: string | null;
  timeDateTime: string | null;
  timeLabel: string | null;
  timeTitle: string | null;
  details: TaskRowDetail[];
  createdAt: string;
  sortTimestamp: string;
}

const { t, d, locale } = useI18n();
const { errorMessage, translate } = useLocalizedMessage();
const now = useNow({
  scheduler: (update) => useIntervalFn(update, 10_000, { immediate: true }),
});

const { address } = useServer();
const { token } = useSession();
const { status: serverStatus } = useServerConnection();
const { user } = useUser();
const {
  tasks,
  activeTasks,
  loading,
  loaded,
  refresh,
  isCancellingTask,
  cancelTask,
} = useTasks();
const downloadTasks = useOfflineDownloadTasks();
const canManageTasks = computed(() => user.value?.role === "admin");
const visibleServerActiveTasks = computed(() =>
  canManageTasks.value
    ? activeTasks.value
    : activeTasks.value.filter((task) => task.kind === "release_import"),
);
const serverLost = computed(() => serverStatus.value === "lost");
const taskActionError = ref("");
const historyQuery = useTaskHistoryQuery();
const history = historyQuery.items;
const historyLoading = historyQuery.loading;
const historyLoaded = historyQuery.loaded;
const historyHasMore = historyQuery.hasMore;
const historyError = computed(() => historyQuery.error.value ?? "");
const previousStatuses = new Map<string, TaskStatus>();

function taskKindLabel(task: TaskResponse): string {
  if (task.kind === "release_import") return t("settings.tasks.releaseImport");
  if (task.kind === "library_scan") return t("settings.tasks.libraryScan");
  if (task.kind === "catalog_fetch")
    return t("settings.tasks.catalogProjection");
  if (task.kind === "metadata_fetch") return t("settings.tasks.metadataMatch");
  if (task.kind === "artwork_fetch") return t("settings.tasks.artworkFetch");
  if (task.kind === "duplicate_detection")
    return t("settings.tasks.duplicateDetection");
  return task.kind;
}

function taskStatusClass(status: TaskStatus | DownloadTaskStatus): string {
  switch (status) {
    case "running":
      return "border-primary text-primary";
    case "waiting":
      return "border-primary text-primary";
    case "queued":
      return "text-secondary-foreground";
    case "paused":
    case "completed_with_errors":
      return "border-warning text-warning";
    case "completed":
      return "border-success text-success";
    case "failed":
    case "interrupted":
    case "stopped":
    case "cancelled":
      return "border-destructive text-destructive";
  }
}

function serverTaskStatusClass(task: TaskResponse): string {
  return taskStatusClass(
    task.status === "completed" && task.failureMessage
      ? "completed_with_errors"
      : task.status,
  );
}

function taskFailureMessageClass(row: TaskRow): string {
  return row.status === "completed" || row.status === "completed_with_errors"
    ? "text-warning"
    : "text-destructive";
}

function serverTaskContext(task: TaskResponse): string {
  const kind = taskKindLabel(task);
  return task.source?.name ? `${kind} · ${task.source.name}` : kind;
}

function serverQueuedLabel(task: TaskResponse): string {
  return t("settings.tasks.queued", {
    date: d(new Date(task.createdAt), "medium"),
  });
}

function serverWaitingLabel(task: TaskResponse): string {
  return t("settings.tasks.waitingSince", {
    date: d(new Date(task.createdAt), "medium"),
  });
}

function serverRemainingLabel(task: TaskResponse): string | null {
  const remaining = estimatedTaskRemainingMs(task, now.value);
  if (remaining === null) return null;
  return t("settings.tasks.remaining", {
    duration: formatRemainingDuration(
      remaining,
      locale.value,
      t("settings.tasks.lessThanMinute"),
    ),
  });
}

function downloadRemainingLabel(task: DownloadTask): string | null {
  if (task.progress.total === null) return null;
  const remaining = estimatedRemainingMs(
    task.startedAt,
    task.progress.completed,
    task.progress.total,
    now.value,
  );
  if (remaining === null) return null;
  return t("settings.tasks.remaining", {
    duration: formatRemainingDuration(
      remaining,
      locale.value,
      t("settings.tasks.lessThanMinute"),
    ),
  });
}

function downloadQueuedLabel(task: DownloadTask): string {
  return t("settings.tasks.queued", {
    date: d(new Date(task.createdAt), "medium"),
  });
}

function downloadProgressLabel(task: DownloadTask): string {
  return task.progress.total === null
    ? t("downloadTasks.preparing")
    : t("downloadTasks.progress", {
        completed: task.progress.completed,
        total: task.progress.total,
      });
}

function serverActiveRow(task: TaskResponse): TaskRow {
  const waiting = task.status === "waiting";
  const queued = task.status === "queued";
  const cancellable = waiting || queued;
  const remaining = serverRemainingLabel(task);
  const canControlTask =
    canManageTasks.value || task.ownerUserId === user.value?.id;
  const action = canControlTask ? (cancellable ? "cancel" : "stop") : null;
  return {
    key: `server:${task.id}`,
    id: task.id,
    source: "server",
    title: translate(task.titleMessage),
    context: serverTaskContext(task),
    status: task.status,
    statusLabel: translate(taskStatusMessage(task)),
    statusClass: serverTaskStatusClass(task),
    progress:
      task.status === "running" || cancellable ? activeTaskPercent(task) : null,
    progressLabel: translate(taskProgressMessage(task)),
    action,
    actionLabel:
      action === null
        ? ""
        : t(
            action === "stop"
              ? isCancellingTask(task.id)
                ? "settings.tasks.stopping"
                : "settings.tasks.stop"
              : "common.cancel",
          ),
    actionAriaLabel: t("settings.tasks.cancelTask", {
      title: translate(task.titleMessage),
    }),
    actionDisabled:
      action === null || isCancellingTask(task.id) || serverLost.value,
    failureMessage: task.failureMessage ? translate(task.failureMessage) : null,
    timeDateTime: cancellable ? task.createdAt : null,
    timeLabel: waiting
      ? serverWaitingLabel(task)
      : queued
        ? serverQueuedLabel(task)
        : remaining,
    timeTitle: null,
    details: [],
    createdAt: task.createdAt,
    sortTimestamp: task.createdAt,
  };
}

function downloadActiveRow(task: DownloadTask): TaskRow {
  const queued = task.status === "queued" || task.status === "paused";
  return {
    key: `download:${task.id}`,
    id: task.id,
    source: "download",
    title: translate(task.titleMessage),
    context: t("downloadTasks.kind"),
    status: task.status,
    statusLabel: t(`downloadTasks.status.${task.status}`),
    statusClass: taskStatusClass(task.status),
    progress: downloadTasks.progressForTask(task),
    progressLabel: downloadProgressLabel(task),
    action: task.status === "running" ? "stop" : "cancel",
    actionLabel: t(
      task.status === "running" ? "downloadTasks.stop" : "downloadTasks.cancel",
    ),
    actionAriaLabel: t("downloadTasks.cancelTask", {
      title: translate(task.titleMessage),
    }),
    actionDisabled: false,
    failureMessage: task.failureMessage,
    timeDateTime: queued ? task.createdAt : null,
    timeLabel:
      task.status === "running"
        ? downloadRemainingLabel(task)
        : downloadQueuedLabel(task),
    timeTitle: null,
    details: [],
    createdAt: task.createdAt,
    sortTimestamp: task.createdAt,
  };
}

function visibleDetails(task: TaskResponse) {
  return task.details.filter(
    (detail) =>
      detail.key !== "source" &&
      !detail.key.startsWith("release.internal") &&
      detail.key !== TASK_ACTIVE_METADATA_PROVIDER_DETAIL_KEY &&
      !detail.key.startsWith("progress."),
  );
}

function serverHistoryRow(task: TaskResponse): TaskRow {
  const timestamp = task.completedAt ?? task.createdAt;
  return {
    key: `server:${task.id}`,
    id: task.id,
    source: "server",
    title: translate(task.titleMessage),
    context: serverTaskContext(task),
    status: task.status,
    statusLabel: translate(taskStatusMessage(task)),
    statusClass: serverTaskStatusClass(task),
    progress: null,
    progressLabel: "",
    action: null,
    actionLabel: "",
    actionAriaLabel: "",
    actionDisabled: false,
    failureMessage: task.failureMessage ? translate(task.failureMessage) : null,
    timeDateTime: timestamp,
    timeLabel: formatTimeAgo(timestamp, now.value, locale.value),
    timeTitle: d(new Date(timestamp), "medium"),
    details: visibleDetails(task).map((detail) => ({
      key: detail.key,
      label: translate(detail.labelMessage),
      value: detail.valueMessage
        ? translate(detail.valueMessage)
        : detail.value,
    })),
    createdAt: task.createdAt,
    sortTimestamp: timestamp,
  };
}

function downloadHistoryRow(task: DownloadTask): TaskRow {
  const timestamp = task.completedAt ?? task.updatedAt;
  return {
    key: `download:${task.id}`,
    id: task.id,
    source: "download",
    title: translate(task.titleMessage),
    context: t("downloadTasks.kind"),
    status: task.status,
    statusLabel: t(`downloadTasks.status.${task.status}`),
    statusClass: taskStatusClass(task.status),
    progress: null,
    progressLabel: "",
    action:
      task.status === "failed" || task.status === "completed_with_errors"
        ? "retry"
        : null,
    actionLabel: t("downloadTasks.retry"),
    actionAriaLabel: t("downloadTasks.retryTask", {
      title: translate(task.titleMessage),
    }),
    actionDisabled: false,
    failureMessage: task.failureMessage,
    timeDateTime: timestamp,
    timeLabel: formatTimeAgo(timestamp, now.value, locale.value),
    timeTitle: d(new Date(timestamp), "medium"),
    details: [],
    createdAt: task.createdAt,
    sortTimestamp: timestamp,
  };
}

const activeRows = computed(() => {
  const rank = (row: TaskRow) =>
    row.status === "running"
      ? 0
      : row.status === "waiting"
        ? 1
        : row.status === "queued"
          ? 2
          : 3;
  return [
    ...orderedActiveTasks(visibleServerActiveTasks.value).map(serverActiveRow),
    ...downloadTasks
      .orderedTasks()
      .filter(downloadTasks.isActive)
      .map(downloadActiveRow),
  ].sort((left, right) => {
    const statusDifference = rank(left) - rank(right);
    if (statusDifference !== 0) return statusDifference;
    return (
      new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime()
    );
  });
});
const activityLoading = computed(
  () =>
    activeRows.value.length === 0 &&
    (!downloadTasks.loaded.value || (!loaded.value && loading.value)),
);
const serverHistoryRows = computed(() =>
  canManageTasks.value
    ? history.value.map(serverHistoryRow)
    : tasks.value
        .filter(
          (task) =>
            task.kind === "release_import" && !isActiveTaskStatus(task.status),
        )
        .slice(0, 20)
        .map(serverHistoryRow),
);
const downloadHistoryRows = computed(() =>
  downloadTasks
    .orderedTasks()
    .filter(isDownloadTaskTerminal)
    .slice(0, 20)
    .map(downloadHistoryRow),
);
const historyRows = computed(() =>
  [...serverHistoryRows.value, ...downloadHistoryRows.value].sort(
    (left, right) =>
      new Date(right.sortTimestamp).getTime() -
      new Date(left.sortTimestamp).getTime(),
  ),
);
const historyPending = computed(
  () =>
    historyRows.value.length === 0 &&
    (!downloadTasks.loaded.value ||
      (!loaded.value && loading.value) ||
      (canManageTasks.value && historyLoading.value)),
);
const historyReady = computed(
  () =>
    downloadTasks.loaded.value &&
    (canManageTasks.value ? historyLoaded.value : loaded.value),
);
const combinedHistoryError = computed(() =>
  canManageTasks.value ? historyError.value : "",
);
const combinedHistoryHasMore = computed(
  () => canManageTasks.value && historyHasMore.value,
);

async function refreshHistory() {
  if (!canManageTasks.value) return;
  await historyQuery.refresh();
}

async function loadMoreHistory() {
  if (!canManageTasks.value) return;
  await historyQuery.loadMore();
}

async function runRowAction(row: TaskRow) {
  if (!row.action) return;
  taskActionError.value = "";
  try {
    if (row.source === "download") {
      if (row.action === "retry") {
        await downloadTasks.retry(row.id);
      } else {
        await downloadTasks.cancel(row.id);
      }
      return;
    }
    await cancelTask(row.id);
  } catch (reason) {
    if (isAuthenticationRedirectError(reason)) return;
    taskActionError.value = errorMessage(
      reason,
      row.source === "download"
        ? "downloadTasks.actionError"
        : row.status === "queued" || row.status === "waiting"
          ? "settings.tasks.cancelError"
          : "settings.tasks.stopError",
    );
  }
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
  void downloadTasks.refresh();
  void refresh().catch(() => {
    // The shared task monitor retries transient status failures.
  });
  if (canManageTasks.value) void refreshHistory();
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

  <p v-if="taskActionError" role="alert" class="text-sm text-destructive">
    {{ taskActionError }}
  </p>

  <section
    id="active-tasks"
    aria-labelledby="active-tasks-heading"
    class="space-y-4"
  >
    <div class="flex items-center justify-between gap-4">
      <h3 id="active-tasks-heading" class="text-lg font-semibold">
        {{ t("settings.tasks.inProgress") }}
      </h3>
      <Badge variant="outline">{{ activeRows.length }}</Badge>
    </div>

    <div
      v-if="activityLoading"
      role="status"
      class="flex items-center gap-2 rounded-lg border bg-card p-4 text-sm text-card-foreground"
    >
      <PeridotSpinner :label="t('settings.tasks.loading')" class="size-5" />
      {{ t("settings.tasks.loading") }}
    </div>
    <div v-else-if="activeRows.length" class="space-y-3">
      <article
        v-for="row in activeRows"
        :key="row.key"
        class="rounded-lg border bg-card p-4 text-card-foreground"
      >
        <div class="flex items-start gap-4">
          <ProgressCircle
            size="sm"
            :value="row.progress"
            :label="
              t('settings.tasks.progressFor', {
                title: row.title,
              })
            "
            class="mt-0.5 size-6"
          />
          <div class="min-w-0 flex-1">
            <div class="flex flex-wrap items-start justify-between gap-2">
              <div class="min-w-0">
                <h4 class="truncate text-sm font-semibold">
                  {{ row.title }}
                </h4>
                <p class="mt-1 text-xs text-muted-foreground">
                  {{ row.context }}
                </p>
              </div>
              <div class="flex flex-wrap items-center justify-end gap-2">
                <Badge variant="outline" :class="row.statusClass">
                  {{ row.statusLabel }}
                </Badge>
                <Button
                  v-if="row.action === 'cancel'"
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  :disabled="row.actionDisabled"
                  :aria-label="row.actionAriaLabel"
                  :title="row.actionAriaLabel"
                  @click="runRowAction(row)"
                >
                  <Icon :icon="icons.close" aria-hidden="true" class="size-5" />
                </Button>
                <Button
                  v-else-if="row.action === 'stop'"
                  type="button"
                  variant="outline"
                  size="sm"
                  :disabled="row.actionDisabled"
                  @click="runRowAction(row)"
                >
                  {{ row.actionLabel }}
                </Button>
              </div>
            </div>
            <p
              v-if="row.failureMessage"
              role="alert"
              class="mt-3 text-sm"
              :class="taskFailureMessageClass(row)"
            >
              {{ row.failureMessage }}
            </p>
            <div
              class="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground"
            >
              <span class="font-medium text-foreground">
                {{ row.progressLabel }}
              </span>
              <time
                v-if="row.timeLabel && row.timeDateTime"
                :datetime="row.timeDateTime"
              >
                {{ row.timeLabel }}
              </time>
              <span v-else-if="row.timeLabel">{{ row.timeLabel }}</span>
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
      v-if="historyPending"
      role="status"
      class="flex items-center gap-2 rounded-lg border bg-card p-4 text-sm text-card-foreground"
    >
      <PeridotSpinner
        :label="t('settings.tasks.loadingHistory')"
        class="size-5"
      />
      {{ t("settings.tasks.loadingHistory") }}
    </div>
    <div v-else-if="historyRows.length" class="space-y-3">
      <article
        v-for="row in historyRows"
        :key="row.key"
        class="rounded-lg border bg-card p-4 text-card-foreground"
      >
        <div class="flex flex-wrap items-start justify-between gap-2">
          <div class="min-w-0">
            <h4 class="truncate text-sm font-semibold">
              {{ row.title }}
            </h4>
            <p class="mt-1 text-xs text-muted-foreground">
              {{ row.context }}
            </p>
          </div>
          <div class="flex flex-wrap items-center justify-end gap-2">
            <Badge variant="outline" :class="row.statusClass">
              {{ row.statusLabel }}
            </Badge>
            <Button
              v-if="row.action === 'retry'"
              type="button"
              variant="outline"
              size="sm"
              :aria-label="row.actionAriaLabel"
              @click="runRowAction(row)"
            >
              {{ row.actionLabel }}
            </Button>
          </div>
        </div>

        <p
          v-if="row.failureMessage"
          role="alert"
          class="mt-3 text-sm"
          :class="taskFailureMessageClass(row)"
        >
          {{ row.failureMessage }}
        </p>
        <dl
          v-if="row.details.length"
          class="mt-3 flex flex-wrap gap-x-4 gap-y-2 text-xs"
        >
          <div
            v-for="detail in row.details"
            :key="detail.key"
            class="flex gap-1"
          >
            <dt class="text-muted-foreground">{{ detail.label }}:</dt>
            <dd class="font-medium">{{ detail.value }}</dd>
          </div>
        </dl>
        <time
          v-if="row.timeLabel && row.timeDateTime"
          :datetime="row.timeDateTime"
          :title="row.timeTitle ?? undefined"
          class="mt-3 block text-xs text-muted-foreground"
        >
          {{ row.timeLabel }}
        </time>
      </article>

      <AutoLoadMore
        :enabled="combinedHistoryHasMore"
        :loading="historyLoading"
        :item-count="historyRows.length"
        :label="t('settings.tasks.loadingOlder')"
        @load="loadMoreHistory"
      />
    </div>
    <p
      v-else-if="combinedHistoryError"
      role="alert"
      class="rounded-lg border bg-card p-4 text-sm text-destructive"
    >
      {{ combinedHistoryError }}
    </p>
    <p
      v-else-if="historyReady"
      class="rounded-lg border bg-card p-4 text-sm text-muted-foreground"
    >
      {{ t("settings.tasks.emptyHistory") }}
    </p>
    <p
      v-if="combinedHistoryError && historyRows.length"
      role="alert"
      class="text-sm text-destructive"
    >
      {{ combinedHistoryError }}
    </p>
  </section>
</template>
