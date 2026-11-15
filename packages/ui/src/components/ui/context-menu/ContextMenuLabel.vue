<script setup lang="ts">
import type { ContextMenuLabelProps } from "reka-ui";
import type { HTMLAttributes } from "vue";
import { cn } from "cn";
import { ContextMenuLabel, useForwardProps } from "reka-ui";

const props = defineProps<
  ContextMenuLabelProps & {
    class?: HTMLAttributes["class"];
  }
>();
const forwarded = useForwardProps(props);
</script>

<template>
  <ContextMenuLabel
    v-bind="forwarded"
    :class="
      cn('px-2 py-1.5 text-xs font-medium text-muted-foreground', props.class)
    "
  >
    <slot />
  </ContextMenuLabel>
</template>
