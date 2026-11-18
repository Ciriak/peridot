<script setup lang="ts">
import { useI18n } from "#imports";
import {
  TooltipContent,
  TooltipPortal,
  TooltipProvider,
  TooltipRoot,
  TooltipTrigger,
} from "reka-ui";
import { computed } from "vue";

const props = withDefaults(
  defineProps<{
    active?: boolean;
    label: string;
    progress: number | null;
    side?: "top" | "right" | "bottom" | "left";
    title: string;
    type: "album" | "track";
  }>(),
  {
    active: true,
    side: "top",
  },
);

const { t } = useI18n();
const typeLabel = computed(() =>
  props.type === "album"
    ? t("downloadProgress.album")
    : t("downloadProgress.track"),
);
const progressLabel = computed(() => {
  if (props.progress === null || !Number.isFinite(props.progress)) {
    return t("downloadProgress.starting");
  }
  const percent = Math.min(100, Math.max(0, Math.round(props.progress)));
  return t("downloadProgress.percent", { percent });
});
</script>

<template>
  <TooltipProvider v-if="active" :delay-duration="150">
    <TooltipRoot>
      <TooltipTrigger as-child>
        <slot />
      </TooltipTrigger>
      <TooltipPortal>
        <TooltipContent
          :side="side"
          :side-offset="6"
          class="z-50 w-64 rounded-md border bg-popover p-3 text-popover-foreground shadow-md"
        >
          <div class="flex min-w-0 items-center justify-between gap-3">
            <p class="truncate text-sm font-semibold">{{ title }}</p>
            <span class="shrink-0 text-xs text-muted-foreground">
              {{ typeLabel }}
            </span>
          </div>
          <p class="mt-1 text-xs text-muted-foreground">
            {{ progressLabel }}
          </p>
        </TooltipContent>
      </TooltipPortal>
    </TooltipRoot>
  </TooltipProvider>
  <slot v-else />
</template>
