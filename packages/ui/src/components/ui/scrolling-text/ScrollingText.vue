<script setup lang="ts">
import type { HTMLAttributes } from "vue";
import { useMediaQuery, usePreferredReducedMotion } from "@vueuse/core";
import { cn } from "cn";
import {
  computed,
  nextTick,
  onBeforeUnmount,
  onMounted,
  ref,
  watch,
} from "vue";
import {
  SCROLLING_TEXT_MOBILE_MEDIA_QUERY,
  scrollingTextActivatesAutomatically,
  scrollingTextKeyframes,
  scrollingTextLoopDuration,
  scrollingTextOverflowDistance,
} from "../../../lib/scrolling-text";

interface Props {
  class?: HTMLAttributes["class"];
  mode?: "always" | "hover";
}

const props = withDefaults(defineProps<Props>(), {
  class: undefined,
  mode: "hover",
});

const viewport = ref<HTMLElement | null>(null);
const content = ref<HTMLElement | null>(null);
const hovering = ref(false);
const focused = ref(false);
const overflowing = ref(false);
const reducedMotion = usePreferredReducedMotion();
const mobile = useMediaQuery(SCROLLING_TEXT_MOBILE_MEDIA_QUERY);
const activatesAutomatically = computed(() =>
  scrollingTextActivatesAutomatically(props.mode, mobile.value),
);

let animation: Animation | null = null;
let resizeObserver: ResizeObserver | null = null;
let mutationObserver: MutationObserver | null = null;
let measureFrame: number | null = null;
let restartMeasurement = false;
let currentDistance = 0;
let mounted = false;

function cancelAnimation() {
  animation?.cancel();
  animation = null;
}

function isPausedByInteraction() {
  return activatesAutomatically.value && (hovering.value || focused.value);
}

function isActivated() {
  return activatesAutomatically.value || hovering.value || focused.value;
}

function createAnimation(distance: number) {
  if (!content.value) return;

  cancelAnimation();

  animation = content.value.animate(scrollingTextKeyframes(distance), {
    duration: scrollingTextLoopDuration(distance),
    easing: "linear",
    fill: "both",
    iterations: Number.POSITIVE_INFINITY,
  });

  if (isPausedByInteraction()) {
    animation.pause();
  }
}

function syncAnimation() {
  if (
    !mounted ||
    !overflowing.value ||
    currentDistance <= 0 ||
    !isActivated() ||
    reducedMotion.value === "reduce"
  ) {
    cancelAnimation();
    return;
  }

  if (!animation) {
    createAnimation(currentDistance);
  }

  if (isPausedByInteraction()) {
    animation?.pause();
  } else {
    animation?.play();
  }
}

function measure() {
  measureFrame = null;
  if (!viewport.value || !content.value) return;
  const restart = restartMeasurement;
  restartMeasurement = false;

  const distance = scrollingTextOverflowDistance(
    content.value.scrollWidth,
    viewport.value.clientWidth,
  );
  const changed = distance !== currentDistance;
  currentDistance = distance;
  overflowing.value = distance > 0;

  if (restart || distance <= 0 || changed || !animation) {
    cancelAnimation();
    if (distance > 0 && isActivated() && reducedMotion.value !== "reduce") {
      createAnimation(distance);
    }
  }

  syncAnimation();
}

function scheduleMeasure(restart = false) {
  restartMeasurement ||= restart;
  if (measureFrame !== null) {
    cancelAnimationFrame(measureFrame);
  }
  measureFrame = requestAnimationFrame(measure);
}

function setHovering(value: boolean) {
  hovering.value = value;
  syncAnimation();
}

function handlePointerEnter(event: PointerEvent) {
  if (event.pointerType !== "touch") setHovering(true);
}

function handlePointerLeave() {
  setHovering(false);
}

function handleFocusIn() {
  focused.value = true;
  syncAnimation();
}

function handleFocusOut(event: FocusEvent) {
  const next = event.relatedTarget;
  if (next instanceof Node && viewport.value?.contains(next)) return;

  focused.value = false;
  syncAnimation();
}

watch(activatesAutomatically, async () => {
  cancelAnimation();
  await nextTick();
  scheduleMeasure(true);
});

watch(reducedMotion, () => {
  cancelAnimation();
  scheduleMeasure(true);
});

onMounted(() => {
  mounted = true;
  resizeObserver = new ResizeObserver(() => scheduleMeasure(true));
  if (viewport.value) resizeObserver.observe(viewport.value);
  if (content.value) resizeObserver.observe(content.value);

  mutationObserver = new MutationObserver(() => scheduleMeasure(true));
  if (content.value) {
    mutationObserver.observe(content.value, {
      characterData: true,
      childList: true,
      subtree: true,
    });
  }

  scheduleMeasure(true);
});

onBeforeUnmount(() => {
  mounted = false;
  cancelAnimation();
  resizeObserver?.disconnect();
  mutationObserver?.disconnect();
  if (measureFrame !== null) cancelAnimationFrame(measureFrame);
});
</script>

<template>
  <span
    ref="viewport"
    data-slot="scrolling-text"
    :data-mode="mode"
    :data-overflowing="overflowing"
    :class="cn('block min-w-0 overflow-hidden whitespace-nowrap', props.class)"
    @pointerenter="handlePointerEnter"
    @pointerleave="handlePointerLeave"
    @focusin="handleFocusIn"
    @focusout="handleFocusOut"
  >
    <span ref="content" class="inline-block w-max">
      <slot />
    </span>
  </span>
</template>
