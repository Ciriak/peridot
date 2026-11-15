<script setup lang="ts">
import { Icon } from "@iconify/vue/offline";
import { Button } from "@peridot/ui/components/ui/button";
import {
  ToastClose,
  ToastDescription,
  ToastRoot,
  ToastTitle,
  ToastViewport,
  useToastManager,
} from "reka-ui";
import { useLocalizedMessage } from "../composables/use-localized-message";
import { icons } from "../lib/icons";
import { TOAST_VIEWPORT_CLASS } from "../lib/toast-position";
import type { AppToastData, AppToastKind } from "../lib/toasts";

const { t, translate } = useLocalizedMessage();
const { toasts } = useToastManager<AppToastData>();

function iconFor(kind: AppToastKind | undefined) {
  return kind === "error" ? icons.cloudOff : icons.check;
}

function titleFor(toast: (typeof toasts.value)[number]) {
  return translate(toast.data?.titleMessage);
}

function descriptionFor(toast: (typeof toasts.value)[number]) {
  return translate(toast.data?.descriptionMessage);
}
</script>

<template>
  <ToastViewport :class="TOAST_VIEWPORT_CLASS">
    <ToastRoot
      v-for="toast in toasts"
      :key="toast.id"
      :toast="toast"
      :class="[
        'pointer-events-auto flex w-full items-start gap-3 rounded-lg border bg-card p-4 text-card-foreground shadow-lg',
        toast.data?.kind === 'error' && 'border-destructive/60',
      ]"
    >
      <span
        aria-hidden="true"
        :class="[
          'flex size-8 shrink-0 items-center justify-center rounded-full',
          toast.data?.kind === 'error'
            ? 'bg-destructive/10 text-destructive'
            : 'bg-primary/10 text-primary',
        ]"
      >
        <Icon :icon="iconFor(toast.data?.kind)" class="size-5" />
      </span>
      <div class="min-w-0 flex-1 space-y-1">
        <ToastTitle
          :class="[
            'text-sm font-semibold',
            toast.data?.kind === 'error' && 'text-destructive',
          ]"
        >
          {{ titleFor(toast) }}
        </ToastTitle>
        <ToastDescription class="text-sm text-muted-foreground">
          {{ descriptionFor(toast) }}
        </ToastDescription>
      </div>
      <ToastClose as-child>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          :aria-label="t('toast.dismiss')"
        >
          <Icon :icon="icons.close" aria-hidden="true" />
        </Button>
      </ToastClose>
    </ToastRoot>
  </ToastViewport>
</template>
