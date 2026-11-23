<script setup lang="ts">
import type { TabsTriggerProps } from "reka-ui";
import type { HTMLAttributes } from "vue";
import { reactiveOmit } from "@vueuse/core";
import { cn } from "cn";
import { TabsTrigger } from "reka-ui";

const props = defineProps<
  TabsTriggerProps & {
    class?: HTMLAttributes["class"];
  }
>();

const delegatedProps = reactiveOmit(props, "class");
</script>

<template>
  <TabsTrigger
    data-slot="tabs-trigger"
    v-bind="delegatedProps"
    :class="
      cn(
        'inline-flex flex-1 items-center justify-center gap-1.5 rounded-md border border-transparent px-2 py-1 text-sm font-medium whitespace-nowrap transition-colors hover:text-foreground focus-visible:border-ring focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50 aria-selected:bg-background aria-selected:text-foreground aria-selected:shadow-sm dark:aria-selected:border-input dark:aria-selected:bg-input/30',
        props.class,
      )
    "
  >
    <slot />
  </TabsTrigger>
</template>
