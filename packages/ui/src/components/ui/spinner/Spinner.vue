<script setup lang="ts">
import type { HTMLAttributes } from "vue";
import { LoaderIcon } from "@lucide/vue";
import { cn } from "cn";

const props = defineProps<{
  label: string;
  class?: HTMLAttributes["class"];
}>();
</script>

<template>
  <LoaderIcon
    role="status"
    :aria-label="label"
    :class="cn('size-4 animate-spin', props.class)"
  />
</template>
