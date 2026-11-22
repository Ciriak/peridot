import { useEventListener, useMediaQuery, useSwipe } from "@vueuse/core";
import { computed, readonly, ref, watch, type Ref } from "vue";
import {
  shouldSettleSidebarOpen,
  sidebarProgressAfterDrag,
} from "../lib/sidebar-swipe";

const MOBILE_SIDEBAR_QUERY = "(max-width: 767px)";
const MIN_HORIZONTAL_DRAG_PX = 4;
const HORIZONTAL_CONTROL_SELECTOR =
  'input, textarea, select, [data-slot="slider"], [data-sidebar-swipe-ignore]';

export function useSwipeSidebar(
  target: Ref<HTMLElement | null>,
  drawer: Ref<HTMLElement | null>,
  open: Ref<boolean>,
) {
  const isMobile = useMediaQuery(MOBILE_SIDEBAR_QUERY);
  const progress = ref(0);
  const dragging = ref(false);
  const interactive = computed(() => open.value || dragging.value);
  const drawerStyle = computed(() =>
    isMobile.value
      ? {
          transform: `translate3d(${progress.value * 100 - 100}%, 0, 0)`,
        }
      : undefined,
  );
  const backdropStyle = computed(() => ({ opacity: progress.value }));
  let gestureActive = false;
  let dragStarted = false;
  let gestureStartProgress = 0;
  let gestureWidth = 0;

  watch(
    open,
    (isOpen) => {
      progress.value = isOpen ? 1 : 0;
    },
    { immediate: true },
  );

  const swipe = useSwipe(target, {
    passive: true,
    threshold: 50,
    onSwipeStart(event) {
      const suppressOpen =
        !open.value &&
        event.target instanceof Element &&
        event.target.closest(HORIZONTAL_CONTROL_SELECTOR) !== null;
      gestureActive = !suppressOpen && isMobile.value;
      dragStarted = false;
      gestureStartProgress = open.value ? 1 : 0;
      gestureWidth = drawer.value?.getBoundingClientRect().width ?? 0;
    },
    onSwipeEnd(event) {
      finishGesture(event.type === "touchcancel");
    },
  });

  watch(
    [swipe.lengthX, swipe.lengthY],
    ([lengthX, lengthY]) => {
      if (!gestureActive || !isMobile.value || gestureWidth <= 0) return;
      const deltaX = -lengthX;
      const deltaY = lengthY;
      if (
        !dragStarted &&
        (Math.abs(deltaX) < MIN_HORIZONTAL_DRAG_PX ||
          Math.abs(deltaX) <= Math.abs(deltaY))
      ) {
        return;
      }
      dragStarted = true;
      dragging.value = true;
      progress.value = sidebarProgressAfterDrag({
        startProgress: gestureStartProgress,
        deltaX,
        width: gestureWidth,
      });
    },
    { flush: "sync" },
  );

  function finishGesture(cancelled = false) {
    if (!gestureActive) return;
    gestureActive = false;
    dragStarted = false;
    dragging.value = false;
    if (cancelled) {
      progress.value = open.value ? 1 : 0;
      return;
    }
    const shouldOpen = shouldSettleSidebarOpen(progress.value);
    open.value = shouldOpen;
    progress.value = shouldOpen ? 1 : 0;
  }

  useEventListener(target, "touchend", () => finishGesture());
  useEventListener(target, "touchcancel", () => finishGesture(true));

  return {
    isMobile,
    dragging: readonly(dragging),
    interactive,
    drawerStyle,
    backdropStyle,
  };
}
