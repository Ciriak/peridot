<script setup lang="ts">
import type { HTMLAttributes } from "vue";
import type { ProgressCircleVariants } from ".";
import { cn } from "cn";
import { Comment, computed, useSlots } from "vue";
import { progressCircleVariants } from ".";

interface Props {
  class?: HTMLAttributes["class"];
  label?: string;
  showValue?: boolean;
  size?: ProgressCircleVariants["size"];
  stroke?: number;
  value?: number | null;
  variant?: ProgressCircleVariants["variant"];
}

const props = withDefaults(defineProps<Props>(), {
  showValue: false,
  size: "md",
  stroke: 6,
  value: null,
  variant: "primary",
});

const slots = useSlots();
const hasCenterSlot = computed(
  () => slots.default?.().some((node) => node.type !== Comment) ?? false,
);

const normalizedValue = computed(() => {
  const value = props.value;

  if (typeof value !== "number" || !Number.isFinite(value)) {
    return null;
  }

  return Math.min(100, Math.max(0, value));
});

const isIndeterminate = computed(() => normalizedValue.value === null);
const roundedValue = computed(() => Math.round(normalizedValue.value ?? 0));
const normalizedStroke = computed(() =>
  Number.isFinite(props.stroke) && props.stroke >= 0 ? props.stroke : 6,
);
const accessibleLabel = computed(
  () => props.label ?? (isIndeterminate.value ? "Loading" : "Progress"),
);
const dashArray = computed(() => (isIndeterminate.value ? "25 75" : "100"));
const dashOffset = computed(() =>
  isIndeterminate.value ? 0 : 100 - (normalizedValue.value ?? 0),
);

const valueTextClasses = {
  sm: "text-xs",
  md: "text-xs",
  lg: "text-sm",
  xl: "text-base",
} as const;

const valueTextClass = computed(() => valueTextClasses[props.size ?? "md"]);
</script>

<template>
  <span
    data-slot="progress-circle"
    :data-state="isIndeterminate ? 'indeterminate' : 'determinate'"
    :data-size="size"
    :data-variant="variant"
    role="progressbar"
    :aria-label="accessibleLabel"
    :aria-valuemin="isIndeterminate ? undefined : 0"
    :aria-valuemax="isIndeterminate ? undefined : 100"
    :aria-valuenow="isIndeterminate ? undefined : (normalizedValue ?? 0)"
    :aria-valuetext="isIndeterminate ? undefined : `${roundedValue}%`"
    :class="cn(progressCircleVariants({ size, variant }), props.class)"
  >
    <svg
      aria-hidden="true"
      viewBox="0 0 36 36"
      :stroke-width="normalizedStroke"
      class="size-full origin-center -rotate-90 motion-safe:animate-spin motion-safe:transition-all motion-safe:duration-300 motion-reduce:transition-none"
    >
      <circle
        data-slot="progress-circle-track"
        cx="18"
        cy="18"
        r="16"
        pathLength="100"
        stroke-linecap="round"
        class="fill-none stroke-border"
      />
      <circle
        data-slot="progress-circle-indicator"
        cx="18"
        cy="18"
        r="16"
        pathLength="100"
        stroke-linecap="round"
        :stroke-dasharray="dashArray"
        :stroke-dashoffset="dashOffset"
        class="fill-none"
      />
    </svg>
    <span
      v-if="!isIndeterminate && (hasCenterSlot || showValue)"
      aria-hidden="true"
      class="absolute inset-0 flex items-center justify-center font-medium leading-none"
      :class="valueTextClass"
    >
      <slot v-if="hasCenterSlot" />
      <template v-else>{{ roundedValue }}%</template>
    </span>
  </span>
</template>
