<script setup lang="ts">
import type { PrimitiveProps } from "reka-ui";
import type { HTMLAttributes } from "vue";
import { reactiveOmit } from "@vueuse/core";
import { cn } from "cn";
import { Primitive } from "reka-ui";
import { computed } from "vue";

type GradientIntensity = "subtle" | "medium" | "strong";

const props = withDefaults(
  defineProps<
    PrimitiveProps & {
      class?: HTMLAttributes["class"];
      colors?: string[];
      grain?: boolean;
      intensity?: GradientIntensity;
      speed?: number;
    }
  >(),
  {
    as: "div",
    colors: () => ["var(--primary)"],
    grain: true,
    intensity: "medium",
    speed: 1,
  },
);

const delegatedProps = reactiveOmit(
  props,
  "class",
  "colors",
  "grain",
  "intensity",
  "speed",
);

const normalizedColors = computed(() => {
  const colors = props.colors.slice(0, 5).filter(Boolean);
  const palette = colors.length ? colors : ["var(--primary)"];
  return Array.from(
    { length: 5 },
    (_, index) => palette[index % palette.length],
  );
});

const normalizedSpeed = computed(() =>
  Number.isFinite(props.speed) && props.speed > 0 ? props.speed : 1,
);

const strengths: Record<GradientIntensity, number> = {
  subtle: 0.45,
  medium: 0.72,
  strong: 1,
};

const xDurations = [18, 21, 24, 26, 20];
const yDurations = [23, 17, 25, 19, 22];
const gradientStyle = computed<Record<string, string>>(() => {
  const style: Record<string, string> = {
    "--gradient-speed": String(normalizedSpeed.value),
    "--gradient-strength": String(strengths[props.intensity]),
  };

  for (let index = 0; index < 5; index += 1) {
    style[`--gradient-color-${index + 1}`] =
      normalizedColors.value[index] ?? "var(--primary)";
    style[`--gradient-x-duration-${index + 1}`] =
      `${xDurations[index]! / normalizedSpeed.value}s`;
    style[`--gradient-y-duration-${index + 1}`] =
      `${yDurations[index]! / normalizedSpeed.value}s`;
  }

  return style;
});
</script>

<template>
  <Primitive
    data-slot="gradient"
    :class="cn('gradient', props.class)"
    :style="gradientStyle"
    v-bind="delegatedProps"
  >
    <div aria-hidden="true" class="gradient__visual opacity-15">
      <span class="gradient__axis gradient__axis--1">
        <span class="gradient__blob" />
      </span>
      <span class="gradient__axis gradient__axis--2">
        <span class="gradient__blob" />
      </span>
      <span class="gradient__axis gradient__axis--3">
        <span class="gradient__blob" />
      </span>
      <span class="gradient__axis gradient__axis--4">
        <span class="gradient__blob" />
      </span>
      <span class="gradient__axis gradient__axis--5">
        <span class="gradient__blob" />
      </span>
      <span v-if="grain" class="gradient__grain" />
    </div>
    <div class="gradient__content">
      <slot />
    </div>
  </Primitive>
</template>

<style scoped>
.gradient {
  position: relative;
  isolation: isolate;
  overflow: hidden;
  --gradient-color-1: var(--primary);
  --gradient-color-2: var(--primary);
  --gradient-color-3: var(--primary);
  --gradient-color-4: var(--primary);
  --gradient-color-5: var(--primary);
  --gradient-speed: 1;
  --gradient-strength: 0.72;
}

.gradient__visual {
  position: absolute;
  z-index: 0;
  inset: 0;
  overflow: hidden;
  pointer-events: none;
}

.gradient__axis {
  position: absolute;
  aspect-ratio: 1;
  animation-name: gradient-drift-x;
  animation-timing-function: ease-in-out;
  animation-iteration-count: infinite;
  animation-direction: alternate;
  will-change: transform;
}

.gradient__blob {
  display: block;
  width: 100%;
  height: 100%;
  border-radius: 9999px;
  background: radial-gradient(
    circle at center,
    var(--gradient-color) 0%,
    color-mix(in srgb, var(--gradient-color) 68%, transparent) 28%,
    color-mix(in srgb, var(--gradient-color) 28%, transparent) 52%,
    transparent 72%
  );
  opacity: var(--gradient-strength);
  animation-name: gradient-drift-y;
  animation-timing-function: ease-in-out;
  animation-iteration-count: infinite;
  animation-direction: alternate;
  will-change: transform;
}

.gradient__axis--1 {
  top: -24%;
  left: -18%;
  width: 72%;
  --gradient-color: var(--gradient-color-1);
  --gradient-x-from: -8%;
  --gradient-x-to: 18%;
  --gradient-y-from: -6%;
  --gradient-y-to: 16%;
  animation-duration: var(--gradient-x-duration-1, 18s);
}

.gradient__axis--1 .gradient__blob {
  animation-duration: var(--gradient-y-duration-1, 23s);
}

.gradient__axis--2 {
  top: -14%;
  right: -20%;
  width: 66%;
  --gradient-color: var(--gradient-color-2);
  --gradient-x-from: 12%;
  --gradient-x-to: -16%;
  --gradient-y-from: -10%;
  --gradient-y-to: 14%;
  animation-duration: var(--gradient-x-duration-2, 21s);
}

.gradient__axis--2 .gradient__blob {
  animation-duration: var(--gradient-y-duration-2, 17s);
}

.gradient__axis--3 {
  top: 24%;
  left: 16%;
  width: 68%;
  --gradient-color: var(--gradient-color-3);
  --gradient-x-from: -14%;
  --gradient-x-to: 12%;
  --gradient-y-from: 10%;
  --gradient-y-to: -14%;
  animation-duration: var(--gradient-x-duration-3, 24s);
}

.gradient__axis--3 .gradient__blob {
  animation-duration: var(--gradient-y-duration-3, 25s);
}

.gradient__axis--4 {
  bottom: -28%;
  left: -12%;
  width: 64%;
  --gradient-color: var(--gradient-color-4);
  --gradient-x-from: -10%;
  --gradient-x-to: 20%;
  --gradient-y-from: 12%;
  --gradient-y-to: -12%;
  animation-duration: var(--gradient-x-duration-4, 26s);
}

.gradient__axis--4 .gradient__blob {
  animation-duration: var(--gradient-y-duration-4, 19s);
}

.gradient__axis--5 {
  right: -22%;
  bottom: -30%;
  width: 74%;
  --gradient-color: var(--gradient-color-5);
  --gradient-x-from: 16%;
  --gradient-x-to: -12%;
  --gradient-y-from: 8%;
  --gradient-y-to: -18%;
  animation-duration: var(--gradient-x-duration-5, 20s);
}

.gradient__axis--5 .gradient__blob {
  animation-duration: var(--gradient-y-duration-5, 22s);
}

.gradient__grain {
  position: absolute;
  z-index: 1;
  inset: 0;
  background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 160 160' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.9' numOctaves='4' seed='7' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)' opacity='.5'/%3E%3C/svg%3E");
  background-repeat: repeat;
  background-size: 160px 160px;
  opacity: 0.08;
  mix-blend-mode: soft-light;
}

.gradient__content {
  position: relative;
  z-index: 2;
  width: 100%;
}

@keyframes gradient-drift-x {
  from {
    transform: translate3d(var(--gradient-x-from), 0, 0);
  }
  to {
    transform: translate3d(var(--gradient-x-to), 0, 0);
  }
}

@keyframes gradient-drift-y {
  from {
    transform: translate3d(0, var(--gradient-y-from), 0);
  }
  to {
    transform: translate3d(0, var(--gradient-y-to), 0);
  }
}

@media (prefers-reduced-motion: reduce) {
  .gradient__axis,
  .gradient__blob {
    animation: none;
    transform: none;
  }
}
</style>
