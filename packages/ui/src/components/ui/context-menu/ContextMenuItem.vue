<script setup lang="ts">
import type { ContextMenuItemEmits, ContextMenuItemProps } from "reka-ui";
import type { HTMLAttributes } from "vue";
import { cn } from "cn";
import { ContextMenuItem, useForwardPropsEmits } from "reka-ui";

const props = defineProps<
  ContextMenuItemProps & {
    class?: HTMLAttributes["class"];
  }
>();
const emits = defineEmits<ContextMenuItemEmits>();
const forwarded = useForwardPropsEmits(props, emits);
</script>

<template>
  <ContextMenuItem
    v-bind="forwarded"
    :class="
      cn(
        'relative flex cursor-default select-none items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-hidden focus:bg-accent focus:text-accent-foreground data-disabled:pointer-events-none data-disabled:opacity-50 [&_svg:not([class*=size-])]:size-4 [&_svg]:shrink-0',
        props.class,
      )
    "
  >
    <slot />
  </ContextMenuItem>
</template>
