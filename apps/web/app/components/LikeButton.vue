<script setup lang="ts">
import { useI18n } from "#imports";
import { Icon } from "@iconify/vue/offline";
import { Button } from "@peridot/ui/components/ui/button";
import { icons } from "../lib/icons";

withDefaults(
  defineProps<{
    liked: boolean;
    label: string;
    pending?: boolean;
    disabled?: boolean;
    compact?: boolean;
  }>(),
  { pending: false, disabled: false, compact: false },
);

const emit = defineEmits<{ toggle: [] }>();
const { t } = useI18n();
</script>

<template>
  <Button
    variant="ghost"
    :size="compact ? 'icon-xs' : 'icon-lg'"
    class="hover:text-primary active:text-primary"
    :disabled="disabled || pending"
    :aria-label="
      liked ? t('like.unlike', { label }) : t('like.like', { label })
    "
    :aria-pressed="liked"
    :aria-busy="pending"
    @click="emit('toggle')"
  >
    <Icon
      :icon="liked ? icons.heartFilled : icons.heart"
      aria-hidden="true"
      class="transition-colors"
      :class="[compact ? 'size-3' : 'size-6', liked && 'text-primary']"
    />
  </Button>
</template>
