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
import { useOfflineDownloadTasks } from "../composables/use-offline-download-tasks";
import { useLocalizedMessage } from "../composables/use-localized-message";

const { translate, t } = useLocalizedMessage();
const { activeTasks, activeProgress } = useOfflineDownloadTasks();
const visible = computed(() => activeTasks.value.length > 0);
const label = computed(() =>
  t("downloadTasks.progressFor", {
    count: activeTasks.value.length,
  }),
);
</script>

<template>
  <TooltipProvider v-if="visible" :delay-duration="150">
    <TooltipRoot>
      <TooltipTrigger as-child>
        <NuxtLink
          to="/settings/library#download-tasks"
          :aria-label="t('downloadTasks.open')"
          class="flex size-8 items-center justify-center rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        >
          <ProgressCircle
            size="sm"
            :value="activeProgress"
            :label="label"
            class="size-5"
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
            <p class="text-sm font-semibold">
              {{ t("downloadTasks.title") }}
            </p>
            <span class="text-xs text-muted-foreground">
              {{ label }}
            </span>
          </div>
          <ul class="max-h-64 space-y-1 overflow-y-auto pr-1">
            <li
              v-for="task in activeTasks"
              :key="task.id"
              class="rounded-md px-1 py-1.5"
            >
              <p class="truncate text-sm font-medium">
                {{ translate(task.titleMessage) }}
              </p>
              <p class="text-xs text-muted-foreground">
                {{ t(`downloadTasks.status.${task.status}`) }}
              </p>
            </li>
          </ul>
        </TooltipContent>
      </TooltipPortal>
    </TooltipRoot>
  </TooltipProvider>
</template>
