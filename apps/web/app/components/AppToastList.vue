<script setup lang="ts">
import { Icon } from "@iconify/vue/offline";
import { Button } from "@peridot/ui/components/ui/button";
import { Spinner } from "@peridot/ui/components/ui/spinner";
import {
  ToastClose,
  ToastDescription,
  ToastRoot,
  ToastTitle,
  ToastViewport,
  useToastManager,
} from "reka-ui";
import { icons } from "../lib/icons";
import type { AppToastData, AppToastKind } from "../lib/toasts";

const { toasts } = useToastManager<AppToastData>();

function iconFor(kind: AppToastKind | undefined) {
  return kind === "error" ? icons.cloudOff : icons.check;
}
</script>

<template>
  <ToastViewport
    class="fixed inset-x-4 bottom-44 z-50 flex w-auto flex-col gap-2 p-0 md:inset-x-auto md:bottom-32 md:right-6 md:w-96"
  >
    <ToastRoot
      v-for="toast in toasts"
      :key="toast.id"
      :toast="toast"
      :class="[
        'pointer-events-auto flex w-full items-start gap-3 rounded-lg border bg-card p-4 text-card-foreground shadow-lg',
        toast.data?.kind === 'error' && 'border-destructive/60',
      ]"
    >
      <Spinner
        v-if="toast.data?.kind === 'progress'"
        label="Work in progress"
        class="size-8"
      />
      <span
        v-else
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
        />
        <ToastDescription class="text-sm text-muted-foreground" />
      </div>
      <ToastClose as-child>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label="Dismiss notification"
        >
          <Icon :icon="icons.close" aria-hidden="true" />
        </Button>
      </ToastClose>
    </ToastRoot>
  </ToastViewport>
</template>
