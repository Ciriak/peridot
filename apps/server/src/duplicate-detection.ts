import type { MessageDescriptor } from "@peridot/contracts";
import type { CatalogService } from "./catalog.js";
import type { Database } from "./database.js";
import { message } from "./messages.js";
import type {
  LibrarySourceRow,
  MediaCopyRow,
  MediaRow,
  TaskRow,
} from "./prisma/models.js";
import { normalizeSearchText } from "./search-text.js";
import { effectiveMediaFields } from "./media-response.js";
import {
  parseRecordingIdentityKeys,
  recordingIdentity,
} from "./track-identities.js";
import type { TaskExecutionResult, TaskService } from "./tasks.js";
import { refreshCanonicalMediaFromCopies } from "./media-copies.js";

const ALGORITHM_VERSION = 2;
const STATE_ID = "media";
const PAGE_SIZE = 1_000;
const DURATION_TOLERANCE_MS = 1_000;

interface Candidate {
  media: MediaRow;
  copy: MediaCopyRow;
  sourcePosition: number;
  title: string;
  artistKey: string;
  albumKey: string;
  identities: string[];
}

export interface MediaMatchResult {
  mediaCount: number;
  groupCount: number;
  mergedCount: number;
  referencesMoved: number;
}

class DisjointSet {
  private readonly parent = new Map<string, string>();

  add(id: string): void {
    if (!this.parent.has(id)) this.parent.set(id, id);
  }

  find(id: string): string {
    this.add(id);
    const parent = this.parent.get(id)!;
    if (parent === id) return id;
    const root = this.find(parent);
    this.parent.set(id, root);
    return root;
  }

  union(left: string, right: string): void {
    const leftRoot = this.find(left);
    const rightRoot = this.find(right);
    if (leftRoot === rightRoot) return;
    const [first, second] =
      leftRoot.localeCompare(rightRoot) <= 0
        ? [leftRoot, rightRoot]
        : [rightRoot, leftRoot];
    this.parent.set(second, first);
  }
}

function compareCandidates(left: Candidate, right: Candidate): number {
  const created =
    left.media.createdAt.getTime() - right.media.createdAt.getTime();
  if (created !== 0) return created;
  return left.media.id.localeCompare(right.media.id);
}

function identityKeys(media: MediaRow, copy: MediaCopyRow): string[] {
  const keys = [
    ...parseRecordingIdentityKeys(copy.recordingIdentityKeys),
    ...(media.metadataProviderKind === "musicbrainz"
      ? [
          recordingIdentity("musicbrainz", media.metadataExternalTrackId),
        ].filter((value): value is string => Boolean(value))
      : []),
  ];
  return [...new Set(keys)];
}

function fallbackKey(candidate: Candidate, durationBucket: number): string {
  return JSON.stringify([
    candidate.media.mediaType,
    candidate.title,
    candidate.artistKey,
    candidate.media.mediaType === "music" ? "" : candidate.albumKey,
    durationBucket,
  ]);
}

function preferredCopy(
  copies: readonly MediaCopyRow[],
  sourcePositions: ReadonlyMap<string, number>,
): MediaCopyRow | null {
  return (
    [...copies]
      .filter((copy) => copy.available)
      .sort((left, right) => {
        const lossless = right.audioLossless - left.audioLossless;
        if (lossless !== 0) return lossless;
        const bitrate = (right.audioBitrate ?? 0) - (left.audioBitrate ?? 0);
        if (bitrate !== 0) return bitrate;
        const source =
          (sourcePositions.get(left.librarySourceId) ?? 1_000_000) -
          (sourcePositions.get(right.librarySourceId) ?? 1_000_000);
        if (source !== 0) return source;
        return left.id.localeCompare(right.id);
      })[0] ?? null
  );
}

export class MediaMatchService {
  constructor(
    private readonly database: Database,
    private readonly catalog: CatalogService,
  ) {}

  async needsRun(): Promise<boolean> {
    const state = await this.database.orm.MediaMatchState.first({
      id: STATE_ID,
    });
    return !state || state.algorithmVersion < ALGORITHM_VERSION;
  }

  async runTask(
    task: TaskRow,
    tasks: TaskService,
    signal: AbortSignal,
  ): Promise<TaskExecutionResult> {
    const result = await this.detect(signal, async (completed, total) => {
      await tasks.updateProgress(task.id, completed, total);
    });
    return { details: mediaMatchDetails(result) };
  }

  async detect(
    signal: AbortSignal,
    onProgress?: (completed: number, total: number) => Promise<void> | void,
  ): Promise<MediaMatchResult> {
    if (signal.aborted) throw new DOMException("Stopped", "AbortError");
    const sources: LibrarySourceRow[] =
      await this.database.orm.LibrarySource.where((source) =>
        source.removedAt.isNull(),
      )
        .orderBy((source) => source.position.asc())
        .all();
    const sourcePositions = new Map(
      sources.map((source, index) => [source.id, source.position ?? index]),
    );
    const mediaRows: MediaRow[] = [];
    for (let offset = 0; ; offset += PAGE_SIZE) {
      const page = await this.database.orm.Media.where({ available: 1 })
        .orderBy((media) => media.id.asc())
        .offset(offset)
        .limit(PAGE_SIZE)
        .all();
      mediaRows.push(...page);
      if (page.length < PAGE_SIZE) break;
    }
    const copies = await this.database.orm.MediaCopy.all();
    const copiesByMedia = new Map<string, MediaCopyRow[]>();
    for (const copy of copies) {
      const group = copiesByMedia.get(copy.mediaId) ?? [];
      group.push(copy);
      copiesByMedia.set(copy.mediaId, group);
    }
    const candidates = mediaRows.flatMap((media): Candidate[] => {
      const copy = preferredCopy(
        copiesByMedia.get(media.id) ?? [],
        sourcePositions,
      );
      if (!copy) return [];
      const fields = effectiveMediaFields(media);
      const artists = fields.artists
        .map(normalizeSearchText)
        .filter(Boolean)
        .sort()
        .join("\u0000");
      return [
        {
          media,
          copy,
          sourcePosition:
            sourcePositions.get(copy.librarySourceId) ?? 1_000_000,
          title: normalizeSearchText(fields.title),
          artistKey: artists,
          albumKey: normalizeSearchText(fields.album ?? ""),
          identities: identityKeys(media, copy),
        },
      ];
    });
    const candidateById = new Map(
      candidates.map((candidate) => [candidate.media.id, candidate]),
    );
    const groups = new DisjointSet();
    for (const candidate of candidates) groups.add(candidate.media.id);

    const identityGroups = new Map<string, string[]>();
    for (const candidate of candidates) {
      for (const identity of candidate.identities) {
        const key = `${candidate.media.mediaType}\u0000${identity}`;
        const ids = identityGroups.get(key) ?? [];
        ids.push(candidate.media.id);
        identityGroups.set(key, ids);
      }
    }
    for (const ids of identityGroups.values()) {
      for (const id of ids.slice(1)) groups.union(ids[0]!, id);
    }

    const fallbackBuckets = new Map<string, Candidate[]>();
    for (const candidate of candidates) {
      if (
        !candidate.title ||
        !candidate.artistKey ||
        candidate.media.durationMs === null ||
        candidate.media.durationMs < 0
      ) {
        continue;
      }
      const bucket = Math.floor(candidate.media.durationMs / 1_000);
      const key = fallbackKey(candidate, bucket);
      const entries = fallbackBuckets.get(key) ?? [];
      entries.push(candidate);
      fallbackBuckets.set(key, entries);
    }
    for (const entries of fallbackBuckets.values()) {
      for (const candidate of entries.slice(1)) {
        groups.union(entries[0]!.media.id, candidate.media.id);
      }
      for (const candidate of entries) {
        const bucket = Math.floor(candidate.media.durationMs! / 1_000);
        for (const adjacent of [bucket - 1, bucket + 1]) {
          for (const neighbour of fallbackBuckets.get(
            fallbackKey(candidate, adjacent),
          ) ?? []) {
            if (
              Math.abs(
                candidate.media.durationMs! - neighbour.media.durationMs!,
              ) <= DURATION_TOLERANCE_MS
            ) {
              groups.union(candidate.media.id, neighbour.media.id);
            }
          }
        }
      }
    }

    const members = new Map<string, Candidate[]>();
    for (const candidate of candidates) {
      const root = groups.find(candidate.media.id);
      const group = members.get(root) ?? [];
      group.push(candidate);
      members.set(root, group);
    }
    const matchGroups = [...members.values()]
      .filter((group) => group.length > 1)
      .map((group) => group.sort(compareCandidates));

    let mergedCount = 0;
    let referencesMoved = 0;
    let completed = 0;
    await onProgress?.(completed, candidates.length);
    for (const group of matchGroups) {
      if (signal.aborted) throw new DOMException("Stopped", "AbortError");
      const survivor = group[0]!;
      for (const duplicate of group.slice(1)) {
        const current = candidateById.get(duplicate.media.id);
        if (!current) continue;
        await this.database.transaction(async (transaction) => {
          referencesMoved += await this.transferReferences(
            transaction,
            current.media,
            survivor.media.id,
          );
          await transaction.orm.MediaCopy.where({
            mediaId: current.media.id,
          }).update({ mediaId: survivor.media.id });
          await refreshCanonicalMediaFromCopies(transaction, survivor.media.id);
          await transaction.orm.MediaAlias.where({
            aliasId: current.media.id,
          }).deleteAndCount();
          await transaction.orm.MediaAlias.create({
            aliasId: current.media.id,
            mediaId: survivor.media.id,
          });
          await transaction.orm.CatalogMedia.where({
            id: current.media.id,
          }).deleteAndCount();
          await transaction.orm.Media.where({
            id: current.media.id,
          }).deleteAndCount();
          await transaction.orm.Media.where({ id: survivor.media.id }).update({
            catalogProjectionPending: 1,
          });
        });
        mergedCount += 1;
        completed += 1;
      }
      await this.catalog.reindexMedia(survivor.media.id, "media-match");
    }
    completed = candidates.length;
    await onProgress?.(completed, candidates.length);
    await this.catalog.flushChanges();
    const result = {
      mediaCount: candidates.length,
      groupCount: matchGroups.length,
      mergedCount,
      referencesMoved,
    };
    const state = {
      algorithmVersion: ALGORITHM_VERSION,
      lastCompletedAt: new Date(),
      mergedCount: result.mergedCount,
      groupCount: result.groupCount,
    };
    const existing = await this.database.orm.MediaMatchState.first({
      id: STATE_ID,
    });
    if (existing) {
      await this.database.orm.MediaMatchState.where({ id: STATE_ID }).update(
        state,
      );
    } else {
      await this.database.orm.MediaMatchState.create({
        id: STATE_ID,
        ...state,
      });
    }
    return result;
  }

  private async transferReferences(
    transaction: Parameters<Parameters<Database["transaction"]>[0]>[0],
    duplicate: MediaRow,
    canonicalId: string,
  ): Promise<number> {
    const canonical = await transaction.orm.Media.first({ id: canonicalId });
    if (!canonical) return 0;
    if (!canonical.metadataProviderId && duplicate.metadataProviderId) {
      await transaction.orm.Media.where({ id: canonicalId }).update({
        metadataMode: duplicate.metadataMode,
        metadataTitle: duplicate.metadataTitle,
        metadataArtist: duplicate.metadataArtist,
        metadataArtistCredits: duplicate.metadataArtistCredits,
        metadataAlbumArtist: duplicate.metadataAlbumArtist,
        metadataAlbumArtistCredits: duplicate.metadataAlbumArtistCredits,
        metadataAlbum: duplicate.metadataAlbum,
        metadataGenres: duplicate.metadataGenres,
        metadataDiscNumber: duplicate.metadataDiscNumber,
        metadataTrackNumber: duplicate.metadataTrackNumber,
        metadataProviderId: duplicate.metadataProviderId,
        metadataProviderKind: duplicate.metadataProviderKind,
        metadataProviderName: duplicate.metadataProviderName,
        metadataExternalTrackId: duplicate.metadataExternalTrackId,
        metadataExternalReleaseId: duplicate.metadataExternalReleaseId,
        metadataSourceUrl: duplicate.metadataSourceUrl,
        metadataDetails: duplicate.metadataDetails,
        metadataMatchedAt: duplicate.metadataMatchedAt,
        metadataAttemptedSignature: duplicate.metadataAttemptedSignature,
      });
    }
    let moved = 0;
    for (const like of await transaction.orm.MediaLike.where({
      mediaId: duplicate.id,
    }).all()) {
      const existing = await transaction.orm.MediaLike.first({
        userId: like.userId,
        mediaId: canonicalId,
      });
      if (!existing) {
        await transaction.orm.MediaLike.create({
          userId: like.userId,
          mediaId: canonicalId,
          createdAt: like.createdAt,
        });
      }
      await transaction.orm.MediaLike.where({
        userId: like.userId,
        mediaId: duplicate.id,
      }).delete();
      moved += 1;
    }
    moved += await transaction.orm.MediaPlayEvent.where({
      mediaId: duplicate.id,
    }).updateAndCount({ mediaId: canonicalId });

    const playlistItems = await transaction.orm.PlaylistItem.where({
      mediaId: duplicate.id,
    }).all();
    const affectedPlaylists = new Set<string>();
    const effective = effectiveMediaFields(canonical);
    const canonicalIdentityKey = `catalog:${encodeURIComponent(canonicalId)}`;
    for (const item of playlistItems) {
      affectedPlaylists.add(item.playlistId);
      const existing = await transaction.orm.PlaylistItem.first({
        playlistId: item.playlistId,
        identityKey: canonicalIdentityKey,
      });
      if (existing && existing.id !== item.id) {
        await transaction.orm.PlaylistItem.where({ id: item.id }).delete();
      } else {
        await transaction.orm.PlaylistItem.where({ id: item.id }).update({
          mediaId: canonicalId,
          identityKey: canonicalIdentityKey,
          snapshotTitle: effective.title,
          snapshotArtist: effective.artist,
          snapshotAlbum: effective.album,
          snapshotDuration: effective.durationMs,
          matchStatus: "matched",
        });
      }
      moved += 1;
    }
    for (const playlistId of affectedPlaylists) {
      const items = await transaction.orm.PlaylistItem.where({ playlistId })
        .orderBy((item) => item.position.asc())
        .all();
      for (let index = 0; index < items.length; index += 1) {
        const item = items[index]!;
        if (item.position !== index) {
          await transaction.orm.PlaylistItem.where({ id: item.id }).update({
            position: index,
          });
        }
      }
    }
    return moved;
  }
}

export function mediaMatchDetails(result: MediaMatchResult): Array<{
  key: string;
  value: string;
  labelMessage: MessageDescriptor;
  valueMessage: null;
}> {
  return [
    {
      key: "media.count",
      value: String(result.mediaCount),
      labelMessage: message("task.detail.tracks"),
      valueMessage: null,
    },
    {
      key: "media.groups",
      value: String(result.groupCount),
      labelMessage: message("task.detail.duplicateGroups"),
      valueMessage: null,
    },
    {
      key: "media.merged",
      value: String(result.mergedCount),
      labelMessage: message("task.detail.duplicatesHidden"),
      valueMessage: null,
    },
    {
      key: "media.referencesMoved",
      value: String(result.referencesMoved),
      labelMessage: message("task.detail.referencesMoved"),
      valueMessage: null,
    },
  ];
}
