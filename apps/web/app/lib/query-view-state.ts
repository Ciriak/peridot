export function blockingQueryLoading(
  hasData: boolean,
  isPending: boolean,
): boolean {
  return isPending && !hasData;
}

export function visibleQueryError(
  hasData: boolean,
  error: string | null,
): string | null {
  return hasData ? null : error;
}
