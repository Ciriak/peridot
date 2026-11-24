import type { MediaResponse } from "@peridot/contracts";

export interface OfflineCollectionSaveResult {
  completed: number;
  failure: { track: MediaResponse; reason: unknown } | null;
  savedTrackIds: string[];
  total: number;
}

interface OfflineCollectionSaveOptions {
  isSaved: (mediaId: string) => boolean;
  save: (
    track: MediaResponse,
    onProgress?: (progress: number | null) => void,
  ) => Promise<void>;
  onProgress?: (progress: number | null) => void;
}

export async function saveOfflineCollection(
  tracks: MediaResponse[],
  options: OfflineCollectionSaveOptions,
): Promise<OfflineCollectionSaveResult> {
  const available = tracks.filter((track) => track.available);
  const total = available.length;
  if (!total) {
    return {
      completed: 0,
      failure: null,
      savedTrackIds: [],
      total: 0,
    };
  }

  const alreadySaved = available.filter((track) => options.isSaved(track.id));
  const missing = available.filter((track) => !options.isSaved(track.id));
  let completed = alreadySaved.length;
  const savedTrackIds = alreadySaved.map((track) => track.id);
  options.onProgress?.(Math.round((completed / total) * 100));

  for (const track of missing) {
    try {
      await options.save(track, (progress) => {
        options.onProgress?.(
          progress === null
            ? null
            : Math.round(((completed + progress / 100) / total) * 100),
        );
      });
    } catch (reason) {
      return {
        completed,
        failure: { track, reason },
        savedTrackIds,
        total,
      };
    }
    completed += 1;
    savedTrackIds.push(track.id);
    options.onProgress?.(Math.round((completed / total) * 100));
  }

  return {
    completed,
    failure: null,
    savedTrackIds,
    total,
  };
}
