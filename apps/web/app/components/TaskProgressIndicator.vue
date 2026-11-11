<script setup lang="ts">
import { Icon } from "@iconify/vue/offline";
import { ProgressCircle } from "@peridot/ui/components/ui/progress-circle";
import {
  TooltipContent,
  TooltipPortal,
  TooltipProvider,
  TooltipRoot,
  TooltipTrigger,
} from "reka-ui";
import { computed } from "vue";
import { useServerConnection } from "../composables/use-server-connection";
import { useTasks } from "../composables/use-tasks";
import { icons } from "../lib/icons";
import { topbarStatus } from "../lib/server-connection";
import {
  orderedActiveTasks,
  overallTaskProgress,
  taskProgressLabel,
  taskStatusLabel,
} from "../lib/task-progress";

const { activeTasks, hasActiveTasks } = useTasks();
const { status: connectionStatus } = useServerConnection();
const taskRows = computed(() => orderedActiveTasks(activeTasks.value));
const overallProgress = computed(() => overallTaskProgress(taskRows.value));
const status = computed(() =>
  topbarStatus(connectionStatus.value, hasActiveTasks.value),
);
const progressLabel = computed(() => {
  const count = taskRows.value.length;
  const tasksLabel = `${count} ${count === 1 ? "task" : "tasks"}`;
  if (overallProgress.value === null) {
    return `Overall task progress unavailable for ${tasksLabel}`;
  }
  return `Overall task progress: ${Math.round(overallProgress.value)}% across ${tasksLabel}`;
});
</script>

<template>
  <TooltipProvider v-if="status === 'connection-lost'" :delay-duration="150">
    <TooltipRoot>
      <TooltipTrigger as-child>
        <Icon
          :icon="icons.cloudOff"
          role="img"
          tabindex="0"
          aria-label="Server connection lost"
          class="size-4 text-destructive motion-safe:animate-pulse focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        />
      </TooltipTrigger>
      <TooltipPortal>
        <TooltipContent
          side="bottom"
          align="end"
          :side-offset="6"
          class="z-50 w-64 rounded-md border border-destructive/60 bg-popover p-3 text-popover-foreground shadow-md"
        >
          <p class="text-sm font-semibold text-destructive">
            Server connection lost
          </p>
          <p class="mt-1 text-xs text-muted-foreground">
            Peridot cannot reach your configured server. It will reconnect
            automatically.
          </p>
        </TooltipContent>
      </TooltipPortal>
    </TooltipRoot>
  </TooltipProvider>
  <TooltipProvider v-else-if="status === 'task-progress'" :delay-duration="150">
    <TooltipRoot>
      <TooltipTrigger as-child>
        <NuxtLink
          to="/settings/tasks"
          aria-label="Open task activity"
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
            <p class="text-sm font-semibold">Tasks</p>
            <span class="text-xs text-muted-foreground">
              {{ taskRows.length }} active
            </span>
          </div>
          <ul class="max-h-64 space-y-1 overflow-y-auto pr-1">
            <li
              v-for="task in taskRows"
              :key="task.id"
              class="rounded-md px-1 py-1.5"
            >
              <p class="truncate text-sm font-medium">{{ task.title }}</p>
              <p class="text-xs text-muted-foreground">
                <span
                  :class="
                    task.status === 'running'
                      ? 'font-medium text-primary'
                      : 'font-medium'
                  "
                  >{{ taskStatusLabel(task) }}</span
                >
                · {{ taskProgressLabel(task) }}
              </p>
            </li>
          </ul>
        </TooltipContent>
      </TooltipPortal>
    </TooltipRoot>
  </TooltipProvider>
</template>
