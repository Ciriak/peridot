export function sidebarProgressAfterDrag({
  startProgress,
  deltaX,
  width,
}: {
  startProgress: number;
  deltaX: number;
  width: number;
}): number {
  if (width <= 0) return startProgress;
  return Math.min(1, Math.max(0, startProgress + deltaX / width));
}

export function shouldSettleSidebarOpen(progress: number): boolean {
  return progress >= 0.5;
}
