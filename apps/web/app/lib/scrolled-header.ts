export interface ScrolledHeaderVisibility {
  isIntersecting: boolean;
  targetBottom: number;
  rootTop: number;
}

export function shouldShowScrolledHeader({
  isIntersecting,
  targetBottom,
  rootTop,
}: ScrolledHeaderVisibility) {
  return !isIntersecting && targetBottom <= rootTop;
}
