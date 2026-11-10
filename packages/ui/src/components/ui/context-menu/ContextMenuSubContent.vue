<script setup lang="ts">
import type {
  ContextMenuSubContentEmits,
  ContextMenuSubContentProps,
} from "reka-ui";
import type { HTMLAttributes } from "vue";
import { cn } from "cn";
import { ContextMenuSubContent, useForwardPropsEmits } from "reka-ui";

const props = defineProps<
  ContextMenuSubContentProps & {
    class?: HTMLAttributes["class"];
  }
>();
const emits = defineEmits<ContextMenuSubContentEmits>();
const forwarded = useForwardPropsEmits(props, emits);
</script>

<template>
  <ContextMenuSubContent
    v-bind="forwarded"
    :class="
      cn(
        'z-50 min-w-32 overflow-hidden rounded-md border bg-popover p-1 text-popover-foreground shadow-lg',
        props.class,
      )
    "
  >
    <slot />
  </ContextMenuSubContent>
</template>
