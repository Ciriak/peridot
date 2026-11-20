export interface ArtworkLoadResult {
  blob: Blob | null;
  fromCache: boolean;
}

export async function loadArtworkCacheFirst(
  readCache: () => Promise<Blob | null>,
  loadRemote: () => Promise<Blob | null>,
): Promise<ArtworkLoadResult> {
  const cached = await readCache();
  if (cached) return { blob: cached, fromCache: true };
  return { blob: await loadRemote(), fromCache: false };
}
