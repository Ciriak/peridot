<script setup lang="ts">
import { Icon } from "@iconify/vue/offline";
import { Button } from "@peridot/ui/components/ui/button";
import { Input } from "@peridot/ui/components/ui/input";
import { icons } from "../lib/icons";

defineProps<{
  modelValue: string;
  label: string;
  clearLabel: string;
}>();

const emit = defineEmits<{
  "update:modelValue": [value: string];
  clear: [];
}>();
</script>

<template>
  <div role="search" :aria-label="label" class="relative w-full">
    <Icon
      :icon="icons.search"
      aria-hidden="true"
      class="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
    />
    <Input
      :model-value="modelValue"
      type="search"
      :aria-label="label"
      :placeholder="label"
      class="pl-9 pr-11"
      @update:model-value="emit('update:modelValue', String($event))"
      @keydown.esc="emit('clear')"
    />
    <Button
      v-if="modelValue"
      type="button"
      variant="ghost"
      size="icon-sm"
      :aria-label="clearLabel"
      class="absolute right-1 top-1/2 -translate-y-1/2"
      @click="emit('clear')"
    >
      <Icon :icon="icons.close" aria-hidden="true" class="size-4" />
    </Button>
  </div>
</template>
