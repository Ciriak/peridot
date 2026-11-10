<script setup lang="ts">
import type { ContextMenuSeparatorProps } from "reka-ui";
import type { HTMLAttributes } from "vue";
import { cn } from "cn";
import { ContextMenuSeparator, useForwardProps } from "reka-ui";

const props = defineProps<
  ContextMenuSeparatorProps & {
    class?: HTMLAttributes["class"];
  }
>();
const forwarded = useForwardProps(props);
</script>

<template>
  <ContextMenuSeparator
    v-bind="forwarded"
    :class="cn('-mx-1 my-1 h-px bg-border', props.class)"
  />
</template>
