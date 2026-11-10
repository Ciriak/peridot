<script setup lang="ts">
import type { ContextMenuSubTriggerProps } from "reka-ui";
import type { HTMLAttributes } from "vue";
import { cn } from "cn";
import { ContextMenuSubTrigger, useForwardProps } from "reka-ui";

const props = defineProps<
  ContextMenuSubTriggerProps & {
    class?: HTMLAttributes["class"];
  }
>();
const forwarded = useForwardProps(props);
</script>

<template>
  <ContextMenuSubTrigger
    v-bind="forwarded"
    :class="
      cn(
        'flex cursor-default select-none items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-hidden focus:bg-accent focus:text-accent-foreground data-[state=open]:bg-accent data-[state=open]:text-accent-foreground',
        props.class,
      )
    "
  >
    <slot />
  </ContextMenuSubTrigger>
</template>
