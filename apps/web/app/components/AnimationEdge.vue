<script setup lang="ts">
import type { EdgeProps } from "@xyflow/vue";
import { BezierEdge } from "@xyflow/vue";

defineProps<EdgeProps>();
</script>

<template>
  <BezierEdge v-bind="$props" class="stroke-primary stroke-2" />
</template>
