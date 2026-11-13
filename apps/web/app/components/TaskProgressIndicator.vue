<script setup lang="ts">
import { Icon } from "@iconify/vue/offline";
import { Badge } from "@peridot/ui/components/ui/badge";
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
import { useServerConnection } from "../composables/use-server-connection";
import { useTasks } from "../composables/use-tasks";
import { useUser } from "../composables/use-user";
import { icons } from "../lib/icons";
import { topbarStatus } from "../lib/server-connection";
import {
  orderedActiveTasks,
  overallTaskProgress,
  taskProgressMessage,
  taskStatusMessage,
} from "../lib/task-progress";

const { t, translate } = useLocalizedMessage();
const { activeTasks, hasActiveTasks } = useTasks();
const { status: connectionStatus } = useServerConnection();
const { user } = useUser();
const canViewTaskProgress = computed(() => user.value?.role === "admin");
const taskRows = computed(() => orderedActiveTasks(activeTasks.value));
const overallProgress = computed(() => overallTaskProgress(taskRows.value));
const status = computed(() =>
  topbarStatus(connectionStatus.value, hasActiveTasks.value),
);
const progressLabel = computed(() => {
  const count = taskRows.value.length;
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
  <TooltipProvider v-if="status === 'connection-lost'" :delay-duration="150">
    <TooltipRoot>
      <TooltipTrigger as-child>
        <Badge
          variant="outline"
          role="status"
          tabindex="0"
          :aria-label="t('components.taskProgress.connectionLost')"
          class="cursor-default text-foreground"
        >
          <Icon :icon="icons.networkOff" aria-hidden="true" />
          {{ t("components.taskProgress.offlineBadge") }}
        </Badge>
      </TooltipTrigger>
      <TooltipPortal>
        <TooltipContent
          side="bottom"
          align="end"
          :side-offset="6"
          class="z-50 w-64 rounded-md border bg-popover p-3 text-popover-foreground shadow-md"
        >
          <p class="text-sm font-semibold">
            {{ t("components.taskProgress.connectionLost") }}
          </p>
          <p class="mt-1 text-xs text-muted-foreground">
            {{ t("components.taskProgress.connectionLostDescription") }}
          </p>
        </TooltipContent>
      </TooltipPortal>
    </TooltipRoot>
  </TooltipProvider>
  <TooltipProvider
    v-else-if="canViewTaskProgress && status === 'task-progress'"
    :delay-duration="150"
  >
    <TooltipRoot>
      <TooltipTrigger as-child>
        <NuxtLink
          to="/settings/tasks"
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
                  { count: taskRows.length },
                  taskRows.length,
                )
              }}
            </span>
          </div>
          <ul class="max-h-64 space-y-1 overflow-y-auto pr-1">
            <li
              v-for="task in taskRows"
              :key="task.id"
              class="rounded-md px-1 py-1.5"
            >
              <p class="truncate text-sm font-medium">
                {{ translate(task.titleMessage) }}
              </p>
              <p class="text-xs text-muted-foreground">
                <span
                  :class="
                    task.status === 'running'
                      ? 'font-medium text-primary'
                      : 'font-medium'
                  "
                  >{{ translate(taskStatusMessage(task)) }}</span
                >
                · {{ translate(taskProgressMessage(task)) }}
              </p>
            </li>
          </ul>
        </TooltipContent>
      </TooltipPortal>
    </TooltipRoot>
  </TooltipProvider>
</template>
