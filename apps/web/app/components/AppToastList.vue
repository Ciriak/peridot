<script setup lang="ts">
import { useRoute } from "#imports";
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
import { computed } from "vue";
import { icons } from "../lib/icons";
import { toastViewportClass } from "../lib/toast-position";
import type { AppToastData, AppToastKind } from "../lib/toasts";

const route = useRoute();
const viewportClass = computed(() => toastViewportClass(route.meta.layout));
const { toasts } = useToastManager<AppToastData>();

function iconFor(kind: AppToastKind | undefined) {
  return kind === "error" ? icons.cloudOff : icons.check;
}
</script>

<template>
  <ToastViewport :class="viewportClass">
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
