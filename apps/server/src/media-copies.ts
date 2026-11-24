import type { Database } from "./database.js";
import type { LibrarySourceRow, MediaCopyRow } from "./prisma/models.js";

type MediaCopyDatabase = Pick<Database, "orm">;

export interface RankedMediaCopy {
  copy: MediaCopyRow;
  source: LibrarySourceRow;
}

function metadataCompleteness(copy: MediaCopyRow): number {
  return [
    copy.title,
    copy.artist,
    copy.artistCredits,
    copy.albumArtist,
    copy.albumArtistCredits,
    copy.album,
    copy.genres,
    copy.discNumber,
    copy.trackNumber,
    copy.durationMs,
    copy.publishedAt,
    copy.coverId,
    copy.recordingIdentityKeys === "[]" ? null : copy.recordingIdentityKeys,
  ].filter((value) => value !== null && value !== "").length;
}

export function compareMediaCopies(
  left: RankedMediaCopy,
  right: RankedMediaCopy,
): number {
  const availability =
    Number(right.copy.available) - Number(left.copy.available);
  if (availability !== 0) return availability;

  const lossless = right.copy.audioLossless - left.copy.audioLossless;
  if (lossless !== 0) return lossless;

  const bitrate =
    (right.copy.audioBitrate ?? 0) - (left.copy.audioBitrate ?? 0);
  if (bitrate !== 0) return bitrate;

  if (left.copy.fileSizeBytes !== right.copy.fileSizeBytes) {
    return left.copy.fileSizeBytes > right.copy.fileSizeBytes ? -1 : 1;
  }

  const completeness =
    metadataCompleteness(right.copy) - metadataCompleteness(left.copy);
  if (completeness !== 0) return completeness;

  const sourceOrder = left.source.position - right.source.position;
  if (sourceOrder !== 0) return sourceOrder;

  const importedAt =
    left.copy.createdAt.getTime() - right.copy.createdAt.getTime();
  if (importedAt !== 0) return importedAt;

  return left.copy.id.localeCompare(right.copy.id);
}

export async function mediaCopiesWithSources(
  database: MediaCopyDatabase,
  mediaId: string,
  options: { availableOnly?: boolean } = {},
): Promise<RankedMediaCopy[]> {
  const copies = await database.orm.MediaCopy.where({ mediaId }).all();
  const usable = options.availableOnly
    ? copies.filter((copy) => Boolean(copy.available))
    : copies;
  if (!usable.length) return [];
  const sources = await database.orm.LibrarySource.where((source) =>
    source.id.in([...new Set(usable.map((copy) => copy.librarySourceId))]),
  ).all();
  const sourceById = new Map(sources.map((source) => [source.id, source]));
  return usable
    .flatMap((copy) => {
      const source = sourceById.get(copy.librarySourceId);
      return source ? [{ copy, source }] : [];
    })
    .sort(compareMediaCopies);
}

export async function rankedMediaCopies(
  database: MediaCopyDatabase,
  mediaId: string,
): Promise<RankedMediaCopy[]> {
  return mediaCopiesWithSources(database, mediaId, { availableOnly: true });
}

export async function primaryMediaCopy(
  database: MediaCopyDatabase,
  mediaId: string,
): Promise<RankedMediaCopy | null> {
  return (await rankedMediaCopies(database, mediaId))[0] ?? null;
}

export async function primaryCopiesForMediaIds(
  database: MediaCopyDatabase,
  mediaIds: readonly string[],
): Promise<Map<string, RankedMediaCopy>> {
  if (!mediaIds.length) return new Map();
  const copies = await database.orm.MediaCopy.where((copy) =>
    copy.mediaId.in([...new Set(mediaIds)]),
  )
    .where({ available: 1 })
    .all();
  const sources = await database.orm.LibrarySource.where((source) =>
    source.id.in([...new Set(copies.map((copy) => copy.librarySourceId))]),
  ).all();
  const sourceById = new Map(sources.map((source) => [source.id, source]));
  const byMedia = new Map<string, RankedMediaCopy[]>();
  for (const copy of copies) {
    const source = sourceById.get(copy.librarySourceId);
    if (!source) continue;
    const ranked = byMedia.get(copy.mediaId) ?? [];
    ranked.push({ copy, source });
    byMedia.set(copy.mediaId, ranked);
  }
  return new Map(
    [...byMedia.entries()].flatMap(([mediaId, ranked]) => {
      ranked.sort(compareMediaCopies);
      return ranked[0] ? [[mediaId, ranked[0]] as const] : [];
    }),
  );
}

export async function refreshCanonicalMediaFromCopiesBatch(
  database: MediaCopyDatabase,
  mediaIds: readonly string[],
): Promise<Map<string, RankedMediaCopy>> {
  const uniqueIds = [...new Set(mediaIds)];
  if (!uniqueIds.length) return new Map();
  const copies = await database.orm.MediaCopy.where((copy) =>
    copy.mediaId.in(uniqueIds),
  )
    .where({ available: 1 })
    .all();
  const sources = await database.orm.LibrarySource.where((source) =>
    source.id.in([...new Set(copies.map((copy) => copy.librarySourceId))]),
  ).all();
  const sourceById = new Map(sources.map((source) => [source.id, source]));
  const byMedia = new Map<string, RankedMediaCopy[]>();
  for (const copy of copies) {
    const source = sourceById.get(copy.librarySourceId);
    if (!source) continue;
    const ranked = byMedia.get(copy.mediaId) ?? [];
    ranked.push({ copy, source });
    byMedia.set(copy.mediaId, ranked);
  }
  const primaryByMedia = new Map<string, RankedMediaCopy>();
  for (const mediaId of uniqueIds) {
    const ranked = (byMedia.get(mediaId) ?? []).sort(compareMediaCopies);
    const primary = ranked[0] ?? null;
    if (!primary) {
      await database.orm.Media.where({ id: mediaId }).update({
        available: 0,
        catalogProjectionPending: 1,
      });
      continue;
    }
    primaryByMedia.set(mediaId, primary);
    const artwork =
      ranked.find(({ copy }) => copy.coverId)?.copy.coverId ?? null;
    const copy = primary.copy;
    await database.orm.Media.where({ id: mediaId }).update({
      mediaType: copy.mediaType,
      mediaTypeOrigin: copy.mediaTypeOrigin,
      title: copy.title,
      artist: copy.artist,
      artistCredits: copy.artistCredits,
      albumArtist: copy.albumArtist,
      albumArtistCredits: copy.albumArtistCredits,
      album: copy.album,
      genres: copy.genres,
      discNumber: copy.discNumber,
      trackNumber: copy.trackNumber,
      durationMs: copy.durationMs,
      publishedAt: copy.publishedAt,
      coverId: artwork,
      available: 1,
      metadataVersion: copy.metadataVersion,
      catalogProjectionPending: 1,
    });
  }
  return primaryByMedia;
}

export async function refreshCanonicalMediaFromCopies(
  database: MediaCopyDatabase,
  mediaId: string,
): Promise<RankedMediaCopy | null> {
  const ranked = await rankedMediaCopies(database, mediaId);
  const primary = ranked[0] ?? null;
  if (!primary) {
    await database.orm.Media.where({ id: mediaId }).update({
      available: 0,
      catalogProjectionPending: 1,
    });
    return null;
  }
  const artwork = ranked.find(({ copy }) => copy.coverId)?.copy.coverId ?? null;
  const copy = primary.copy;
  await database.orm.Media.where({ id: mediaId }).update({
    mediaType: copy.mediaType,
    mediaTypeOrigin: copy.mediaTypeOrigin,
    title: copy.title,
    artist: copy.artist,
    artistCredits: copy.artistCredits,
    albumArtist: copy.albumArtist,
    albumArtistCredits: copy.albumArtistCredits,
    album: copy.album,
    genres: copy.genres,
    discNumber: copy.discNumber,
    trackNumber: copy.trackNumber,
    durationMs: copy.durationMs,
    publishedAt: copy.publishedAt,
    coverId: artwork,
    available: 1,
    metadataVersion: copy.metadataVersion,
    catalogProjectionPending: 1,
  });
  return primary;
}
