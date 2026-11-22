export type PlayerGestureAxis = "horizontal" | "vertical" | null;
export type TrackSwipeDirection = "next" | "previous" | null;

const AXIS_LOCK_DISTANCE = 8;

export function playerGestureAxis(
  lengthX: number,
  lengthY: number,
): PlayerGestureAxis {
  const horizontal = Math.abs(lengthX);
  const vertical = Math.abs(lengthY);
  if (Math.max(horizontal, vertical) < AXIS_LOCK_DISTANCE) return null;
  if (horizontal > vertical) return "horizontal";
  if (vertical > horizontal) return "vertical";
  return null;
}

export function trackSwipeDirection(deltaX: number): TrackSwipeDirection {
  if (deltaX < 0) return "next";
  if (deltaX > 0) return "previous";
  return null;
}

export function trackSwipeQualifies({
  distance,
  width,
  speed,
}: {
  distance: number;
  width: number;
  speed: number;
}): boolean {
  const displacement = Math.abs(distance);
  return (
    displacement >= Math.max(64, width * 0.2) ||
    (displacement >= 48 && speed >= 0.4)
  );
}

export function playerDismissQualifies({
  distance,
  height,
  speed,
}: {
  distance: number;
  height: number;
  speed: number;
}): boolean {
  return (
    distance >= Math.max(96, height * 0.2) || (distance >= 48 && speed >= 0.55)
  );
}
