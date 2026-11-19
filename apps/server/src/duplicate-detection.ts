import type { MessageDescriptor } from "@peridot/contracts";
import type { CatalogService } from "./catalog.js";
import type { Database } from "./database.js";
import { effectiveTrackFields } from "./track-response.js";
import { message } from "./messages.js";
import type { TaskRow, TrackRow } from "./prisma/models.js";
import { normalizeSearchText } from "./search-text.js";
import {
  parseRecordingIdentityKeys,
  recordingIdentity,
} from "./track-identities.js";
import type { TaskExecutionResult, TaskService } from "./tasks.js";

const ALGORITHM_VERSION = 1;
const STATE_ID = "duplicates";
const PAGE_SIZE = 1_000;
const DURATION_TOLERANCE_MS = 1_000;

interface Candidate {
  track: TrackRow;
  sourcePosition: number;
  title: string;
  artistKey: string;
  albumKey: string;
  identities: string[];
}

export interface DuplicateDetectionResult {
  trackCount: number;
  groupCount: number;
  hiddenCount: number;
  promotedCount: number;
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

function completeness(track: TrackRow): number {
  return [
    track.coverId,
    track.metadataProviderId,
    track.metadataExternalTrackId,
    track.album,
    track.durationMs,
    track.publishedAt,
  ].filter((value) => value !== null).length;
}

function compareCandidates(left: Candidate, right: Candidate): number {
  const lossless = right.track.audioLossless - left.track.audioLossless;
  if (lossless !== 0) return lossless;
  const bitrate =
    (right.track.audioBitrate ?? 0) - (left.track.audioBitrate ?? 0);
  if (bitrate !== 0) return bitrate;
  if (left.track.fileSizeBytes !== right.track.fileSizeBytes) {
    return left.track.fileSizeBytes > right.track.fileSizeBytes ? -1 : 1;
  }
  const metadata = completeness(right.track) - completeness(left.track);
  if (metadata !== 0) return metadata;
  if (left.sourcePosition !== right.sourcePosition) {
    return left.sourcePosition - right.sourcePosition;
  }
  const created =
    left.track.createdAt.getTime() - right.track.createdAt.getTime();
  if (created !== 0) return created;
  return left.track.id.localeCompare(right.track.id);
}

function identityKeys(track: TrackRow): string[] {
  const keys = [
    ...parseRecordingIdentityKeys(track.recordingIdentityKeys),
    ...(track.metadataProviderKind === "musicbrainz"
      ? [
          recordingIdentity("musicbrainz", track.metadataExternalTrackId),
        ].filter((value): value is string => Boolean(value))
      : []),
  ];
  return [...new Set(keys)];
}

function fallbackKey(candidate: Candidate, durationBucket: number): string {
  return JSON.stringify([
    candidate.track.mediaType,
    candidate.title,
    candidate.artistKey,
    candidate.track.mediaType === "music" ? "" : candidate.albumKey,
    durationBucket,
  ]);
}

async function allAvailableTracks(database: Database): Promise<TrackRow[]> {
  const rows: TrackRow[] = [];
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const page = await database.orm.Track.where({ available: 1 })
      .orderBy((track) => track.id.asc())
      .offset(offset)
      .limit(PAGE_SIZE)
      .all();
    rows.push(...page);
    if (page.length < PAGE_SIZE) return rows;
  }
}

export class DuplicateDetectionService {
  constructor(
    private readonly database: Database,
    private readonly catalog: CatalogService,
  ) {}

  async needsRun(): Promise<boolean> {
    const state = await this.database.orm.DuplicateDetectionState.first({
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
    return { details: duplicateDetails(result) };
  }

  async detect(
    signal: AbortSignal,
    onProgress?: (completed: number, total: number) => Promise<void> | void,
  ): Promise<DuplicateDetectionResult> {
    if (signal.aborted) throw new DOMException("Stopped", "AbortError");
    const [tracks, sources] = await Promise.all([
      allAvailableTracks(this.database),
      this.database.orm.Source.orderBy((source) => source.position.asc()).all(),
    ]);
    const sourcePosition = new Map(
      sources.map((source, index) => [source.id, source.position ?? index]),
    );
    const candidates = tracks.map((track): Candidate => {
      const fields = effectiveTrackFields(track);
      const artists = fields.artists
        .map(normalizeSearchText)
        .filter(Boolean)
        .sort()
        .join("\u0000");
      return {
        track,
        sourcePosition: sourcePosition.get(track.sourceId ?? "") ?? 1_000_000,
        title: normalizeSearchText(fields.title),
        artistKey: artists,
        albumKey: normalizeSearchText(fields.album ?? ""),
        identities: identityKeys(track),
      };
    });
    const candidateById = new Map(
      candidates.map((candidate) => [candidate.track.id, candidate]),
    );
    const groups = new DisjointSet();
    for (const candidate of candidates) groups.add(candidate.track.id);

    const identityGroups = new Map<string, string[]>();
    for (const candidate of candidates) {
      for (const identity of candidate.identities) {
        const key = `${candidate.track.mediaType}\u0000${identity}`;
        const ids = identityGroups.get(key) ?? [];
        ids.push(candidate.track.id);
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
        candidate.track.durationMs === null ||
        candidate.track.durationMs < 0
      ) {
        continue;
      }
      const bucket = Math.floor(candidate.track.durationMs / 1_000);
      const key = fallbackKey(candidate, bucket);
      const entries = fallbackBuckets.get(key) ?? [];
      entries.push(candidate);
      fallbackBuckets.set(key, entries);
    }
    for (const entries of fallbackBuckets.values()) {
      for (const candidate of entries.slice(1)) {
        groups.union(entries[0]!.track.id, candidate.track.id);
      }
      for (const candidate of entries) {
        const bucket = Math.floor(candidate.track.durationMs! / 1_000);
        for (const adjacent of [bucket - 1, bucket + 1]) {
          const neighbours =
            fallbackBuckets.get(fallbackKey(candidate, adjacent)) ?? [];
          for (const neighbour of neighbours) {
            if (
              Math.abs(
                candidate.track.durationMs! - neighbour.track.durationMs!,
              ) <= DURATION_TOLERANCE_MS
            ) {
              groups.union(candidate.track.id, neighbour.track.id);
            }
          }
        }
      }
    }

    const members = new Map<string, Candidate[]>();
    for (const candidate of candidates) {
      const root = groups.find(candidate.track.id);
      const group = members.get(root) ?? [];
      group.push(candidate);
      members.set(root, group);
    }
    const duplicateGroups = [...members.values()]
      .filter((group) => group.length > 1)
      .map((group) => group.sort(compareCandidates));

    const desired = new Map<string, string | null>(
      candidates.map((candidate) => [candidate.track.id, null]),
    );
    for (const group of duplicateGroups) {
      const canonical = group[0]!;
      for (const duplicate of group.slice(1)) {
        desired.set(duplicate.track.id, canonical.track.id);
      }
    }

    let referencesMoved = 0;
    let promotedCount = 0;
    const changed: string[] = [];
    let completed = 0;
    await onProgress?.(completed, candidates.length);
    for (const candidate of candidates) {
      if (signal.aborted) throw new DOMException("Stopped", "AbortError");
      const current = candidateById.get(candidate.track.id)!;
      const nextDuplicateOfId = desired.get(current.track.id) ?? null;
      if (current.track.duplicateOfId !== nextDuplicateOfId) {
        if (!nextDuplicateOfId && current.track.duplicateOfId) {
          promotedCount += 1;
        }
        await this.database.transaction(async (transaction) => {
          if (nextDuplicateOfId) {
            referencesMoved += await this.transferReferences(
              transaction,
              current.track,
              nextDuplicateOfId,
            );
          }
          await transaction.orm.Track.where({ id: current.track.id }).update({
            duplicateOfId: nextDuplicateOfId,
          });
          await transaction.orm.CatalogTrack.where({
            id: current.track.id,
          }).update({
            duplicateOfId: nextDuplicateOfId,
          });
        });
        changed.push(current.track.id);
      }
      completed += 1;
      if (completed % 50 === 0) {
        await onProgress?.(completed, candidates.length);
      }
    }
    for (const trackId of changed) {
      if (signal.aborted) throw new DOMException("Stopped", "AbortError");
      await this.catalog.reindexTrack(trackId, "duplicate");
    }
    await this.catalog.flushChanges();
    const result = {
      trackCount: candidates.length,
      groupCount: duplicateGroups.length,
      hiddenCount: desired.size
        ? [...desired.values()].filter((value) => value !== null).length
        : 0,
      promotedCount,
      referencesMoved,
    };
    const state = {
      algorithmVersion: ALGORITHM_VERSION,
      lastCompletedAt: new Date(),
      hiddenCount: result.hiddenCount,
      groupCount: result.groupCount,
    };
    const existing = await this.database.orm.DuplicateDetectionState.first({
      id: STATE_ID,
    });
    if (existing) {
      await this.database.orm.DuplicateDetectionState.where({
        id: STATE_ID,
      }).update(state);
    } else {
      await this.database.orm.DuplicateDetectionState.create({
        id: STATE_ID,
        ...state,
      });
    }
    await onProgress?.(candidates.length, candidates.length);
    return result;
  }

  private async transferReferences(
    transaction: Parameters<Parameters<Database["transaction"]>[0]>[0],
    duplicate: TrackRow,
    canonicalId: string,
  ): Promise<number> {
    const canonical = await transaction.orm.Track.first({ id: canonicalId });
    if (!canonical) return 0;
    let moved = 0;

    const likes = await transaction.orm.TrackLike.where({
      trackId: duplicate.id,
    }).all();
    for (const like of likes) {
      const existing = await transaction.orm.TrackLike.first({
        userId: like.userId,
        trackId: canonicalId,
      });
      if (!existing) {
        await transaction.orm.TrackLike.create({
          userId: like.userId,
          trackId: canonicalId,
          createdAt: like.createdAt,
        });
      }
      await transaction.orm.TrackLike.where({
        userId: like.userId,
        trackId: duplicate.id,
      }).delete();
      moved += 1;
    }
    const plays = await transaction.orm.TrackPlayEvent.where({
      trackId: duplicate.id,
    }).updateAndCount({ trackId: canonicalId });
    moved += plays;

    const queueItems = await transaction.orm.QueueItem.where({
      trackId: duplicate.id,
    }).all();
    const affectedUsers = new Set<string>();
    for (const item of queueItems) {
      affectedUsers.add(item.userId);
      const existing = await transaction.orm.QueueItem.first({
        userId: item.userId,
        trackId: canonicalId,
      });
      if (!existing) {
        await transaction.orm.QueueItem.create({
          userId: item.userId,
          trackId: canonicalId,
          position: item.position,
          randomPosition: item.randomPosition,
          createdAt: item.createdAt,
        });
      }
      await transaction.orm.QueueItem.where({
        userId: item.userId,
        trackId: duplicate.id,
      }).delete();
      moved += 1;
    }
    for (const userId of affectedUsers) {
      await transaction.orm.QueueState.where({
        userId,
        activeTrackId: duplicate.id,
      }).update({ activeTrackId: canonicalId });
    }

    const playlistItems = await transaction.orm.PlaylistItem.where({
      trackId: duplicate.id,
    }).all();
    const affectedPlaylists = new Set<string>();
    const effective = effectiveTrackFields(canonical);
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
          trackId: canonicalId,
          identityKey: canonicalIdentityKey,
          snapshotTitle: effective.title,
          snapshotArtist: effective.artist,
          snapshotAlbum: effective.album,
          snapshotDuration: effective.durationMs,
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

export function duplicateDetails(result: DuplicateDetectionResult): Array<{
  key: string;
  value: string;
  labelMessage: MessageDescriptor;
  valueMessage: null;
}> {
  return [
    {
      key: "duplicates.tracks",
      value: String(result.trackCount),
      labelMessage: message("task.detail.tracks"),
      valueMessage: null,
    },
    {
      key: "duplicates.groups",
      value: String(result.groupCount),
      labelMessage: message("task.detail.duplicateGroups"),
      valueMessage: null,
    },
    {
      key: "duplicates.hidden",
      value: String(result.hiddenCount),
      labelMessage: message("task.detail.duplicatesHidden"),
      valueMessage: null,
    },
    {
      key: "duplicates.promoted",
      value: String(result.promotedCount),
      labelMessage: message("task.detail.duplicatesPromoted"),
      valueMessage: null,
    },
    {
      key: "duplicates.referencesMoved",
      value: String(result.referencesMoved),
      labelMessage: message("task.detail.referencesMoved"),
      valueMessage: null,
    },
  ];
}
