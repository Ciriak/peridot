import { useEventListener, useSwipe } from "@vueuse/core";
import type { MediaResponse } from "@peridot/contracts";
import {
  computed,
  nextTick,
  onBeforeUnmount,
  ref,
  watch,
  type ComputedRef,
  type Ref,
} from "vue";
import {
  playerDismissQualifies,
  playerGestureAxis,
  trackSwipeDirection,
  trackSwipeQualifies,
  type PlayerGestureAxis,
} from "../lib/player-gestures";

const PLAYER_GESTURE_CONTROL_SELECTOR =
  'button, a, input, textarea, select, [role="button"], [role="slider"], [data-slot="slider"], [contenteditable="true"], [data-player-gesture-ignore]';
const SETTLE_DURATION_MS = 200;

export function useSwipePlayer({
  target,
  scrollArea,
  open,
  active,
  canGoNext,
  nextTrack,
  previousTrack,
  prepareNextTrack,
  next,
  previous,
  close,
}: {
  target: Ref<HTMLElement | null>;
  scrollArea: Ref<HTMLElement | null>;
  open: ComputedRef<boolean>;
  active: ComputedRef<MediaResponse | null>;
  canGoNext: ComputedRef<boolean>;
  nextTrack: ComputedRef<MediaResponse | null>;
  previousTrack: ComputedRef<MediaResponse | null>;
  prepareNextTrack: () => MediaResponse | null;
  next: () => void;
  previous: () => void;
  close: () => void;
}) {
  const surfaceOffsetY = ref(0);
  const carouselOffsetX = ref(0);
  const surfaceDragging = ref(false);
  const carouselDragging = ref(false);
  const surfaceAnimating = ref(false);
  const carouselAnimating = ref(false);
  const axis = ref<PlayerGestureAxis>(null);
  let gestureActive = false;
  let gestureBlocked = false;
  let gestureStartedInScroll = false;
  let gestureStartedAt = 0;
  let lastMoveAt = 0;
  let gestureWidth = 0;
  let gestureHeight = 0;
  let surfaceTimer: ReturnType<typeof setTimeout> | undefined;
  let carouselTimer: ReturnType<typeof setTimeout> | undefined;

  const surfaceStyle = computed(() => ({
    transform: `translate3d(0, ${surfaceOffsetY.value}px, 0)`,
  }));
  const overlayStyle = computed(() => ({
    opacity: Math.max(0, 1 - surfaceOffsetY.value / Math.max(gestureHeight, 1)),
  }));
  const carouselStyle = computed(() => ({
    transform: `translate3d(calc(-100% + ${carouselOffsetX.value}px), 0, 0)`,
  }));

  const swipe = useSwipe(target, {
    passive: false,
    threshold: 8,
    onSwipeStart(event) {
      if (surfaceAnimating.value || carouselAnimating.value) {
        gestureActive = false;
        gestureBlocked = true;
        return;
      }
      clearTimers();
      gestureActive = false;
      gestureBlocked =
        event.target instanceof Element &&
        event.target.closest(PLAYER_GESTURE_CONTROL_SELECTOR) !== null;
      gestureStartedInScroll =
        event.target instanceof Node &&
        Boolean(scrollArea.value?.contains(event.target));
      gestureStartedAt = performance.now();
      lastMoveAt = gestureStartedAt;
      axis.value = null;
      surfaceOffsetY.value = 0;
      carouselOffsetX.value = 0;
      surfaceDragging.value = false;
      carouselDragging.value = false;
      surfaceAnimating.value = false;
      carouselAnimating.value = false;
      const bounds = target.value?.getBoundingClientRect();
      gestureWidth = bounds?.width ?? 0;
      gestureHeight = bounds?.height ?? 0;
      gestureActive = !gestureBlocked && gestureWidth > 0 && gestureHeight > 0;
    },
    onSwipeEnd(event) {
      finishGesture(event.type === "touchcancel");
    },
  });

  useEventListener(
    target,
    "touchmove",
    (event) => {
      if (
        axis.value === "vertical" &&
        event.cancelable &&
        surfaceOffsetY.value > 0
      ) {
        event.preventDefault();
      }
    },
    { passive: false },
  );

  useEventListener(target, "touchend", () => finishGesture());
  useEventListener(target, "touchcancel", () => finishGesture(true));
  watch(open, (isOpen) => {
    if (isOpen) animatePlayerOpen();
    else resetGestureSurface();
  });

  useSwipeAxisTracking();

  function useSwipeAxisTracking() {
    useEventListener(
      target,
      "touchmove",
      () => {
        if (!gestureActive || gestureBlocked) return;
        if (axis.value === null) {
          const nextAxis = playerGestureAxis(
            swipe.lengthX.value,
            swipe.lengthY.value,
          );
          if (!nextAxis) return;
          const downwardDistance = -swipe.lengthY.value;
          if (nextAxis === "horizontal" && !active.value) {
            gestureBlocked = true;
            return;
          }
          if (
            nextAxis === "vertical" &&
            (downwardDistance <= 0 ||
              (gestureStartedInScroll &&
                (scrollArea.value?.scrollTop ?? 0) > 0))
          ) {
            gestureBlocked = true;
            return;
          }
          axis.value = nextAxis;
          surfaceDragging.value = nextAxis === "vertical";
          carouselDragging.value = nextAxis === "horizontal";
        }

        lastMoveAt = performance.now();
        if (axis.value === "horizontal") {
          updateHorizontalGesture(-swipe.lengthX.value);
        } else if (axis.value === "vertical") {
          surfaceOffsetY.value = Math.max(0, -swipe.lengthY.value);
        }
      },
      { passive: false },
    );
  }

  function updateHorizontalGesture(deltaX: number) {
    const direction = trackSwipeDirection(deltaX);
    const nextAvailable =
      direction === "next"
        ? Boolean(prepareNextTrack() ?? nextTrack.value) && canGoNext.value
        : true;
    const previousAvailable =
      direction === "previous" ? Boolean(previousTrack.value) : true;
    const canMove =
      direction === null ||
      (direction === "next" ? nextAvailable : previousAvailable);
    const limited = Math.max(-gestureWidth, Math.min(gestureWidth, deltaX));
    carouselOffsetX.value = canMove ? limited : limited * 0.22;
  }

  function finishGesture(cancelled = false) {
    if (!gestureActive) return;
    gestureActive = false;
    const endedAt = Math.max(lastMoveAt, performance.now());
    const elapsed = Math.max(1, endedAt - gestureStartedAt);
    const speed =
      Math.max(Math.abs(carouselOffsetX.value), surfaceOffsetY.value) / elapsed;
    surfaceDragging.value = false;
    carouselDragging.value = false;

    if (axis.value === "horizontal") {
      settleHorizontal(cancelled, speed);
    } else if (axis.value === "vertical") {
      settleVertical(cancelled, speed);
    }
    axis.value = null;
  }

  function settleHorizontal(cancelled: boolean, speed: number) {
    const direction = trackSwipeDirection(carouselOffsetX.value);
    const qualifies =
      !cancelled &&
      trackSwipeQualifies({
        distance: carouselOffsetX.value,
        width: gestureWidth,
        speed,
      });
    const canMove =
      direction === "next"
        ? canGoNext.value && Boolean(nextTrack.value)
        : direction === "previous" && Boolean(previousTrack.value);
    if (!qualifies || !direction || !canMove) {
      animateCarouselTo(0, true);
      return;
    }
    carouselAnimating.value = true;
    carouselOffsetX.value = direction === "next" ? -gestureWidth : gestureWidth;
    carouselTimer = setTimeout(() => {
      if (direction === "next") next();
      else previous();
      carouselAnimating.value = false;
      carouselOffsetX.value = 0;
      carouselTimer = undefined;
    }, SETTLE_DURATION_MS);
  }

  function settleVertical(cancelled: boolean, speed: number) {
    const distance = surfaceOffsetY.value;
    const qualifies =
      !cancelled &&
      playerDismissQualifies({
        distance,
        height: gestureHeight,
        speed,
      });
    if (!qualifies) {
      surfaceAnimating.value = true;
      surfaceOffsetY.value = 0;
      surfaceTimer = setTimeout(() => {
        surfaceAnimating.value = false;
        surfaceTimer = undefined;
      }, SETTLE_DURATION_MS);
      return;
    }
    surfaceAnimating.value = true;
    surfaceOffsetY.value = gestureHeight;
    surfaceTimer = setTimeout(() => {
      surfaceTimer = undefined;
      close();
    }, SETTLE_DURATION_MS);
  }

  function animateCarouselTo(offset: number, animate: boolean) {
    carouselAnimating.value = animate;
    carouselOffsetX.value = offset;
    if (!animate) return;
    carouselTimer = setTimeout(() => {
      carouselAnimating.value = false;
      carouselTimer = undefined;
    }, SETTLE_DURATION_MS);
  }

  function clearTimers() {
    if (surfaceTimer !== undefined) clearTimeout(surfaceTimer);
    if (carouselTimer !== undefined) clearTimeout(carouselTimer);
    surfaceTimer = undefined;
    carouselTimer = undefined;
  }

  function resetGestureSurface() {
    clearTimers();
    gestureActive = false;
    gestureBlocked = false;
    axis.value = null;
    surfaceOffsetY.value = 0;
    carouselOffsetX.value = 0;
    surfaceDragging.value = false;
    carouselDragging.value = false;
    surfaceAnimating.value = false;
    carouselAnimating.value = false;
  }

  function animatePlayerOpen() {
    clearTimers();
    gestureActive = false;
    gestureBlocked = false;
    axis.value = null;
    carouselOffsetX.value = 0;
    surfaceDragging.value = false;
    carouselDragging.value = false;
    surfaceAnimating.value = false;
    carouselAnimating.value = false;
    gestureHeight =
      target.value?.getBoundingClientRect().height ??
      (typeof window === "undefined" ? 0 : window.innerHeight);
    surfaceOffsetY.value = gestureHeight;
    void nextTick(() => {
      if (!open.value) return;
      requestAnimationFrame(() => {
        if (!open.value) return;
        surfaceAnimating.value = true;
        surfaceOffsetY.value = 0;
        surfaceTimer = setTimeout(() => {
          surfaceAnimating.value = false;
          gestureHeight =
            target.value?.getBoundingClientRect().height ?? gestureHeight;
          surfaceTimer = undefined;
        }, SETTLE_DURATION_MS);
      });
    });
  }

  onBeforeUnmount(clearTimers);

  return {
    surfaceStyle,
    overlayStyle,
    carouselStyle,
    surfaceDragging,
    carouselDragging,
    surfaceAnimating,
    carouselAnimating,
  };
}
