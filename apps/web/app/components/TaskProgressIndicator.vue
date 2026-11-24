<script setup lang="ts">
import { ProgressCircle } from "@peridot/ui/components/ui/progress-circle";
import {
  TooltipContent,
  TooltipPortal,
  TooltipProvider,
  TooltipRoot,
  TooltipTrigger,
} from "reka-ui";
import { computed } from "vue";
import { useLocalizedMessage } from "../composables/use-localized-message";
import { useOfflineDownloadTasks } from "../composables/use-offline-download-tasks";
import { useTasks } from "../composables/use-tasks";
import { useUser } from "../composables/use-user";
import {
  activeTaskPercent,
  groupedTaskProgress,
  orderedActiveTasks,
  taskProgressMessage,
  taskStatusMessage,
} from "../lib/task-progress";

interface TaskProgressRow {
  key: string;
  title: string;
  statusLabel: string;
  progressLabel: string;
  progress: number | null;
  running: boolean;
  status: string;
  createdAt: string;
}

const { t, translate } = useLocalizedMessage();
const { activeTasks: serverActiveTasks } = useTasks();
const downloadTasks = useOfflineDownloadTasks();
const { user } = useUser();
const canViewServerTasks = computed(() => user.value?.role === "admin");
const visibleServerTasks = computed(() =>
  serverActiveTasks.value.filter(
    (task) =>
      canViewServerTasks.value ||
      (task.kind === "release_import" && task.ownerUserId === user.value?.id),
  ),
);
const rows = computed<TaskProgressRow[]>(() => {
  const rank = (status: string) =>
    status === "running"
      ? 0
      : status === "waiting"
        ? 1
        : status === "queued"
          ? 2
          : 3;
  return [
    ...orderedActiveTasks(visibleServerTasks.value).map((task) => ({
      key: `server:${task.id}`,
      title: translate(task.titleMessage),
      statusLabel: translate(taskStatusMessage(task)),
      progressLabel: translate(taskProgressMessage(task)),
      progress: activeTaskPercent(task),
      running: task.status === "running" || task.status === "waiting",
      status: task.status,
      createdAt: task.createdAt,
    })),
    ...downloadTasks
      .orderedTasks()
      .filter(downloadTasks.isActive)
      .map((task) => ({
        key: `download:${task.id}`,
        title: translate(task.titleMessage),
        statusLabel: t(`downloadTasks.status.${task.status}`),
        progressLabel:
          task.progress.total === null
            ? t("downloadTasks.preparing")
            : t("downloadTasks.progress", {
                completed: task.progress.completed,
                total: task.progress.total,
              }),
        progress: downloadTasks.progressForTask(task),
        running: task.status === "running",
        status: task.status,
        createdAt: task.createdAt,
      })),
  ].sort((left, right) => {
    const statusDifference = rank(left.status) - rank(right.status);
    if (statusDifference !== 0) return statusDifference;
    return (
      new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime()
    );
  });
});
const overallProgress = computed(() => groupedTaskProgress(rows.value));
const progressLabel = computed(() => {
  const count = rows.value.length;
  if (overallProgress.value === null) {
    return t("components.taskProgress.unavailable", { count }, count);
  }
  return t(
    "components.taskProgress.overall",
    { count, percent: Math.round(overallProgress.value) },
    count,
  );
});
</script>

<template>
  <TooltipProvider v-if="rows.length" :delay-duration="150">
    <TooltipRoot>
      <TooltipTrigger as-child>
        <NuxtLink
          to="/settings/tasks#active-tasks"
          :aria-label="t('components.taskProgress.open')"
          class="flex size-6 items-center justify-center rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        >
          <ProgressCircle
            size="sm"
            :value="overallProgress"
            :label="progressLabel"
            class="size-4"
          />
        </NuxtLink>
      </TooltipTrigger>
      <TooltipPortal>
        <TooltipContent
          side="bottom"
          align="end"
          :side-offset="6"
          class="z-50 w-72 rounded-md border bg-popover p-3 text-popover-foreground shadow-md"
        >
          <div class="mb-2 flex items-center justify-between gap-3">
            <p class="text-sm font-semibold">{{ t("settings.tasks.title") }}</p>
            <span class="text-xs text-muted-foreground">
              {{
                t(
                  "components.taskProgress.active",
                  { count: rows.length },
                  rows.length,
                )
              }}
            </span>
          </div>
          <ul class="max-h-64 space-y-1 overflow-y-auto pr-1">
            <li
              v-for="row in rows"
              :key="row.key"
              class="rounded-md px-1 py-1.5"
            >
              <p class="truncate text-sm font-medium">
                {{ row.title }}
              </p>
              <p class="text-xs text-muted-foreground">
                <span
                  :class="
                    row.running ? 'font-medium text-primary' : 'font-medium'
                  "
                  >{{ row.statusLabel }}</span
                >
                · {{ row.progressLabel }}
              </p>
            </li>
          </ul>
        </TooltipContent>
      </TooltipPortal>
    </TooltipRoot>
  </TooltipProvider>
</template>
