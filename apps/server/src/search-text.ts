export function normalizeSearchText(value: string): string {
  return value.normalize("NFKD").replace(/\p{M}/gu, "").trim().toLowerCase();
}

export function searchTerms(
  values: readonly (string | null | undefined)[],
): string[] {
  return [
    ...new Set(
      values
        .filter((value): value is string => Boolean(value))
        .flatMap((value) =>
          normalizeSearchText(value)
            .split(/[^\p{L}\p{N}]+/u)
            .filter((term) => term.length > 0),
        ),
    ),
  ].slice(0, 64);
}
