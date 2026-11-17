export const SCROLLING_TEXT_SPEED_PX_PER_SECOND = 30;
export const SCROLLING_TEXT_HOLD_MS = 1500;
export const SCROLLING_TEXT_MOBILE_MEDIA_QUERY = "(max-width: 47.999rem)";
const OVERFLOW_TOLERANCE_PX = 1;

export function scrollingTextActivatesAutomatically(
  mode: "always" | "hover",
  mobile: boolean,
) {
  return mode === "always" || mobile;
}

export function scrollingTextOverflowDistance(
  contentWidth: number,
  viewportWidth: number,
) {
  if (!Number.isFinite(contentWidth) || !Number.isFinite(viewportWidth)) {
    return 0;
  }

  const distance = contentWidth - viewportWidth;
  return distance > OVERFLOW_TOLERANCE_PX ? distance : 0;
}

export function scrollingTextTravelDuration(distance: number) {
  if (!Number.isFinite(distance) || distance <= 0) {
    return 0;
  }

  return (distance / SCROLLING_TEXT_SPEED_PX_PER_SECOND) * 1000;
}

export function scrollingTextLoopDuration(distance: number) {
  const travelDuration = scrollingTextTravelDuration(distance);
  return travelDuration > 0
    ? travelDuration * 2 + SCROLLING_TEXT_HOLD_MS * 2
    : 0;
}

export function scrollingTextKeyframes(distance: number) {
  const travelDuration = scrollingTextTravelDuration(distance);
  const loopDuration = scrollingTextLoopDuration(distance);
  if (travelDuration <= 0 || loopDuration <= 0) return [];

  const leftHoldOffset =
    (travelDuration + SCROLLING_TEXT_HOLD_MS) / loopDuration;
  const rightHoldOffset =
    (travelDuration * 2 + SCROLLING_TEXT_HOLD_MS) / loopDuration;

  return [
    { offset: 0, transform: "translateX(0)" },
    {
      offset: travelDuration / loopDuration,
      transform: `translateX(-${distance}px)`,
    },
    {
      offset: leftHoldOffset,
      transform: `translateX(-${distance}px)`,
    },
    { offset: rightHoldOffset, transform: "translateX(0)" },
    { offset: 1, transform: "translateX(0)" },
  ];
}
