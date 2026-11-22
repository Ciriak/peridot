import { createHash } from "node:crypto";
import path from "node:path";
import type {
  AlbumListResponse,
  AlbumSummaryResponse,
  AudiobookListResponse,
  AudiobookSummaryResponse,
  ArtistMetadataResponse,
  ArtistListResponse,
  ArtistSummaryResponse,
  CatalogSortDirection,
  CatalogSortField,
  MessageDescriptor,
  PodcastListResponse,
  PodcastSummaryResponse,
  ResolveTracksResponse,
  TrackListResponse,
} from "@peridot/contracts";
import type { MediaType, SourceKind } from "@peridot/contracts";
import type { Database } from "./database.js";
import {
  parseStoredArtistCredits,
  parseStoredOptionalArtistCredits,
} from "./artist-credits.js";
import { message } from "./messages.js";
import type { PlaybackTokenService } from "./playback-tokens.js";
import type {
  ArtistImageRow,
  ArtistMetadataRow,
  TaskRow,
  TrackRow,
} from "./prisma/models.js";
import {
  normalizeSearchText as normalize,
  searchTerms,
} from "./search-text.js";
import {
  albumReleaseYear,
  effectiveTrackFields,
  toCoverUrl,
  toTrackResponse,
} from "./track-response.js";
import { parseStoredGenres } from "./genres.js";
import { storedMediaType, trackMediaFilter } from "./media.js";
import type { TaskExecutionResult, TaskService } from "./tasks.js";

const CATALOG_STATE_ID = "catalog";
const PROJECTION_VERSION = 6;
const CHANGE_THROTTLE_MS = 2_000;
const BACKFILL_BATCH_SIZE = 500;
const PROJECTION_BATCH_SIZE = 100;
const SOURCE_REMOVAL_BATCH_SIZE = 500;
const DEFAULT_PAGE_SIZE = 100;
const MAX_PAGE_SIZE = 200;
const DEFAULT_CARD_PAGE_SIZE = 50;
const MAX_CARD_PAGE_SIZE = 100;
const MAX_QUERY_TERMS = 8;

export class CatalogError extends Error {
  constructor(
    readonly code: "invalid_catalog_query" | "stale_catalog_cursor",
    fallbackMessage: string,
  ) {
    super(fallbackMessage);
    this.name = "CatalogError";
  }

  get messageDescriptor(): MessageDescriptor {
    if (this.code === "stale_catalog_cursor") {
      return message("api.message.staleCatalogCursor");
    }
    if (this.message === "Invalid catalog cursor") {
      return message("api.message.invalidCatalogQuery");
    }
    if (this.message.startsWith("limit must be between 1 and ")) {
      return message("api.message.invalidCatalogLimit", {
        maximum: this.message.split("and ")[1] ?? "200",
      });
    }
    if (this.message === "direction must be asc or desc") {
      return message("api.message.invalidCatalogDirection");
    }
    if (this.message.startsWith("sort must be ")) {
      return message("api.message.invalidTrackSort");
    }
    if (this.message === "album sort must be title or artist") {
      return message("api.message.invalidAlbumSort");
    }
    if (this.message === "artist sort must be name") {
      return message("api.message.invalidArtistSort");
    }
    if (this.message.startsWith("availability must be ")) {
      return message("api.message.invalidAvailability");
    }
    if (this.message === "liked must be true or false") {
      return message("api.message.invalidLikedFilter");
    }
    if (this.message === "At most 500 track IDs can be resolved at once") {
      return message("api.message.invalidTrackResolve");
    }
    return message("api.message.invalidCatalogQuery");
  }
}

type CursorValue = string | number | null;
type CursorKey = Record<string, CursorValue>;
type CatalogDatabase = Pick<Database, "orm" | "sql" | "execute">;

interface CursorPayload {
  key?: CursorKey;
  offset?: number;
  signature: string;
}

interface CatalogChange {
  revision: number;
  sourceId: string | null;
  reason:
    "scan" | "metadata" | "reset" | "source" | "source-removal" | "duplicate";
  changedCount: number;
}

function parsedSourceKind(value: string): SourceKind | null {
  if (value === "path" || value === "url" || value === "jellyfin") {
    return value;
  }
  return null;
}

interface TrackPageOptions {
  userId: string;
  cursor?: string;
  limit?: number;
  sort?: string;
  direction?: string;
  query?: string;
  availability?: string;
  albumId?: string;
  artistId?: string;
  liked?: string;
  mediaType?: string;
  collectionId?: string;
}

interface CardPageOptions {
  userId: string;
  cursor?: string;
  limit?: number;
  sort?: string;
  direction?: string;
  query?: string;
  liked?: string;
  artistId?: string;
}

export interface CatalogSourceUnavailableResult {
  trackCount: number;
  albumCount: number;
  artistCount: number;
}

export type CatalogChangedPublisher = (change: CatalogChange) => void;

function stableId(prefix: string, value: string): string {
  return `${prefix}_${createHash("sha256").update(value).digest("hex").slice(0, 28)}`;
}

export interface CatalogAlbumIdentity {
  mediaType: MediaType;
  album: string;
  albumArtists: readonly string[];
  albumReleaseKey: string | null;
  albumFolderKey: string;
}

export function catalogAlbumFolderKey(
  sourceId: string | null,
  relativePath: string,
): string {
  return JSON.stringify([sourceId ?? "", path.dirname(relativePath)]);
}

export function catalogAlbumReleaseKey(
  providerId: string | null,
  externalReleaseId: string | null,
): string | null {
  return providerId && externalReleaseId
    ? JSON.stringify(["release", providerId, externalReleaseId])
    : null;
}

export function catalogAlbumId(identity: CatalogAlbumIdentity): string {
  const album = normalize(identity.album);
  const prefix = identity.mediaType === "music" ? "album" : identity.mediaType;
  if (identity.albumReleaseKey) {
    return stableId(prefix, identity.albumReleaseKey);
  }
  const albumArtists = [
    ...new Set(identity.albumArtists.map(normalize).filter(Boolean)),
  ].sort();
  if (albumArtists.length) {
    return stableId(
      prefix,
      `artists\u0000${albumArtists.join("\u0000")}\u0000${album}`,
    );
  }
  return stableId(
    prefix,
    `folder\u0000${identity.albumFolderKey}\u0000${album}`,
  );
}

export function catalogArtistId(name: string): string {
  return stableId("artist", normalize(name));
}

function uniqueArtistCredits(values: readonly string[]): string[] {
  const artists: string[] = [];
  const seen = new Set<string>();
  for (const value of values) {
    const artist = value.trim();
    const key = normalize(artist);
    if (!artist || seen.has(key)) continue;
    seen.add(key);
    artists.push(artist);
  }
  return artists;
}

function encodeCursor(key: CursorKey, signature: string): string {
  return Buffer.from(
    JSON.stringify({ key, signature } satisfies CursorPayload),
  ).toString("base64url");
}

function encodeOffsetCursor(offset: number, signature: string): string {
  return Buffer.from(
    JSON.stringify({ offset, signature } satisfies CursorPayload),
  ).toString("base64url");
}

function decodeCursor(value: string | undefined): CursorPayload | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(
      Buffer.from(value, "base64url").toString("utf8"),
    ) as Partial<CursorPayload> & { revision?: unknown };
    if (typeof parsed.signature !== "string") {
      throw new Error();
    }
    const cursor: CursorPayload = { signature: parsed.signature };
    if (parsed.key !== undefined) {
      if (
        !parsed.key ||
        typeof parsed.key !== "object" ||
        Array.isArray(parsed.key)
      ) {
        throw new Error();
      }
      for (const fieldValue of Object.values(parsed.key)) {
        if (
          fieldValue !== null &&
          typeof fieldValue !== "string" &&
          !(typeof fieldValue === "number" && Number.isFinite(fieldValue))
        ) {
          throw new Error();
        }
      }
      cursor.key = parsed.key as CursorKey;
    }
    if (parsed.offset !== undefined) {
      if (!Number.isSafeInteger(parsed.offset) || parsed.offset < 0) {
        throw new Error();
      }
      cursor.offset = parsed.offset;
    }
    if (!cursor.key && cursor.offset === undefined) throw new Error();
    return cursor;
  } catch {
    throw new CatalogError("invalid_catalog_query", "Invalid catalog cursor");
  }
}

function cursorField(key: CursorKey, field: string): string | number | null {
  if (!(field in key)) {
    throw new CatalogError("invalid_catalog_query", "Invalid catalog cursor");
  }
  return key[field]!;
}

function cursorString(key: CursorKey, field: string): string {
  const value = cursorField(key, field);
  if (typeof value !== "string") {
    throw new CatalogError("invalid_catalog_query", "Invalid catalog cursor");
  }
  return value;
}

function cursorNullableString(key: CursorKey, field: string): string | null {
  const value = cursorField(key, field);
  if (value !== null && typeof value !== "string") {
    throw new CatalogError("invalid_catalog_query", "Invalid catalog cursor");
  }
  return value;
}

function cursorNullableNumber(key: CursorKey, field: string): number | null {
  const value = cursorField(key, field);
  if (value !== null && typeof value !== "number") {
    throw new CatalogError("invalid_catalog_query", "Invalid catalog cursor");
  }
  return value;
}

function trackCursorKey(
  sort: CatalogSortField,
  row: {
    album: string | null;
    discNumber: number | null;
    durationMs: number | null;
    id: string;
    normalizedAlbum: string;
    normalizedArtist: string;
    normalizedTitle: string;
    trackNumber: number | null;
  },
): CursorKey {
  if (sort === "track") {
    return {
      album: row.album,
      discNumber: row.discNumber,
      trackNumber: row.trackNumber,
      id: row.id,
    };
  }
  if (sort === "duration") {
    return { durationMs: row.durationMs, id: row.id };
  }
  if (sort === "title") {
    return { normalizedTitle: row.normalizedTitle, id: row.id };
  }
  if (sort === "album") {
    return { normalizedAlbum: row.normalizedAlbum, id: row.id };
  }
  return { normalizedArtist: row.normalizedArtist, id: row.id };
}

function pageSize(
  value: number | undefined,
  maximum: number,
  fallback: number,
) {
  if (value === undefined) return fallback;
  if (!Number.isSafeInteger(value) || value < 1 || value > maximum) {
    throw new CatalogError(
      "invalid_catalog_query",
      `limit must be between 1 and ${maximum}`,
    );
  }
  return value;
}

function sortDirection(value: string | undefined): CatalogSortDirection {
  if (value === undefined) return "asc";
  if (value !== "asc" && value !== "desc") {
    throw new CatalogError(
      "invalid_catalog_query",
      "direction must be asc or desc",
    );
  }
  return value;
}

function orderDirection(direction: CatalogSortDirection): "asc" | "desc" {
  return direction === "asc" ? "asc" : "desc";
}

function trackSort(value: string | undefined): CatalogSortField {
  const sort = value ?? "artist";
  if (
    !["title", "artist", "album", "duration", "track", "published"].includes(
      sort,
    )
  ) {
    throw new CatalogError(
      "invalid_catalog_query",
      "sort must be title, artist, album, duration, track, or published",
    );
  }
  return sort as CatalogSortField;
}

function albumSort(value: string | undefined): "title" | "artist" {
  const sort = value ?? "title";
  if (sort !== "title" && sort !== "artist") {
    throw new CatalogError(
      "invalid_catalog_query",
      "album sort must be title or artist",
    );
  }
  return sort;
}

function artistSort(value: string | undefined): "name" {
  const sort = value ?? "name";
  if (sort !== "name") {
    throw new CatalogError("invalid_catalog_query", "artist sort must be name");
  }
  return sort;
}

function availabilityFilter(value: string | undefined): 0 | 1 | null {
  if (value === undefined || value === "available") return 1;
  if (value === "unavailable") return 0;
  if (value === "all") return null;
  throw new CatalogError(
    "invalid_catalog_query",
    "availability must be available, unavailable, or all",
  );
}

function trackSignature(options: TrackPageOptions): string {
  return JSON.stringify({
    sort: options.sort ?? "artist",
    direction: options.direction ?? "asc",
    query: normalize(options.query ?? ""),
    availability: options.availability ?? "available",
    albumId: options.albumId ?? null,
    collectionId: options.collectionId ?? null,
    artistId: options.artistId ?? null,
    liked: options.liked === "true",
    mediaType: trackMediaFilter(options.mediaType),
  });
}

function cardSignature(kind: string, options: CardPageOptions): string {
  return JSON.stringify({
    kind,
    sort: options.sort ?? (kind === "artist" ? "name" : "title"),
    direction: options.direction ?? "asc",
    query: normalize(options.query ?? ""),
    liked: options.liked === "true",
    artistId: options.artistId ?? null,
  });
}

function finiteDuration(value: number | null): number {
  return value !== null && Number.isFinite(value) && value >= 0 ? value : 0;
}

function yieldToEventLoop(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve));
}

export class CatalogService {
  private publisher: CatalogChangedPublisher | null = null;
  private pendingChangedCount = 0;
  private pendingSourceId: string | null = null;
  private pendingReason: CatalogChange["reason"] = "scan";
  private changeTimer: ReturnType<typeof setTimeout> | undefined;
  private backfillPromise: Promise<void> | null = null;
  private catalogTail: Promise<unknown> = Promise.resolve();
  private flushTail: Promise<unknown> = Promise.resolve();
  private closing = false;
  private lastRevision = 0;
  private lastYieldAt = Date.now();

  constructor(
    private readonly database: Database,
    private readonly playbackTokens: PlaybackTokenService,
  ) {}

  setPublisher(publisher: CatalogChangedPublisher | null) {
    this.publisher = publisher;
  }

  async initialize(): Promise<number> {
    const existing = await this.database.orm.CatalogState.first({
      id: CATALOG_STATE_ID,
    });
    if (existing) {
      this.lastRevision = existing.revision;
      if (existing.projectionVersion < PROJECTION_VERSION) {
        const trackCount = (
          await this.database.orm.Track.aggregate((aggregate) => ({
            count: aggregate.count(),
          }))
        ).count;
        if (trackCount === 0) {
          await this.database.orm.CatalogState.where({
            id: CATALOG_STATE_ID,
          }).update({ projectionVersion: PROJECTION_VERSION });
        }
      }
      return existing.revision;
    }
    const created = await this.database.orm.CatalogState.create({
      id: CATALOG_STATE_ID,
      revision: 0,
      projectionVersion: 0,
    });
    this.lastRevision = created.revision;
    return created.revision;
  }

  async startBackfill(): Promise<void> {
    if (this.backfillPromise) return this.backfillPromise;
    this.backfillPromise = this.runBackfill().finally(() => {
      this.backfillPromise = null;
    });
    return this.backfillPromise;
  }

  async waitForBackfill(): Promise<void> {
    await this.backfillPromise;
  }

  private async yieldCatalogWork(): Promise<void> {
    if (Date.now() - this.lastYieldAt < 5) return;
    await yieldToEventLoop();
    this.lastYieldAt = Date.now();
  }

  async rebuildAll(reason: CatalogChange["reason"] = "reset") {
    let offset = 0;
    while (true) {
      const tracks = await this.database.orm.Track.orderBy((track) =>
        track.id.asc(),
      )
        .offset(offset)
        .limit(BACKFILL_BATCH_SIZE)
        .all();
      if (!tracks.length) break;
      for (const track of tracks) {
        await this.reindexTrack(track.id, reason);
        await yieldToEventLoop();
      }
      offset += tracks.length;
      if (tracks.length < BACKFILL_BATCH_SIZE) break;
    }
    await this.database.orm.CatalogState.where({
      id: CATALOG_STATE_ID,
    }).update({ projectionVersion: PROJECTION_VERSION });
    this.pendingChangedCount += 1;
    this.pendingReason = reason;
    return this.flushChanges();
  }

  async revision(): Promise<number> {
    if (this.closing) return this.lastRevision;
    const revision = await this.database.orm.CatalogState.first({
      id: CATALOG_STATE_ID,
    });
    this.lastRevision = revision?.revision ?? this.lastRevision;
    return this.lastRevision;
  }

  async indexTrackSummary(
    track: TrackRow,
    database: CatalogDatabase = this.database,
  ): Promise<void> {
    const values = this.trackSummaryValues(track);
    const updated = await database.orm.CatalogTrack.where({
      id: track.id,
    }).updateAndCount(values);
    if (!updated) {
      await database.orm.CatalogTrack.create({ id: track.id, ...values });
    }
  }

  async insertTrackSummaries(
    tracks: readonly TrackRow[],
    database: CatalogDatabase = this.database,
  ): Promise<void> {
    if (!tracks.length) return;
    const plan = database.sql.CatalogTrack.insert(
      tracks.map((track) => ({
        id: track.id,
        ...this.trackSummaryValues(track),
      })),
    ).build();
    await database.execute(plan);
  }

  markScanBatchChanged(sourceId: string | null): Promise<number> {
    this.markChanged(sourceId, "scan");
    return this.flushChanges();
  }

  async hasPendingProjection(sourceId: string | null = null): Promise<boolean> {
    let query = this.database.orm.Track.where({
      catalogProjectionPending: 1,
    });
    if (sourceId) query = query.where({ sourceId });
    return Boolean(await query.select("id").first());
  }

  async runTask(
    task: TaskRow,
    tasks: TaskService,
    signal: AbortSignal,
  ): Promise<TaskExecutionResult> {
    let scoped = this.database.orm.Track.where({
      catalogProjectionPending: 1,
    });
    if (task.sourceId) scoped = scoped.where({ sourceId: task.sourceId });
    const { count: total } = await scoped.aggregate((aggregate) => ({
      count: aggregate.count(),
    }));
    let completed = 0;
    await tasks.updateProgress(task.id, completed, total);
    while (true) {
      if (signal.aborted) {
        throw new DOMException("Catalog projection was stopped.", "AbortError");
      }
      let query = this.database.orm.Track.where({
        catalogProjectionPending: 1,
      });
      if (task.sourceId) query = query.where({ sourceId: task.sourceId });
      const tracks = await query
        .orderBy((track) => track.createdAt.asc())
        .limit(PROJECTION_BATCH_SIZE)
        .select("id")
        .all();
      if (!tracks.length) break;
      for (const track of tracks) {
        if (signal.aborted) {
          throw new DOMException(
            "Catalog projection was stopped.",
            "AbortError",
          );
        }
        await this.reindexTrack(track.id, "scan");
        completed += 1;
        if (completed % 10 === 0 || completed === total) {
          await tasks.updateProgress(task.id, completed, total);
        }
      }
    }
    await tasks.updateProgress(task.id, completed, total);
    await this.flushChanges();
    return {
      details: [
        {
          key: "source",
          value: task.sourceName ?? "All sources",
          labelMessage: message("task.detail.source"),
          valueMessage: task.sourceName ? null : message("common.allSources"),
        },
        {
          key: "tracks.processed",
          value: String(completed),
          labelMessage: message("task.detail.tracksProcessed"),
          valueMessage: null,
        },
      ],
    };
  }

  async reindexTrack(
    trackId: string,
    reason: CatalogChange["reason"] = "scan",
  ): Promise<void> {
    return this.serializeCatalog(() =>
      this.reindexTrackUnlocked(trackId, reason, true),
    );
  }

  private async reindexTrackUnlocked(
    trackId: string,
    reason: CatalogChange["reason"],
    propagateAlbumIdentity: boolean,
  ): Promise<void> {
    const track = await this.database.orm.Track.first({ id: trackId });
    if (!track) {
      await this.removeTrackUnlocked(trackId);
      return;
    }
    const trackMediaType = storedMediaType(track.mediaType);
    const music = trackMediaType === "music";
    const hiddenDuplicate = Boolean(track.duplicateOfId);
    const effective = effectiveTrackFields(track);
    const album = effective.album?.trim() || null;
    const normalizedAlbum = normalize(album ?? "");
    const albumFolderKey = catalogAlbumFolderKey(
      track.sourceId,
      track.relativePath,
    );
    const albumReleaseKey = music
      ? catalogAlbumReleaseKey(
          track.metadataProviderId,
          track.metadataExternalReleaseId,
        )
      : null;
    const folderSiblings =
      album && !albumReleaseKey
        ? await this.database.orm.CatalogTrack.where({
            albumFolderKey,
            normalizedAlbum,
            mediaType: trackMediaType,
          }).all()
        : [];
    const siblingReleaseKeys = [
      ...new Set(
        folderSiblings.flatMap((sibling) =>
          sibling.albumReleaseKey ? [sibling.albumReleaseKey] : [],
        ),
      ),
    ];
    const previous = await this.database.orm.CatalogTrack.first({
      id: trackId,
    });
    const previousArtists = await this.database.orm.CatalogTrackArtist.where({
      trackId,
    }).all();

    if (previous) {
      for (const link of previousArtists) {
        await this.removeArtistContribution(link.artistId, previous, trackId);
        await this.database.orm.CatalogTrackArtist.where({
          id: link.id,
        }).delete();
      }
      await this.database.orm.CatalogTrack.where({
        id: trackId,
      }).deleteAndCount();
      if (previous.albumId) {
        await this.refreshAlbum(previous.albumId, trackId);
      }
      if (
        previous.albumReleaseKey &&
        previous.albumReleaseKey !== albumReleaseKey
      ) {
        await this.reindexAlbumFallbackSiblings(
          previous.albumFolderKey,
          previous.normalizedAlbum,
          previous.albumId,
          reason,
          storedMediaType(previous.mediaType),
        );
      }
      const previousTerms = await this.database.orm.CatalogSearchTerm.where({
        entityType: "track",
        entityId: trackId,
      }).all();
      for (const term of previousTerms) {
        await this.database.orm.CatalogSearchTerm.where({
          id: term.id,
        }).delete();
      }
      await this.yieldCatalogWork();
    }

    const bridgedReleaseKey =
      albumReleaseKey ??
      (siblingReleaseKeys.length === 1 ? siblingReleaseKeys[0]! : null);
    const albumId = album
      ? catalogAlbumId({
          mediaType: trackMediaType,
          album,
          albumArtists: effective.albumArtists,
          albumReleaseKey: bridgedReleaseKey,
          albumFolderKey,
        })
      : null;
    const releaseYear = albumReleaseYear(track);
    const values = {
      sourceId: track.sourceId,
      mediaType: trackMediaType,
      title: effective.title,
      artist: effective.artist,
      artistCredits: JSON.stringify(effective.artists),
      albumArtist: effective.albumArtists.join(", "),
      albumArtistCredits: JSON.stringify(effective.albumArtists),
      album,
      normalizedTitle: normalize(effective.title),
      normalizedArtist: normalize(effective.artist),
      normalizedAlbum: normalize(album ?? ""),
      normalizedGenres: normalize(effective.genres.join(" ")),
      durationMs: effective.durationMs,
      publishedAt: track.publishedAt,
      discNumber: effective.discNumber,
      trackNumber: effective.trackNumber,
      releaseYear,
      available: track.available ? 1 : 0,
      coverId: track.coverId,
      albumId: !hiddenDuplicate && album ? albumId : null,
      albumFolderKey,
      albumReleaseKey,
      duplicateOfId: track.duplicateOfId,
    };

    await this.database.orm.CatalogTrack.create({ id: trackId, ...values });
    await this.yieldCatalogWork();

    if (!hiddenDuplicate && albumId && album) {
      await this.refreshAlbum(albumId);
      await this.yieldCatalogWork();
    }

    if (!hiddenDuplicate && music) {
      for (const artist of effective.artists) {
        const artistId = catalogArtistId(artist);
        await this.addArtistContribution(
          artistId,
          artist,
          albumId,
          track.available ? effective.durationMs : null,
          track.available === 1,
        );
        const artistLink = await this.database.orm.CatalogTrackArtist.first({
          trackId,
          artistId,
        });
        if (!artistLink) {
          await this.database.orm.CatalogTrackArtist.create({
            trackId,
            artistId,
          });
        }
        await this.yieldCatalogWork();
      }
    }

    const trackTerms = searchTerms([
      effective.title,
      effective.artist,
      album,
      ...effective.genres,
      ...parseStoredGenres(track.genres),
      ...effective.artists,
      ...effective.albumArtists,
    ]);
    for (const term of trackTerms) {
      await this.createSearchTerm("track", trackId, term);
    }
    await this.yieldCatalogWork();
    if (!track.available || hiddenDuplicate) {
      this.markChanged(track.sourceId, reason);
      await this.clearProjectionPending(trackId);
      return;
    }
    if (propagateAlbumIdentity && albumId && albumReleaseKey) {
      await this.reindexBridgedAlbumSiblings(
        albumFolderKey,
        normalizedAlbum,
        albumId,
        reason,
      );
    }
    this.markChanged(track.sourceId, reason);
    await this.clearProjectionPending(trackId);
  }

  private async clearProjectionPending(trackId: string): Promise<void> {
    await this.database.orm.Track.where({ id: trackId }).update({
      catalogProjectionPending: 0,
    });
  }

  private trackSummaryValues(track: TrackRow) {
    const effective = effectiveTrackFields(track);
    const trackMediaType = storedMediaType(track.mediaType);
    const album = effective.album?.trim() || null;
    const albumFolderKey = catalogAlbumFolderKey(
      track.sourceId,
      track.relativePath,
    );
    const albumReleaseKey = catalogAlbumReleaseKey(
      track.metadataProviderId,
      track.metadataExternalReleaseId,
    );
    const albumId =
      track.available && album
        ? catalogAlbumId({
            mediaType: trackMediaType,
            album,
            albumArtists: effective.albumArtists,
            albumReleaseKey,
            albumFolderKey,
          })
        : null;
    return {
      sourceId: track.sourceId,
      mediaType: trackMediaType,
      title: effective.title,
      artist: effective.artist,
      artistCredits: JSON.stringify(effective.artists),
      albumArtist: effective.albumArtists.join(", "),
      albumArtistCredits: JSON.stringify(effective.albumArtists),
      album,
      normalizedTitle: normalize(effective.title),
      normalizedArtist: normalize(effective.artist),
      normalizedAlbum: normalize(album ?? ""),
      normalizedGenres: normalize(effective.genres.join(" ")),
      durationMs: effective.durationMs,
      publishedAt: track.publishedAt,
      discNumber: effective.discNumber,
      trackNumber: effective.trackNumber,
      releaseYear: albumReleaseYear(track),
      available: track.available,
      coverId: track.coverId,
      albumId: track.duplicateOfId || !album ? null : albumId,
      albumFolderKey,
      albumReleaseKey,
      duplicateOfId: track.duplicateOfId,
    };
  }

  async markSourceUnavailable(
    sourceId: string,
    database: CatalogDatabase = this.database,
    onProgress?: (completed: number, total: number) => Promise<void> | void,
  ): Promise<CatalogSourceUnavailableResult> {
    const { count: total } = await database.orm.Track.where({
      sourceId,
    }).aggregate((aggregate) => ({ count: aggregate.count() }));
    const unavailableByAlbum = new Map<string, number>();
    const unavailableByArtist = new Map<string, number>();
    let completed = 0;
    let offset = 0;

    await onProgress?.(completed, total);
    while (true) {
      const tracks = await database.orm.Track.where({ sourceId })
        .orderBy((track) => track.id.asc())
        .offset(offset)
        .limit(SOURCE_REMOVAL_BATCH_SIZE)
        .select("id", "available")
        .all();
      if (!tracks.length) break;

      const trackIds = tracks.map((track) => track.id);
      const projections = await database.orm.CatalogTrack.where((track) =>
        track.id.in(trackIds),
      ).all();
      const availableProjectionIds = new Set(
        projections
          .filter((track) => Boolean(track.available))
          .map((track) => track.id),
      );
      for (const track of projections) {
        if (track.available && track.albumId) {
          unavailableByAlbum.set(
            track.albumId,
            (unavailableByAlbum.get(track.albumId) ?? 0) + 1,
          );
        }
      }
      if (availableProjectionIds.size) {
        const artistLinks = await database.orm.CatalogTrackArtist.where(
          (link) => link.trackId.in([...availableProjectionIds]),
        ).all();
        for (const link of artistLinks) {
          unavailableByArtist.set(
            link.artistId,
            (unavailableByArtist.get(link.artistId) ?? 0) + 1,
          );
        }
      }

      await database.orm.Track.where((track) =>
        track.duplicateOfId.in(trackIds),
      ).update({ duplicateOfId: null });
      await database.orm.CatalogTrack.where((track) =>
        track.duplicateOfId.in(trackIds),
      ).update({ duplicateOfId: null });
      await database.orm.Track.where((track) => track.id.in(trackIds)).update({
        available: 0,
        catalogProjectionPending: 0,
      });
      await database.orm.CatalogTrack.where((track) =>
        track.id.in(trackIds),
      ).update({
        available: 0,
        duplicateOfId: null,
      });

      completed += tracks.length;
      offset += tracks.length;
      await onProgress?.(completed, total);
      if (tracks.length < SOURCE_REMOVAL_BATCH_SIZE) break;
    }

    await this.adjustSourceAvailabilityCounts(
      database,
      "CatalogAlbum",
      unavailableByAlbum,
    );
    await this.adjustSourceAvailabilityCounts(
      database,
      "CatalogArtist",
      unavailableByArtist,
    );
    this.markChanged(sourceId, "source-removal");
    return {
      trackCount: total,
      albumCount: unavailableByAlbum.size,
      artistCount: unavailableByArtist.size,
    };
  }

  private async adjustSourceAvailabilityCounts(
    database: CatalogDatabase,
    table: "CatalogAlbum" | "CatalogArtist",
    unavailableCounts: ReadonlyMap<string, number>,
  ): Promise<void> {
    const entries = [...unavailableCounts.entries()];
    for (let offset = 0; offset < entries.length; offset += 100) {
      const batch = entries.slice(offset, offset + 100);
      const ids = batch.map(([id]) => id);
      const rows =
        table === "CatalogAlbum"
          ? await database.orm.CatalogAlbum.where((row) => row.id.in(ids)).all()
          : await database.orm.CatalogArtist.where((row) =>
              row.id.in(ids),
            ).all();
      const byId = new Map(rows.map((row) => [row.id, row]));
      for (const [id, count] of batch) {
        const row = byId.get(id);
        if (!row) continue;
        const availableTrackCount = Math.max(
          0,
          row.availableTrackCount - count,
        );
        if (table === "CatalogAlbum") {
          await database.orm.CatalogAlbum.where({ id }).update({
            availableTrackCount,
          });
        } else {
          await database.orm.CatalogArtist.where({ id }).update({
            availableTrackCount,
          });
        }
      }
    }
  }

  async removeTrack(trackId: string): Promise<void> {
    return this.serializeCatalog(() => this.removeTrackUnlocked(trackId));
  }

  private async removeTrackUnlocked(trackId: string): Promise<void> {
    const previous = await this.database.orm.CatalogTrack.first({
      id: trackId,
    });
    const previousArtists = await this.database.orm.CatalogTrackArtist.where({
      trackId,
    }).all();
    for (const link of previousArtists) {
      if (previous) {
        await this.removeArtistContribution(link.artistId, previous, trackId);
      }
      await this.database.orm.CatalogTrackArtist.where({
        id: link.id,
      }).delete();
    }
    await this.database.orm.CatalogTrack.where({
      id: trackId,
    }).deleteAndCount();
    if (previous?.albumId) {
      await this.refreshAlbum(previous.albumId, trackId);
    }
    if (previous?.albumReleaseKey) {
      await this.reindexAlbumFallbackSiblings(
        previous.albumFolderKey,
        previous.normalizedAlbum,
        previous.albumId,
        "metadata",
        storedMediaType(previous.mediaType),
      );
    }
    const terms = await this.database.orm.CatalogSearchTerm.where({
      entityType: "track",
      entityId: trackId,
    }).all();
    for (const term of terms) {
      await this.database.orm.CatalogSearchTerm.where({
        id: term.id,
      }).delete();
    }
    await this.database.orm.CatalogTrack.where({
      id: trackId,
    }).deleteAndCount();
  }

  private async reindexBridgedAlbumSiblings(
    albumFolderKey: string,
    normalizedAlbum: string,
    albumId: string,
    reason: CatalogChange["reason"],
  ): Promise<void> {
    const siblings = await this.database.orm.CatalogTrack.where({
      albumFolderKey,
      normalizedAlbum,
      mediaType: "music",
    }).all();
    const releaseKeys = new Set(
      siblings.flatMap((track) =>
        track.albumReleaseKey ? [track.albumReleaseKey] : [],
      ),
    );
    if (releaseKeys.size !== 1) return;
    for (const sibling of siblings) {
      if (
        sibling.albumReleaseKey ||
        sibling.albumId === albumId ||
        !sibling.available
      ) {
        continue;
      }
      await this.reindexTrackUnlocked(sibling.id, reason, false);
    }
  }

  private async reindexAlbumFallbackSiblings(
    albumFolderKey: string,
    normalizedAlbum: string,
    previousAlbumId: string | null,
    reason: CatalogChange["reason"],
    mediaType: MediaType,
  ): Promise<void> {
    if (!previousAlbumId) return;
    const siblings = await this.database.orm.CatalogTrack.where({
      albumFolderKey,
      normalizedAlbum,
      albumId: previousAlbumId,
      mediaType,
    }).all();
    for (const sibling of siblings) {
      if (sibling.albumReleaseKey || !sibling.available) continue;
      await this.reindexTrackUnlocked(sibling.id, reason, false);
    }
  }

  async markTrackChanged(trackId: string, reason: CatalogChange["reason"]) {
    await this.reindexTrack(trackId, reason);
  }

  async updateTrackCover(
    trackId: string,
    coverId: string | null,
    expectedCoverKey: string,
  ): Promise<boolean> {
    return this.serializeCatalog(async () => {
      const track = await this.database.orm.Track.first({ id: trackId });
      if (!track || track.externalCoverKey !== expectedCoverKey) return false;
      await this.database.orm.Track.where({ id: trackId }).update({ coverId });
      await this.database.orm.CatalogTrack.where({
        id: trackId,
      }).updateAndCount({
        coverId,
      });
      this.markChanged(track.sourceId, "scan");
      return true;
    });
  }

  async flushChanges(): Promise<number> {
    if (this.closing) return this.lastRevision;
    const next = this.flushTail.then(
      () => this.flushChangesNow(),
      () => this.flushChangesNow(),
    );
    this.flushTail = next.catch(() => undefined);
    return next;
  }

  private async flushChangesNow(): Promise<number> {
    if (this.closing) return this.lastRevision;
    if (this.changeTimer) {
      clearTimeout(this.changeTimer);
      this.changeTimer = undefined;
    }
    if (!this.pendingChangedCount) return this.lastRevision;
    const current = await this.initialize();
    const revision = current + 1;
    await this.database.orm.CatalogState.where({
      id: CATALOG_STATE_ID,
    }).update({ revision });
    this.lastRevision = revision;
    const change: CatalogChange = {
      revision,
      sourceId: this.pendingSourceId,
      reason: this.pendingReason,
      changedCount: this.pendingChangedCount,
    };
    this.pendingChangedCount = 0;
    this.pendingSourceId = null;
    this.publisher?.(change);
    return revision;
  }

  async markReset(): Promise<number> {
    this.pendingReason = "reset";
    this.pendingSourceId = null;
    this.pendingChangedCount += 1;
    return this.flushChanges();
  }

  async markSourceRemoval(sourceId: string): Promise<number> {
    this.pendingReason = "source-removal";
    this.pendingSourceId = sourceId;
    this.pendingChangedCount += 1;
    return this.flushChanges();
  }

  async close() {
    await this.backfillPromise;
    if (this.changeTimer) clearTimeout(this.changeTimer);
    this.changeTimer = undefined;
    await this.flushChanges();
    this.closing = true;
    await this.flushTail;
  }

  async listTracks(options: TrackPageOptions): Promise<TrackListResponse> {
    const limit = pageSize(options.limit, MAX_PAGE_SIZE, DEFAULT_PAGE_SIZE);
    const direction = sortDirection(options.direction);
    const sort = trackSort(options.sort);
    const availability = availabilityFilter(options.availability);
    const requestedMediaType = trackMediaFilter(options.mediaType);
    const signature = trackSignature(options);
    const revision = await this.revision();
    const cursor = decodeCursor(options.cursor);
    if (cursor && cursor.signature !== signature) {
      throw new CatalogError(
        "stale_catalog_cursor",
        "The catalog query changed while paging; reload from the first page",
      );
    }
    const offset = cursor?.offset ?? 0;
    const filterIds = await this.trackFilterIds(options);
    if (filterIds && !filterIds.size) {
      return {
        items: [],
        nextCursor: null,
        totalCount: 0,
        catalogRevision: revision,
      };
    }

    let query = this.database.orm.CatalogTrack.where((track) =>
      track.duplicateOfId.isNull(),
    );
    if (availability !== null) query = query.where({ available: availability });
    if (requestedMediaType !== "all") {
      query = query.where({ mediaType: requestedMediaType });
    }
    const collectionId = options.collectionId ?? options.albumId;
    if (collectionId) query = query.where({ albumId: collectionId });
    if (filterIds) query = query.where((track) => track.id.in([...filterIds]));
    const { count: totalCount } = await query.aggregate((aggregate) => ({
      count: aggregate.count(),
    }));

    const directionValue = orderDirection(direction);
    let ordered;
    if (sort === "track") {
      ordered = query.orderBy([
        (track) => track.album[directionValue](),
        (track) => track.discNumber[directionValue](),
        (track) => track.trackNumber[directionValue](),
        (track) => track.id[directionValue](),
      ]);
    } else if (sort === "duration") {
      ordered = query.orderBy([
        (track) => track.durationMs[directionValue](),
        (track) => track.id[directionValue](),
      ]);
    } else if (sort === "published") {
      ordered = query.orderBy([
        (track) => track.publishedAt[directionValue]({ nulls: "last" }),
        (track) => track.id[directionValue](),
      ]);
    } else if (sort === "title") {
      ordered = query.orderBy([
        (track) => track.normalizedTitle[directionValue](),
        (track) => track.id[directionValue](),
      ]);
    } else if (sort === "album") {
      ordered = query.orderBy([
        (track) => track.normalizedAlbum[directionValue](),
        (track) => track.id[directionValue](),
      ]);
    } else {
      ordered = query.orderBy([
        (track) => track.normalizedArtist[directionValue](),
        (track) => track.id[directionValue](),
      ]);
    }
    let paged: typeof ordered;
    if (cursor?.key && sort !== "published") {
      const key = cursor.key;
      if (sort === "track") {
        paged = ordered.cursor({
          album: cursorNullableString(key, "album"),
          discNumber: cursorNullableNumber(key, "discNumber"),
          trackNumber: cursorNullableNumber(key, "trackNumber"),
          id: cursorString(key, "id"),
        });
      } else if (sort === "duration") {
        paged = ordered.cursor({
          durationMs: cursorNullableNumber(key, "durationMs"),
          id: cursorString(key, "id"),
        });
      } else if (sort === "title") {
        paged = ordered.cursor({
          normalizedTitle: cursorString(key, "normalizedTitle"),
          id: cursorString(key, "id"),
        });
      } else if (sort === "album") {
        paged = ordered.cursor({
          normalizedAlbum: cursorString(key, "normalizedAlbum"),
          id: cursorString(key, "id"),
        });
      } else {
        paged = ordered.cursor({
          normalizedArtist: cursorString(key, "normalizedArtist"),
          id: cursorString(key, "id"),
        });
      }
    } else {
      paged = ordered.offset(offset);
    }
    const rows = await paged.limit(limit + 1).all();
    const hasMore = rows.length > limit;
    const pageRows = rows.slice(0, limit);
    const tracks = await this.hydrateTracks(
      pageRows.map((row) => row.id),
      options.userId,
    );
    return {
      items: tracks,
      nextCursor: hasMore
        ? sort === "published"
          ? encodeOffsetCursor(offset + limit, signature)
          : encodeCursor(trackCursorKey(sort, pageRows.at(-1)!), signature)
        : null,
      totalCount,
      catalogRevision: revision,
    };
  }

  async resolveTracks(
    ids: readonly string[],
    userId: string,
  ): Promise<ResolveTracksResponse> {
    if (ids.length > 500) {
      throw new CatalogError(
        "invalid_catalog_query",
        "At most 500 track IDs can be resolved at once",
      );
    }
    const unique = [...new Set(ids)];
    const aliases: Record<string, string> = {};
    const canonicalIds: string[] = [];
    for (const requestedId of unique) {
      let canonicalId = requestedId;
      const visited = new Set<string>();
      while (!visited.has(canonicalId) && visited.size < 16) {
        visited.add(canonicalId);
        const row = await this.database.orm.Track.select("duplicateOfId").first(
          {
            id: canonicalId,
          },
        );
        if (!row?.duplicateOfId) break;
        canonicalId = row.duplicateOfId;
      }
      if (canonicalId !== requestedId) aliases[requestedId] = canonicalId;
      if (!canonicalIds.includes(canonicalId)) canonicalIds.push(canonicalId);
    }
    let indexed = canonicalIds.length
      ? await this.database.orm.CatalogTrack.where((track) =>
          track.id.in(canonicalIds),
        ).all()
      : [];
    const indexedIdsBefore = new Set(indexed.map((track) => track.id));
    const missingIds = canonicalIds.filter((id) => !indexedIdsBefore.has(id));
    if (missingIds.length) {
      for (const trackId of missingIds) {
        await this.reindexTrack(trackId, "source");
      }
      indexed = await this.database.orm.CatalogTrack.where((track) =>
        track.id.in(canonicalIds),
      ).all();
    }
    const indexedIds = indexed.map((track) => track.id);
    const tracks = await this.hydrateTracks(indexedIds, userId);
    const byId = new Map(tracks.map((track) => [track.id, track]));
    return {
      items: canonicalIds.flatMap((id) => {
        const track = byId.get(id);
        return track ? [track] : [];
      }),
      aliases,
    };
  }

  async listAlbums(options: CardPageOptions): Promise<AlbumListResponse> {
    const limit = pageSize(
      options.limit,
      MAX_CARD_PAGE_SIZE,
      DEFAULT_CARD_PAGE_SIZE,
    );
    const direction = sortDirection(options.direction);
    const sort = albumSort(options.sort);
    const signature = cardSignature("album", options);
    const revision = await this.revision();
    const cursor = decodeCursor(options.cursor);
    if (cursor && cursor.signature !== signature) {
      throw new CatalogError(
        "stale_catalog_cursor",
        "The catalog query changed while paging; reload from the first page",
      );
    }
    const filterIds = await this.cardFilterIds("album", options);
    if (filterIds && !filterIds.size) {
      return {
        items: [],
        nextCursor: null,
        totalCount: 0,
        catalogRevision: revision,
      };
    }
    let query = this.database.orm.CatalogAlbum.where((album) =>
      album.trackCount.gt(0),
    ).where({ mediaType: "music" });
    if (options.liked !== "true") {
      query = query.where((album) => album.availableTrackCount.gt(0));
    }
    if (options.artistId) {
      const artistAlbums = await this.database.orm.CatalogArtistAlbum.where({
        artistId: options.artistId,
      })
        .select("albumId")
        .all();
      if (!artistAlbums.length) {
        return {
          items: [],
          nextCursor: null,
          totalCount: 0,
          catalogRevision: revision,
        };
      }
      query = query.where((album) =>
        album.id.in(artistAlbums.map((link) => link.albumId)),
      );
    }
    if (filterIds) query = query.where((album) => album.id.in([...filterIds]));
    const { count: totalCount } = await query.aggregate((aggregate) => ({
      count: aggregate.count(),
    }));
    const directionValue = orderDirection(direction);
    const ordered =
      sort === "artist"
        ? query.orderBy([
            (album) => album.normalizedArtist[directionValue](),
            (album) => album.id[directionValue](),
          ])
        : query.orderBy([
            (album) => album.normalizedTitle[directionValue](),
            (album) => album.id[directionValue](),
          ]);
    let paged: typeof ordered;
    if (cursor?.key) {
      if (sort === "artist") {
        paged = ordered.cursor({
          normalizedArtist: cursorString(cursor.key, "normalizedArtist"),
          id: cursorString(cursor.key, "id"),
        });
      } else {
        paged = ordered.cursor({
          normalizedTitle: cursorString(cursor.key, "normalizedTitle"),
          id: cursorString(cursor.key, "id"),
        });
      }
    } else {
      paged = ordered.offset(cursor?.offset ?? 0);
    }
    const rows = await paged.limit(limit + 1).all();
    const hasMore = rows.length > limit;
    const pageRows = rows.slice(0, limit);
    const [likedIds, sourceKindsByAlbum] = await Promise.all([
      this.likedAlbumIds(options.userId),
      this.albumSourceKinds(pageRows.map((album) => album.id)),
    ]);
    return {
      items: pageRows.map((album) =>
        this.toAlbumSummary(
          album,
          likedIds.has(album.id),
          sourceKindsByAlbum.get(album.id) ?? [],
        ),
      ),
      nextCursor: hasMore
        ? encodeCursor(
            sort === "artist"
              ? {
                  normalizedArtist: pageRows.at(-1)!.normalizedArtist,
                  id: pageRows.at(-1)!.id,
                }
              : {
                  normalizedTitle: pageRows.at(-1)!.normalizedTitle,
                  id: pageRows.at(-1)!.id,
                },
            signature,
          )
        : null,
      totalCount,
      catalogRevision: revision,
    };
  }

  async listAudiobooks(
    options: CardPageOptions,
  ): Promise<AudiobookListResponse> {
    return (await this.listMediaCollections(
      "audiobook",
      options,
    )) as AudiobookListResponse;
  }

  async listPodcasts(options: CardPageOptions): Promise<PodcastListResponse> {
    return (await this.listMediaCollections(
      "podcast",
      options,
    )) as PodcastListResponse;
  }

  private async listMediaCollections(
    mediaType: "audiobook" | "podcast",
    options: CardPageOptions,
  ): Promise<AudiobookListResponse | PodcastListResponse> {
    const limit = pageSize(
      options.limit,
      MAX_CARD_PAGE_SIZE,
      DEFAULT_CARD_PAGE_SIZE,
    );
    const direction = sortDirection(options.direction);
    const sort = albumSort(options.sort);
    const signature = cardSignature(mediaType, options);
    const revision = await this.revision();
    const cursor = decodeCursor(options.cursor);
    if (cursor && cursor.signature !== signature) {
      throw new CatalogError(
        "stale_catalog_cursor",
        "The catalog query changed while paging; reload from the first page",
      );
    }
    const filterIds = await this.cardFilterIds("album", options);
    if (filterIds && !filterIds.size) {
      return {
        items: [],
        nextCursor: null,
        totalCount: 0,
        catalogRevision: revision,
      };
    }
    let query = this.database.orm.CatalogAlbum.where((album) =>
      album.trackCount.gt(0),
    ).where({ mediaType });
    if (options.liked !== "true") {
      query = query.where((album) => album.availableTrackCount.gt(0));
    }
    if (filterIds) query = query.where((album) => album.id.in([...filterIds]));
    const { count: totalCount } = await query.aggregate((aggregate) => ({
      count: aggregate.count(),
    }));
    const directionValue = orderDirection(direction);
    const ordered =
      sort === "artist"
        ? query.orderBy([
            (album) => album.normalizedArtist[directionValue](),
            (album) => album.id[directionValue](),
          ])
        : query.orderBy([
            (album) => album.normalizedTitle[directionValue](),
            (album) => album.id[directionValue](),
          ]);
    let paged: typeof ordered;
    if (cursor?.key) {
      if (sort === "artist") {
        paged = ordered.cursor({
          normalizedArtist: cursorString(cursor.key, "normalizedArtist"),
          id: cursorString(cursor.key, "id"),
        });
      } else {
        paged = ordered.cursor({
          normalizedTitle: cursorString(cursor.key, "normalizedTitle"),
          id: cursorString(cursor.key, "id"),
        });
      }
    } else {
      paged = ordered.offset(cursor?.offset ?? 0);
    }
    const rows = await paged.limit(limit + 1).all();
    const hasMore = rows.length > limit;
    const pageRows = rows.slice(0, limit);
    const likedIds = await this.likedAlbumIds(options.userId);
    const items = pageRows.map((collection) => {
      const authors = this.collectionCreators(collection.artistCredits, [
        collection.artist,
      ]);
      if (mediaType === "audiobook") {
        return {
          id: collection.id,
          mediaType,
          title: collection.title,
          author: collection.artist,
          authors,
          coverUrl: toCoverUrl(collection.coverId, this.playbackTokens),
          chapterCount: collection.trackCount,
          durationMs: collection.durationMs,
          releaseYear: collection.releaseYear,
          available: collection.availableTrackCount > 0,
          liked: likedIds.has(collection.id),
        } satisfies AudiobookSummaryResponse;
      }
      return {
        id: collection.id,
        mediaType,
        title: collection.title,
        publisher: collection.artist,
        publishers: authors,
        coverUrl: toCoverUrl(collection.coverId, this.playbackTokens),
        episodeCount: collection.trackCount,
        durationMs: collection.durationMs,
        latestPublishedAt: collection.latestPublishedAt?.toISOString() ?? null,
        available: collection.availableTrackCount > 0,
        liked: likedIds.has(collection.id),
      } satisfies PodcastSummaryResponse;
    });
    return {
      items,
      nextCursor: hasMore
        ? encodeCursor(
            sort === "artist"
              ? {
                  normalizedArtist: pageRows.at(-1)!.normalizedArtist,
                  id: pageRows.at(-1)!.id,
                }
              : {
                  normalizedTitle: pageRows.at(-1)!.normalizedTitle,
                  id: pageRows.at(-1)!.id,
                },
            signature,
          )
        : null,
      totalCount,
      catalogRevision: revision,
    } as AudiobookListResponse | PodcastListResponse;
  }

  async audiobook(
    id: string,
    userId: string,
  ): Promise<AudiobookSummaryResponse | null> {
    return (await this.collection(
      "audiobook",
      id,
      userId,
    )) as AudiobookSummaryResponse | null;
  }

  async podcast(
    id: string,
    userId: string,
  ): Promise<PodcastSummaryResponse | null> {
    return (await this.collection(
      "podcast",
      id,
      userId,
    )) as PodcastSummaryResponse | null;
  }

  private async collection(
    mediaType: "audiobook" | "podcast",
    id: string,
    userId: string,
  ): Promise<AudiobookSummaryResponse | PodcastSummaryResponse | null> {
    const collection = await this.database.orm.CatalogAlbum.where({
      id,
      mediaType,
    }).first();
    if (!collection || collection.trackCount < 1) return null;
    const creators = this.collectionCreators(collection.artistCredits, [
      collection.artist,
    ]);
    const liked = (await this.likedAlbumIds(userId)).has(collection.id);
    if (mediaType === "audiobook") {
      return {
        id: collection.id,
        mediaType,
        title: collection.title,
        author: collection.artist,
        authors: creators,
        coverUrl: toCoverUrl(collection.coverId, this.playbackTokens),
        chapterCount: collection.trackCount,
        durationMs: collection.durationMs,
        releaseYear: collection.releaseYear,
        available: collection.availableTrackCount > 0,
        liked,
      };
    }
    return {
      id: collection.id,
      mediaType,
      title: collection.title,
      publisher: collection.artist,
      publishers: creators,
      coverUrl: toCoverUrl(collection.coverId, this.playbackTokens),
      episodeCount: collection.trackCount,
      durationMs: collection.durationMs,
      latestPublishedAt: collection.latestPublishedAt?.toISOString() ?? null,
      available: collection.availableTrackCount > 0,
      liked,
    };
  }

  async listArtists(options: CardPageOptions): Promise<ArtistListResponse> {
    const limit = pageSize(
      options.limit,
      MAX_CARD_PAGE_SIZE,
      DEFAULT_CARD_PAGE_SIZE,
    );
    const direction = sortDirection(options.direction);
    artistSort(options.sort);
    const signature = cardSignature("artist", options);
    const revision = await this.revision();
    const cursor = decodeCursor(options.cursor);
    if (cursor && cursor.signature !== signature) {
      throw new CatalogError(
        "stale_catalog_cursor",
        "The catalog query changed while paging; reload from the first page",
      );
    }
    const filterIds = await this.cardFilterIds("artist", options);
    if (filterIds && !filterIds.size) {
      return {
        items: [],
        nextCursor: null,
        totalCount: 0,
        catalogRevision: revision,
      };
    }
    let query = this.database.orm.CatalogArtist.where((artist) =>
      artist.trackCount.gt(0),
    );
    if (options.liked !== "true") {
      query = query.where((artist) => artist.availableTrackCount.gt(0));
    }
    if (filterIds)
      query = query.where((artist) => artist.id.in([...filterIds]));
    const { count: totalCount } = await query.aggregate((aggregate) => ({
      count: aggregate.count(),
    }));
    const directionValue = orderDirection(direction);
    const ordered = query.orderBy([
      (artist) => artist.normalizedDisplayName[directionValue](),
      (artist) => artist.id[directionValue](),
    ]);
    const paged = cursor?.key
      ? ordered.cursor({
          normalizedDisplayName: cursorString(
            cursor.key,
            "normalizedDisplayName",
          ),
          id: cursorString(cursor.key, "id"),
        })
      : ordered.offset(cursor?.offset ?? 0);
    const rows = await paged.limit(limit + 1).all();
    const hasMore = rows.length > limit;
    const pageRows = rows.slice(0, limit);
    const likedKeys = await this.likedArtistKeys(options.userId);
    const artistMetadata = await this.artistMetadataMap(
      pageRows.map((artist) => artist.id),
    );
    return {
      items: pageRows.map((artist) =>
        this.toArtistSummary(
          artist,
          likedKeys.has(normalize(artist.name)),
          artistMetadata.get(artist.id) ?? null,
        ),
      ),
      nextCursor: hasMore
        ? encodeCursor(
            {
              normalizedDisplayName: pageRows.at(-1)!.normalizedDisplayName,
              id: pageRows.at(-1)!.id,
            },
            signature,
          )
        : null,
      totalCount,
      catalogRevision: revision,
    };
  }

  async album(
    id: string,
    userId: string,
  ): Promise<AlbumSummaryResponse | null> {
    const album = await this.database.orm.CatalogAlbum.where({
      id,
      mediaType: "music",
    }).first();
    if (!album || album.trackCount < 1) return null;
    const sourceKinds =
      (await this.albumSourceKinds([album.id])).get(album.id) ?? [];
    return this.toAlbumSummary(
      album,
      (await this.likedAlbumIds(userId)).has(album.id),
      sourceKinds,
    );
  }

  async artist(
    id: string,
    userId: string,
  ): Promise<ArtistSummaryResponse | null> {
    const artist = await this.database.orm.CatalogArtist.first({ id });
    if (!artist || artist.trackCount < 1) return null;
    return this.toArtistSummary(
      artist,
      (await this.likedArtistKeys(userId)).has(normalize(artist.name)),
      await this.database.orm.ArtistMetadata.first({ artistId: id }),
    );
  }

  async refreshArtistMetadata(artistId: string): Promise<void> {
    return this.serializeCatalog(async () => {
      const artist = await this.database.orm.CatalogArtist.first({
        id: artistId,
      });
      if (!artist) return;
      const metadata = await this.database.orm.ArtistMetadata.first({
        artistId,
      });
      const displayName =
        metadata?.metadataMode !== "file" && metadata?.displayName.trim()
          ? metadata.displayName
          : artist.name;
      await this.database.orm.CatalogArtist.where({ id: artistId }).update({
        displayName,
        normalizedDisplayName: normalize(displayName),
      });
      await this.replaceCardTerms("artist", artistId, [
        artist.name,
        displayName,
      ]);
      this.markChanged(null, "metadata");
    });
  }

  async artistImage(artistId: string): Promise<ArtistImageRow | null> {
    const metadata = await this.database.orm.ArtistMetadata.first({
      artistId,
    });
    if (!metadata?.imageId) return null;
    return this.database.orm.ArtistImage.first({ id: metadata.imageId });
  }

  private async hydrateTracks(ids: readonly string[], userId: string) {
    if (!ids.length) return [];
    const [tracks, projected, likedRows] = await Promise.all([
      this.database.orm.Track.where((track) => track.id.in([...ids]))
        .include("source", (source) => source.select("kind"))
        .all(),
      this.database.orm.CatalogTrack.where((track) =>
        track.id.in([...ids]),
      ).all(),
      this.database.orm.TrackLike.where({ userId })
        .where((like) => like.trackId.in([...ids]))
        .all(),
    ]);
    const likedIds = new Set(likedRows.map((like) => like.trackId));
    const albumIds = new Map(
      projected.map((track) => [track.id, track.albumId]),
    );
    const byId = new Map(
      tracks.map((track) => [
        track.id,
        toTrackResponse(
          track,
          this.playbackTokens,
          likedIds.has(track.id),
          albumIds.get(track.id) ?? null,
        ),
      ]),
    );
    return ids.flatMap((id) => {
      const track = byId.get(id);
      return track ? [track] : [];
    });
  }

  private async trackFilterIds(
    options: TrackPageOptions,
  ): Promise<Set<string> | null> {
    const sets: Set<string>[] = [];
    const terms = searchTerms([options.query]);
    if (terms.length) {
      sets.push(await this.searchIds("track", terms));
    }
    if (options.artistId) {
      const links = await this.database.orm.CatalogTrackArtist.where({
        artistId: options.artistId,
      }).all();
      sets.push(new Set(links.map((link) => link.trackId)));
    }
    if (options.liked === "true") {
      const likes = await this.database.orm.TrackLike.where({
        userId: options.userId,
      }).all();
      sets.push(new Set(likes.map((like) => like.trackId)));
    } else if (options.liked !== undefined && options.liked !== "false") {
      throw new CatalogError(
        "invalid_catalog_query",
        "liked must be true or false",
      );
    }
    if (!sets.length) return null;
    const [first, ...rest] = sets;
    return new Set(
      [...first!].filter((id) => rest.every((set) => set.has(id))),
    );
  }

  private async cardFilterIds(
    kind: "album" | "artist",
    options: CardPageOptions,
  ): Promise<Set<string> | null> {
    const sets: Set<string>[] = [];
    const terms = searchTerms([options.query]);
    if (terms.length) sets.push(await this.searchIds(kind, terms));
    if (options.liked === "true") {
      if (kind === "album") sets.push(await this.likedAlbumIds(options.userId));
      else sets.push(await this.likedArtistIds(options.userId));
    } else if (options.liked !== undefined && options.liked !== "false") {
      throw new CatalogError(
        "invalid_catalog_query",
        "liked must be true or false",
      );
    }
    if (!sets.length) return null;
    const [first, ...rest] = sets;
    return new Set(
      [...first!].filter((id) => rest.every((set) => set.has(id))),
    );
  }

  private async searchIds(
    entityType: "track" | "album" | "artist",
    terms: readonly string[],
  ): Promise<Set<string>> {
    let intersection: Set<string> | null = null;
    for (const term of terms.slice(0, MAX_QUERY_TERMS)) {
      const rows = await this.database.orm.CatalogSearchTerm.where({
        entityType,
        term,
      }).all();
      const ids = new Set(rows.map((row) => row.entityId));
      const currentIntersection: Set<string> | null = intersection;
      if (currentIntersection) {
        const narrowed = new Set<string>();
        for (const id of currentIntersection) {
          if (ids.has(id)) narrowed.add(id);
        }
        intersection = narrowed;
      } else {
        intersection = ids;
      }
      if (!intersection.size) break;
    }
    const candidates = [...(intersection ?? [])];
    if (!candidates.length) return new Set();
    if (entityType === "track") {
      const rows = await this.database.orm.CatalogTrack.where((track) =>
        track.id.in(candidates),
      ).all();
      return new Set(
        rows.flatMap((track) => {
          const value = `${track.normalizedTitle} ${track.normalizedArtist} ${track.normalizedAlbum} ${track.normalizedGenres}`;
          return terms.every((term) => value.includes(term)) ? [track.id] : [];
        }),
      );
    }
    if (entityType === "album") {
      const rows = await this.database.orm.CatalogAlbum.where((album) =>
        album.id.in(candidates),
      ).all();
      return new Set(
        rows.flatMap((album) => {
          const value = `${album.normalizedTitle} ${album.normalizedArtist}`;
          return terms.every((term) => value.includes(term)) ? [album.id] : [];
        }),
      );
    }
    const rows = await this.database.orm.CatalogArtist.where((artist) =>
      artist.id.in(candidates),
    ).all();
    return new Set(
      rows.flatMap((artist) =>
        terms.every((term) =>
          `${artist.normalizedName} ${artist.normalizedDisplayName}`.includes(
            term,
          ),
        )
          ? [artist.id]
          : [],
      ),
    );
  }

  private async likedArtistKeys(userId: string): Promise<Set<string>> {
    const rows = await this.database.orm.ArtistLike.where({ userId }).all();
    return new Set(rows.map((row) => normalize(row.name)));
  }

  private async likedAlbumIds(userId: string): Promise<Set<string>> {
    const rows = await this.database.orm.AlbumLike.where({ userId }).all();
    return new Set(rows.map((row) => row.albumId));
  }

  private async likedArtistIds(userId: string): Promise<Set<string>> {
    const rows = await this.database.orm.ArtistLike.where({ userId }).all();
    return new Set(rows.map((row) => catalogArtistId(row.name)));
  }

  private async albumSourceKinds(
    albumIds: readonly string[],
  ): Promise<Map<string, SourceKind[]>> {
    if (!albumIds.length) return new Map();
    const tracks = await this.database.orm.CatalogTrack.where((track) =>
      track.albumId.in([...albumIds]),
    )
      .where({ available: 1 })
      .select("albumId", "sourceId")
      .all();
    const sourceIds = [
      ...new Set(
        tracks.flatMap((track) => (track.sourceId ? [track.sourceId] : [])),
      ),
    ];
    if (!sourceIds.length) {
      return new Map(albumIds.map((albumId) => [albumId, []]));
    }
    const sources = await this.database.orm.Source.where((source) =>
      source.id.in(sourceIds),
    )
      .orderBy([
        (source) => source.position.asc(),
        (source) => source.createdAt.asc(),
      ])
      .select("id", "kind")
      .all();
    const orderedKinds = [
      ...new Set(
        sources.flatMap((source) => {
          const kind = parsedSourceKind(source.kind);
          return kind ? [kind] : [];
        }),
      ),
    ];
    const kindBySourceId = new Map(
      sources.flatMap((source) => {
        const kind = parsedSourceKind(source.kind);
        return kind ? [[source.id, kind] as const] : [];
      }),
    );
    const kindsByAlbum = new Map<string, Set<SourceKind>>();
    for (const track of tracks) {
      if (!track.albumId || !track.sourceId) continue;
      const kind = kindBySourceId.get(track.sourceId);
      if (!kind) continue;
      const kinds = kindsByAlbum.get(track.albumId) ?? new Set<SourceKind>();
      kinds.add(kind);
      kindsByAlbum.set(track.albumId, kinds);
    }
    return new Map(
      albumIds.map((albumId) => {
        const kinds = kindsByAlbum.get(albumId);
        return [
          albumId,
          kinds ? orderedKinds.filter((kind) => kinds.has(kind)) : [],
        ];
      }),
    );
  }

  private toAlbumSummary(
    album: {
      id: string;
      title: string;
      artist: string;
      artistCredits: string | null;
      coverId: string | null;
      coverTrackId: string | null;
      trackCount: number;
      availableTrackCount: number;
      durationMs: number | null;
      releaseYear: number | null;
    },
    liked: boolean,
    sourceKinds: SourceKind[],
  ): AlbumSummaryResponse {
    let artists = [album.artist];
    try {
      const parsed = album.artistCredits
        ? (JSON.parse(album.artistCredits) as unknown)
        : null;
      if (Array.isArray(parsed)) {
        const values = parsed.filter(
          (value): value is string =>
            typeof value === "string" && value.length > 0,
        );
        if (values.length) artists = values;
      }
    } catch {
      // Projection data falls back to the primary artist.
    }
    return {
      id: album.id,
      title: album.title,
      artist: album.artist,
      artists,
      sourceKinds,
      coverUrl: toCoverUrl(album.coverId, this.playbackTokens),
      trackCount: album.trackCount,
      durationMs: album.durationMs,
      releaseYear: album.releaseYear,
      available: album.availableTrackCount > 0,
      liked,
    };
  }

  private collectionCreators(
    artistCredits: string | null,
    fallback: readonly string[],
  ): string[] {
    try {
      const parsed = artistCredits
        ? (JSON.parse(artistCredits) as unknown)
        : null;
      if (Array.isArray(parsed)) {
        const values = parsed.filter(
          (value): value is string =>
            typeof value === "string" && value.trim().length > 0,
        );
        if (values.length) return values;
      }
    } catch {
      // Projection data falls back to the stored creator.
    }
    return [...fallback];
  }

  private toArtistSummary(
    artist: {
      id: string;
      name: string;
      displayName: string;
      trackCount: number;
      availableTrackCount: number;
      albumCount: number;
      durationMs: number | null;
    },
    liked: boolean,
    metadata: ArtistMetadataRow | null,
  ): ArtistSummaryResponse {
    const metadataResponse = this.toArtistMetadataResponse(metadata);
    return {
      id: artist.id,
      name: metadataResponse ? artist.displayName : artist.name,
      localName: artist.name,
      albumCount: artist.albumCount,
      trackCount: artist.trackCount,
      durationMs: artist.durationMs,
      available: artist.availableTrackCount > 0,
      imageUrl:
        metadata?.imageId && metadataResponse?.portrait
          ? `/api/artists/${encodeURIComponent(artist.id)}/image?artistImageToken=${encodeURIComponent(this.playbackTokens.issueArtistImage(artist.id).token)}`
          : null,
      metadata: metadataResponse,
      liked,
    };
  }

  private async artistMetadataMap(
    artistIds: readonly string[],
  ): Promise<Map<string, ArtistMetadataRow>> {
    if (!artistIds.length) return new Map();
    const rows = await this.database.orm.ArtistMetadata.where((metadata) =>
      metadata.artistId.in([...artistIds]),
    ).all();
    return new Map(rows.map((row) => [row.artistId, row]));
  }

  private toArtistMetadataResponse(
    metadata: ArtistMetadataRow | null,
  ): ArtistMetadataResponse | null {
    if (
      !metadata ||
      metadata.metadataMode === "file" ||
      !metadata.nameProviderId ||
      !metadata.nameProviderKind ||
      !metadata.nameProviderName ||
      !metadata.externalArtistId ||
      !metadata.nameSourceUrl ||
      !metadata.matchedAt ||
      (metadata.nameProviderKind !== "musicbrainz" &&
        metadata.nameProviderKind !== "discogs")
    ) {
      return null;
    }
    const providerKind = metadata.nameProviderKind;
    let portrait: ArtistMetadataResponse["portrait"] = null;
    if (
      metadata.imageId &&
      metadata.imageProviderId &&
      (metadata.imageProviderKind === "musicbrainz" ||
        metadata.imageProviderKind === "discogs") &&
      metadata.imageProviderName &&
      metadata.imageExternalArtistId &&
      metadata.imageSourceUrl
    ) {
      portrait = {
        providerId: metadata.imageProviderId,
        providerKind: metadata.imageProviderKind,
        providerName: metadata.imageProviderName,
        externalArtistId: metadata.imageExternalArtistId,
        sourceUrl: metadata.imageSourceUrl,
      };
    }
    return {
      mode: metadata.metadataMode === "manual" ? "manual" : "automatic",
      matchedAt: metadata.matchedAt.toISOString(),
      name: {
        providerId: metadata.nameProviderId,
        providerKind,
        providerName: metadata.nameProviderName,
        externalArtistId: metadata.externalArtistId,
        sourceUrl: metadata.nameSourceUrl,
      },
      portrait,
    };
  }

  private async refreshAlbum(albumId: string, excludedTrackId?: string) {
    const tracks = (
      await this.database.orm.CatalogTrack.where({
        albumId,
      }).all()
    ).filter((track) => track.id !== excludedTrackId);
    if (!tracks.length) {
      await this.removeAlbum(albumId);
      return;
    }
    const availableTracks = tracks.filter((track) => track.available);
    const representativeTracks = availableTracks.length
      ? availableTracks
      : tracks;
    const first = [...tracks].sort(
      (left, right) =>
        left.normalizedTitle.localeCompare(right.normalizedTitle) ||
        left.id.localeCompare(right.id),
    )[0]!;
    const coverTrack =
      representativeTracks.find((track) => track.coverId) ?? first;
    const years = new Set(
      tracks.flatMap((track) =>
        track.releaseYear === null ? [] : [track.releaseYear],
      ),
    );
    const explicitAlbumArtists = uniqueArtistCredits(
      tracks.flatMap((track) =>
        parseStoredOptionalArtistCredits(
          track.albumArtistCredits,
          track.albumArtist,
        ),
      ),
    );
    const albumArtists = explicitAlbumArtists.length
      ? explicitAlbumArtists
      : parseStoredArtistCredits(first.artistCredits, first.artist);
    const albumArtist = albumArtists.join(", ");
    const collectionMediaType = storedMediaType(first.mediaType);
    const latestPublishedAt =
      tracks
        .flatMap((track) => (track.publishedAt ? [track.publishedAt] : []))
        .sort((left, right) => right.getTime() - left.getTime())[0] ?? null;
    const values = {
      mediaType: collectionMediaType,
      title: first.album ?? "Unknown Album",
      artist: albumArtist,
      normalizedTitle: normalize(first.album ?? "Unknown Album"),
      normalizedArtist: normalize(albumArtist),
      artistId:
        collectionMediaType === "music"
          ? catalogArtistId(albumArtists[0] ?? first.artist)
          : null,
      coverId: coverTrack.coverId,
      coverTrackId: coverTrack.coverId ? coverTrack.id : null,
      artistCredits: JSON.stringify(albumArtists),
      trackCount: tracks.length,
      availableTrackCount: availableTracks.length,
      durationMs: tracks.some((track) => track.durationMs !== null)
        ? tracks.reduce(
            (total, track) => total + finiteDuration(track.durationMs),
            0,
          )
        : null,
      releaseYear: years.size === 1 ? [...years][0]! : null,
      latestPublishedAt,
    };
    const existing = await this.database.orm.CatalogAlbum.first({
      id: albumId,
    });
    if (existing) {
      await this.database.orm.CatalogAlbum.where({ id: albumId }).update(
        values,
      );
    } else {
      await this.database.orm.CatalogAlbum.create({ id: albumId, ...values });
    }
    await this.replaceCardTerms("album", albumId, [
      values.title,
      values.artist,
    ]);
  }

  private async removeAlbum(albumId: string) {
    await this.deleteSearchTerms("album", albumId);
    await this.database.orm.CatalogAlbum.where({
      id: albumId,
    }).deleteAndCount();
  }

  private async addArtistContribution(
    artistId: string,
    name: string,
    albumId: string | null,
    durationMs: number | null,
    available: boolean,
  ) {
    const existing = await this.database.orm.CatalogArtist.first({
      id: artistId,
    });
    let albumCount = existing?.albumCount ?? 0;
    if (albumId) {
      const albumLink = await this.database.orm.CatalogArtistAlbum.first({
        artistId,
        albumId,
      });
      if (!albumLink) {
        await this.database.orm.CatalogArtistAlbum.create({
          artistId,
          albumId,
          trackCount: 1,
        });
        albumCount += 1;
      } else {
        await this.database.orm.CatalogArtistAlbum.where({
          artistId,
          albumId,
        }).update({ trackCount: albumLink.trackCount + 1 });
      }
    }
    const metadata = await this.database.orm.ArtistMetadata.first({
      artistId,
    });
    const displayName =
      metadata?.metadataMode !== "file" && metadata?.displayName.trim()
        ? metadata.displayName
        : name;
    const values = {
      name,
      normalizedName: normalize(name),
      displayName,
      normalizedDisplayName: normalize(displayName),
      trackCount: (existing?.trackCount ?? 0) + 1,
      availableTrackCount:
        (existing?.availableTrackCount ?? 0) + (available ? 1 : 0),
      albumCount,
      durationMs:
        existing?.durationMs === null || existing?.durationMs === undefined
          ? durationMs
          : durationMs === null
            ? existing.durationMs
            : existing.durationMs + durationMs,
    };
    if (existing) {
      await this.database.orm.CatalogArtist.where({ id: artistId }).update(
        values,
      );
    } else {
      await this.database.orm.CatalogArtist.create({ id: artistId, ...values });
    }
    await this.replaceCardTerms(
      "artist",
      artistId,
      [name, displayName].filter((value): value is string =>
        Boolean(value?.trim()),
      ),
    );
  }

  private async removeArtistContribution(
    artistId: string,
    track: {
      albumId: string | null;
      durationMs: number | null;
      available: number;
    },
    trackId: string,
  ) {
    const artist = await this.database.orm.CatalogArtist.first({
      id: artistId,
    });
    if (!artist) return;
    let albumCount = artist.albumCount;
    if (track.albumId) {
      const albumLink = await this.database.orm.CatalogArtistAlbum.first({
        artistId,
        albumId: track.albumId,
      });
      if (albumLink) {
        if (albumLink.trackCount <= 1) {
          await this.database.orm.CatalogArtistAlbum.where({
            artistId,
            albumId: track.albumId,
          }).deleteAndCount();
          albumCount = Math.max(0, albumCount - 1);
        } else {
          await this.database.orm.CatalogArtistAlbum.where({
            artistId,
            albumId: track.albumId,
          }).update({ trackCount: albumLink.trackCount - 1 });
        }
      }
    }
    const trackCount = Math.max(0, artist.trackCount - 1);
    const availableTrackCount = Math.max(
      0,
      artist.availableTrackCount - (track.available ? 1 : 0),
    );
    const durationMs =
      artist.durationMs === null
        ? null
        : Math.max(0, artist.durationMs - finiteDuration(track.durationMs));
    if (!trackCount) {
      await this.deleteSearchTerms("artist", artistId);
      await this.deleteArtistAlbums(artistId);
      await this.database.orm.CatalogArtist.where({
        id: artistId,
      }).deleteAndCount();
      return;
    }
    const remainingLinks = await this.database.orm.CatalogTrackArtist.where({
      artistId,
    }).all();
    if (remainingLinks.length <= 1 && remainingLinks[0]?.trackId === trackId) {
      await this.deleteSearchTerms("artist", artistId);
      await this.deleteArtistAlbums(artistId);
      await this.database.orm.CatalogArtist.where({
        id: artistId,
      }).deleteAndCount();
      return;
    }
    await this.database.orm.CatalogArtist.where({ id: artistId }).update({
      trackCount,
      availableTrackCount,
      albumCount,
      durationMs,
    });
  }

  private async replaceCardTerms(
    entityType: "album" | "artist",
    entityId: string,
    values: readonly string[],
  ) {
    await this.deleteSearchTerms(entityType, entityId);
    for (const term of searchTerms(values)) {
      await this.createSearchTerm(entityType, entityId, term);
    }
  }

  private async createSearchTerm(
    entityType: "track" | "album" | "artist",
    entityId: string,
    term: string,
  ) {
    const existing = await this.database.orm.CatalogSearchTerm.first({
      entityType,
      entityId,
      term,
    });
    if (!existing) {
      await this.database.orm.CatalogSearchTerm.create({
        entityType,
        entityId,
        term,
      });
    }
  }

  private async deleteSearchTerms(
    entityType: "track" | "album" | "artist",
    entityId: string,
  ) {
    const terms = await this.database.orm.CatalogSearchTerm.where({
      entityType,
      entityId,
    }).all();
    for (const term of terms) {
      await this.database.orm.CatalogSearchTerm.where({
        id: term.id,
      }).delete();
    }
  }

  private async deleteArtistAlbums(artistId: string) {
    const links = await this.database.orm.CatalogArtistAlbum.where({
      artistId,
    }).all();
    for (const link of links) {
      await this.database.orm.CatalogArtistAlbum.where({
        id: link.id,
      }).delete();
    }
  }

  private markChanged(
    sourceId: string | null,
    reason: CatalogChange["reason"],
  ) {
    this.pendingChangedCount += 1;
    this.pendingSourceId = sourceId ?? this.pendingSourceId;
    this.pendingReason = reason;
    if (this.changeTimer) return;
    this.changeTimer = setTimeout(() => {
      this.changeTimer = undefined;
      void this.flushChanges();
    }, CHANGE_THROTTLE_MS);
    this.changeTimer.unref?.();
  }

  private serializeCatalog<T>(operation: () => Promise<T>): Promise<T> {
    const next = this.catalogTail.then(operation, operation);
    this.catalogTail = next.catch(() => undefined);
    return next;
  }

  private async runBackfill() {
    const state = await this.database.orm.CatalogState.first({
      id: CATALOG_STATE_ID,
    });
    if (!state || state.projectionVersion >= PROJECTION_VERSION) return;
    let offset = 0;
    while (true) {
      const tracks = await this.database.orm.Track.orderBy((track) =>
        track.id.asc(),
      )
        .offset(offset)
        .limit(BACKFILL_BATCH_SIZE)
        .all();
      if (!tracks.length) break;
      for (const track of tracks) {
        await this.reindexTrack(track.id);
        await yieldToEventLoop();
      }
      offset += tracks.length;
      if (tracks.length < BACKFILL_BATCH_SIZE) break;
    }
    await this.database.orm.CatalogState.where({
      id: CATALOG_STATE_ID,
    }).update({ projectionVersion: PROJECTION_VERSION });
    await this.flushChanges();
  }
}
