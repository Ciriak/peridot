<script setup lang="ts">
import type { ToasterProps } from "vue-sonner";
import { reactiveOmit } from "@vueuse/core";
import { cn } from "cn";
import { Toaster as Sonner } from "vue-sonner";

const props = defineProps<ToasterProps>();
const delegatedProps = reactiveOmit(props, "class");
</script>

<template>
  <Sonner :class="cn('toaster group', props.class)" v-bind="delegatedProps">
    <template v-if="$slots['success-icon']" #success-icon>
      <slot name="success-icon" />
    </template>
    <template v-if="$slots['info-icon']" #info-icon>
      <slot name="info-icon" />
    </template>
    <template v-if="$slots['warning-icon']" #warning-icon>
      <slot name="warning-icon" />
    </template>
    <template v-if="$slots['error-icon']" #error-icon>
      <slot name="error-icon" />
    </template>
    <template v-if="$slots['loading-icon']" #loading-icon>
      <slot name="loading-icon" />
    </template>
    <template v-if="$slots['close-icon']" #close-icon>
      <slot name="close-icon" />
    </template>
  </Sonner>
</template>
