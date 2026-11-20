<script setup lang="ts">
import { useI18n } from "#imports";
import { Icon } from "@iconify/vue/offline";
import { Button } from "@peridot/ui/components/ui/button";
import { computed } from "vue";
import { icons } from "../lib/icons";

const props = withDefaults(
  defineProps<{
    liked: boolean;
    label: string;
    pending?: boolean;
    disabled?: boolean;
    compact?: boolean;
    large?: boolean;
  }>(),
  { pending: false, disabled: false, compact: false, large: false },
);

const emit = defineEmits<{ toggle: [] }>();
const { t } = useI18n();
const actionLabel = computed(() =>
  props.liked
    ? t("like.unlike", { label: props.label })
    : t("like.like", { label: props.label }),
);
</script>

<template>
  <Button
    variant="ghost"
    :size="compact ? 'icon-xs' : 'icon-lg'"
    :class="['hover:text-primary active:text-primary', large && 'size-12']"
    :disabled="disabled || pending"
    :aria-label="actionLabel"
    :title="actionLabel"
    :aria-pressed="liked"
    :aria-busy="pending"
    @click="emit('toggle')"
  >
    <Icon
      :icon="liked ? icons.heartFilled : icons.heart"
      aria-hidden="true"
      class="transition-colors"
      :class="[
        compact ? 'size-4' : large ? 'size-7' : 'size-6',
        liked && 'text-primary',
      ]"
    />
  </Button>
</template>
