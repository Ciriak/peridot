import type { ReleaseResult } from "@peridot/contracts";

export type ExternalResultFilter = "all" | "music" | "audiobook";

export function filterReleaseResults(
  releases: readonly ReleaseResult[],
  filter: ExternalResultFilter,
): ReleaseResult[] {
  const filtered =
    filter === "all"
      ? [...releases]
      : releases.filter((release) => release.mediaType === filter);
  return filtered.sort((left, right) => {
    if (left.seeders === null && right.seeders === null) return 0;
    if (left.seeders === null) return 1;
    if (right.seeders === null) return -1;
    return right.seeders - left.seeders;
  });
}
