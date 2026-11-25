<script setup lang="ts">
import { useI18n } from "#imports";
import { Icon } from "@iconify/vue/offline";
import { Switch } from "@peridot/ui/components/ui/switch";
import {
  TooltipContent,
  TooltipPortal,
  TooltipProvider,
  TooltipRoot,
  TooltipTrigger,
} from "reka-ui";
import { computed, ref } from "vue";
import { useLibrarySettings } from "../composables/use-library-settings";
import { useServerConnection } from "../composables/use-server-connection";
import { icons } from "../lib/icons";

const { t } = useI18n();
const {
  likedTitlesOffline,
  setLikedTitlesOffline,
  verification,
  verificationError,
  saving,
  verified,
} = useLibrarySettings();
const { status } = useServerConnection();
const tooltipOpen = ref(false);
const model = computed({
  get: () => likedTitlesOffline.value,
  set: (value: boolean) => void setLikedTitlesOffline(value),
});
const disabled = computed(
  () =>
    !verified.value ||
    saving.value ||
    verification.value === "verifying" ||
    status.value === "lost",
);
const label = computed(() => t("settings.library.likedTitlesOffline"));
</script>

<template>
  <div class="flex flex-col items-end gap-2">
    <TooltipProvider :delay-duration="150">
      <TooltipRoot v-model:open="tooltipOpen">
        <TooltipTrigger as-child>
          <div
            class="flex items-center gap-2 rounded-full border bg-muted px-3 py-1.5 shadow-sm"
            @focusin="tooltipOpen = true"
            @focusout="tooltipOpen = false"
          >
            <Icon
              :icon="icons.cloudDownload"
              aria-hidden="true"
              class="size-5 text-muted-foreground"
            />
            <Switch
              id="liked-tracks-offline"
              v-model="model"
              :class="likedTitlesOffline ? 'bg-primary' : undefined"
              :aria-label="label"
              :aria-busy="verification === 'verifying' || saving"
              :disabled="disabled"
            />
          </div>
        </TooltipTrigger>
        <TooltipPortal>
          <TooltipContent
            side="top"
            align="end"
            :side-offset="6"
            class="z-50 max-w-64 rounded-md border bg-popover px-3 py-2 text-xs text-popover-foreground shadow-md"
          >
            {{ t("settings.library.likedTitlesOfflineTooltip") }}
          </TooltipContent>
        </TooltipPortal>
      </TooltipRoot>
    </TooltipProvider>
    <p
      v-if="verificationError"
      role="alert"
      class="max-w-52 text-right text-xs text-destructive"
    >
      {{ verificationError }}
    </p>
  </div>
</template>
