<script setup lang="ts">
import type { HTMLAttributes } from "vue";
import logo from "../../../assets/brand/logo.svg";
import spinner from "../../../assets/brand/spinner.svg";
import { cn } from "cn";

const props = withDefaults(
  defineProps<{
    label?: string;
    class?: HTMLAttributes["class"];
  }>(),
  { label: "Loading" },
);
</script>

<template>
  <span
    data-slot="peridot-spinner"
    role="status"
    :class="
      cn('inline-flex size-8 shrink-0 items-center justify-center', props.class)
    "
  >
    <img
      :src="spinner"
      alt=""
      aria-hidden="true"
      class="size-full motion-reduce:hidden"
    />
    <img
      :src="logo"
      alt=""
      aria-hidden="true"
      class="hidden size-full motion-reduce:block"
    />
    <span class="sr-only">{{ label }}</span>
  </span>
</template>
