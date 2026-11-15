<script setup lang="ts">
import { useI18n } from "#imports";
import { Button } from "@peridot/ui/components/ui/button";
import { Input } from "@peridot/ui/components/ui/input";
import {
  DialogContent,
  DialogDescription,
  DialogOverlay,
  DialogPortal,
  DialogRoot,
  DialogTitle,
} from "reka-ui";
import { ref, watch } from "vue";

const props = withDefaults(
  defineProps<{
    open: boolean;
    initialName?: string;
    mode: "create" | "rename";
    pending?: boolean;
    error?: string | null;
  }>(),
  { initialName: "", pending: false, error: null },
);
const emit = defineEmits<{
  "update:open": [open: boolean];
  submit: [name: string];
}>();
const { t } = useI18n();
const name = ref(props.initialName);

watch(
  () => props.open,
  (open) => {
    if (open) name.value = props.initialName;
  },
);
</script>

<template>
  <DialogRoot :open="open" @update:open="emit('update:open', $event)">
    <DialogPortal>
      <DialogOverlay class="fixed inset-0 z-50 bg-background/80" />
      <DialogContent
        class="fixed left-1/2 top-1/2 z-50 w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-lg border bg-card p-6 text-card-foreground shadow-lg"
      >
        <DialogTitle class="text-lg font-semibold">
          {{
            mode === "create"
              ? t("playlistName.createTitle")
              : t("playlistName.renameTitle")
          }}
        </DialogTitle>
        <DialogDescription class="mt-1 text-sm text-muted-foreground">
          {{
            mode === "create"
              ? t("playlistName.createDescription")
              : t("playlistName.renameDescription")
          }}
        </DialogDescription>
        <form class="mt-4 space-y-3" @submit.prevent="emit('submit', name)">
          <Input
            v-model="name"
            :aria-label="t('playlistName.label')"
            :placeholder="t('playlistName.placeholder')"
            maxlength="120"
            autofocus
          />
          <p v-if="error" role="alert" class="text-sm text-destructive">
            {{ error }}
          </p>
          <div class="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              :disabled="pending"
              @click="emit('update:open', false)"
            >
              {{ t("common.cancel") }}
            </Button>
            <Button
              type="submit"
              :disabled="pending || !name.trim()"
              :aria-busy="pending"
            >
              {{
                pending
                  ? t("common.saving")
                  : mode === "create"
                    ? t("playlistName.create")
                    : t("playlistName.rename")
              }}
            </Button>
          </div>
        </form>
      </DialogContent>
    </DialogPortal>
  </DialogRoot>
</template>
