<script setup lang="ts">
import { Icon } from "@iconify/vue/offline";
import { Badge } from "@peridot/ui/components/ui/badge";
import {
  TooltipContent,
  TooltipPortal,
  TooltipProvider,
  TooltipRoot,
  TooltipTrigger,
} from "reka-ui";
import { useLocalizedMessage } from "../composables/use-localized-message";
import { useServerConnection } from "../composables/use-server-connection";
import { icons } from "../lib/icons";

const { t } = useLocalizedMessage();
const { status } = useServerConnection();
</script>

<template>
  <TooltipProvider v-if="status === 'lost'" :delay-duration="150">
    <TooltipRoot>
      <TooltipTrigger as-child>
        <Badge
          variant="outline"
          role="status"
          tabindex="0"
          :aria-label="t('components.serverConnection.offline')"
          class="cursor-default text-foreground"
        >
          <Icon :icon="icons.networkOff" aria-hidden="true" />
          <span class="hidden md:inline">{{
            t("components.serverConnection.offlineBadge")
          }}</span>
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
            {{ t("components.serverConnection.offline") }}
          </p>
          <p class="mt-1 text-xs text-muted-foreground">
            {{ t("components.serverConnection.offlineDescription") }}
          </p>
        </TooltipContent>
      </TooltipPortal>
    </TooltipRoot>
  </TooltipProvider>
</template>
