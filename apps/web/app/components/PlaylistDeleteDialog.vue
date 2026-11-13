<script setup lang="ts">
import { useI18n } from "#imports";
import { Button } from "@peridot/ui/components/ui/button";
import {
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogOverlay,
  AlertDialogPortal,
  AlertDialogRoot,
  AlertDialogTitle,
} from "reka-ui";

defineProps<{
  open: boolean;
  name: string;
  pending?: boolean;
}>();
const emit = defineEmits<{
  "update:open": [open: boolean];
  confirm: [];
}>();
const { t } = useI18n();
</script>

<template>
  <AlertDialogRoot :open="open" @update:open="emit('update:open', $event)">
    <AlertDialogPortal>
      <AlertDialogOverlay class="fixed inset-0 z-50 bg-background/80" />
      <AlertDialogContent
        class="fixed left-1/2 top-1/2 z-50 w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-lg border bg-card p-6 text-card-foreground shadow-lg"
      >
        <AlertDialogTitle class="text-lg font-semibold">
          {{ t("playlistDelete.title", { playlist: name }) }}
        </AlertDialogTitle>
        <AlertDialogDescription class="mt-2 text-sm text-muted-foreground">
          {{ t("playlistDelete.description") }}
        </AlertDialogDescription>
        <div class="mt-6 flex justify-end gap-2">
          <AlertDialogCancel as-child>
            <Button type="button" variant="outline" :disabled="pending">
              {{ t("common.cancel") }}
            </Button>
          </AlertDialogCancel>
          <AlertDialogAction as-child>
            <Button
              type="button"
              variant="destructive"
              :disabled="pending"
              :aria-busy="pending"
              @click="emit('confirm')"
            >
              {{ pending ? t("common.deleting") : t("playlistDelete.action") }}
            </Button>
          </AlertDialogAction>
        </div>
      </AlertDialogContent>
    </AlertDialogPortal>
  </AlertDialogRoot>
</template>
