import type {
  AdminMediaCopyField,
  AdminMediaCopyResponse,
  AdminMediaField,
  AdminMediaFieldValue,
  AdminMediaListQuery,
  AdminMediaListResponse,
  AdminMediaResponse,
  AdminMediaSortField,
  CreateAdminMediaCopyRequest,
  CreateAdminMediaRequest,
  MediaType,
  MediaTypeOrigin,
} from "@peridot/contracts";
import { or, orderByField } from "@prisma/orm-sqlite/orm-client";
import {
  normalizeOptionalArtistCredits,
  parseStoredArtistCredits,
  parseStoredOptionalArtistCredits,
  serializeArtistCredits,
} from "./artist-credits.js";
import type { CatalogService } from "./catalog.js";
import type { Database } from "./database.js";
import {
  normalizeGenres,
  parseStoredGenres,
  serializeGenres,
} from "./genres.js";
import {
  normalizeMetadataDetails,
  parseStoredMetadataDetails,
  serializeMetadataDetails,
} from "./metadata-details.js";
import { refreshCanonicalMediaFromCopies } from "./media-copies.js";
import {
  ADMIN_MEDIA_COPY_FIELDS,
  ADMIN_MEDIA_FIELDS,
  manualOverrideFields,
  recordManualOverride,
  resetManualOverride,
} from "./media-overrides.js";
import { mediaType, storedMediaType } from "./media.js";
import type {
  LibrarySourceRow,
  MediaCopyRow,
  MediaRow,
} from "./prisma/models.js";
import {
  parseRecordingIdentityKeys,
  serializeRecordingIdentityKeys,
} from "./track-identities.js";

const PAGE_SIZES = new Set([25, 50, 100]);
const MAX_TEXT_LENGTH = 2_048;
const MEDIA_FIELDS = new Set<string>(ADMIN_MEDIA_FIELDS);
const MEDIA_COPY_FIELDS = new Set<string>(ADMIN_MEDIA_COPY_FIELDS);
const MEDIA_TYPES = new Set<MediaType>(["music", "audiobook", "podcast"]);
const MEDIA_TYPE_ORIGINS = new Set<MediaTypeOrigin>([
  "source",
  "embedded",
  "fallback",
]);
const METADATA_MODES = new Set(["automatic", "manual", "file"]);
const PROVIDER_KINDS = new Set(["musicbrainz", "discogs"]);
const SORT_FIELDS = new Set<AdminMediaSortField>([
  "title",
  "artist",
  "album",
  "mediaType",
  "available",
  "duration",
  "published",
  "copyCount",
  "createdAt",
  "updatedAt",
]);
const CHUNK_SIZE = 500;

type DatabaseClient =
  Database | Parameters<Parameters<Database["transaction"]>[0]>[0];

export class AdminMediaError extends Error {
  constructor(
    message: string,
    readonly statusCode = 400,
    readonly code = "invalid_media_update",
  ) {
    super(message);
    this.name = "AdminMediaError";
  }
}

function chunks<T>(values: readonly T[], size = CHUNK_SIZE): T[][] {
  const result: T[][] = [];
  for (let offset = 0; offset < values.length; offset += size) {
    result.push(values.slice(offset, offset + size));
  }
  return result;
}

function nullableText(value: unknown, label: string): string | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value !== "string") {
    throw new AdminMediaError(`${label} must be text.`);
  }
  const normalized = value.trim();
  if (normalized.length > MAX_TEXT_LENGTH) {
    throw new AdminMediaError(`${label} is too long.`);
  }
  return normalized || null;
}

function requiredText(value: unknown, label: string): string {
  const normalized = nullableText(value, label);
  if (!normalized) throw new AdminMediaError(`${label} is required.`);
  return normalized;
}

function stringArray(value: unknown, label: string): string[] {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    throw new AdminMediaError(`${label} must be a list of text values.`);
  }
  return value.map((item) => requiredText(item, label));
}

function optionalStringArray(value: unknown, label: string): string[] {
  if (value === null || value === undefined) return [];
  return stringArray(value, label);
}

function integerOrNull(value: unknown, label: string): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0) {
    throw new AdminMediaError(`${label} must be a non-negative whole number.`);
  }
  return parsed;
}

function positiveIntegerOrNull(value: unknown, label: string): number | null {
  const parsed = integerOrNull(value, label);
  return parsed === null || parsed > 0
    ? parsed
    : (() => {
        throw new AdminMediaError(`${label} must be greater than zero.`);
      })();
}

function dateOrNull(value: unknown, label: string): Date | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed =
    value instanceof Date
      ? value
      : typeof value === "string" || typeof value === "number"
        ? new Date(value)
        : null;
  if (!parsed || Number.isNaN(parsed.getTime())) {
    throw new AdminMediaError(`${label} must be a valid date.`);
  }
  return parsed;
}

function enumValue<T extends string>(
  value: unknown,
  allowed: ReadonlySet<T>,
  label: string,
): T {
  if (typeof value === "string" && allowed.has(value as T)) return value as T;
  throw new AdminMediaError(`${label} is invalid.`);
}

function mediaTypeValue(value: unknown): MediaType {
  return enumValue(value, MEDIA_TYPES, "Media type");
}

function mediaTypeOriginValue(value: unknown): MediaTypeOrigin {
  return enumValue(value, MEDIA_TYPE_ORIGINS, "Media type origin");
}

function httpsUrlOrNull(value: unknown, label: string): string | null {
  const text = nullableText(value, label);
  if (!text) return null;
  let url: URL;
  try {
    url = new URL(text);
  } catch {
    throw new AdminMediaError(`${label} must be a valid URL.`);
  }
  if (url.protocol !== "https:") {
    throw new AdminMediaError(`${label} must use HTTPS.`);
  }
  return url.toString();
}

function creditsStorage(value: unknown, label: string): string {
  return serializeArtistCredits(stringArray(value, label));
}

function optionalCreditsStorage(value: unknown, label: string): string | null {
  const credits = normalizeOptionalArtistCredits(
    optionalStringArray(value, label),
  );
  return credits.length ? JSON.stringify(credits) : null;
}

function genresStorage(value: unknown): string | null {
  if (!Array.isArray(value)) {
    throw new AdminMediaError("Genres must be a list of text values.");
  }
  return serializeGenres(normalizeGenres(value));
}

function metadataDetailsStorage(value: unknown): string | null {
  return serializeMetadataDetails(normalizeMetadataDetails(value));
}

function copyMediaTypeOrigin(copy: MediaCopyRow): MediaTypeOrigin {
  return MEDIA_TYPE_ORIGINS.has(copy.mediaTypeOrigin as MediaTypeOrigin)
    ? (copy.mediaTypeOrigin as MediaTypeOrigin)
    : "fallback";
}

function mediaOrigin(media: MediaRow): MediaTypeOrigin {
  return MEDIA_TYPE_ORIGINS.has(media.mediaTypeOrigin as MediaTypeOrigin)
    ? (media.mediaTypeOrigin as MediaTypeOrigin)
    : "fallback";
}

function sourceKind(source: LibrarySourceRow) {
  return source.kind === "jellyfin" ? "jellyfin" : "path";
}

function mediaFieldList(raw: string): AdminMediaField[] {
  return manualOverrideFields(raw).filter((field): field is AdminMediaField =>
    MEDIA_FIELDS.has(field),
  );
}

function copyFieldList(raw: string): AdminMediaCopyField[] {
  return manualOverrideFields(raw).filter(
    (field): field is AdminMediaCopyField => MEDIA_COPY_FIELDS.has(field),
  );
}

function textValue(value: unknown, label: string): string {
  return requiredText(value, label);
}

function fileSize(value: unknown): bigint {
  if (typeof value !== "string" || !/^\d+$/u.test(value) || value.length > 30) {
    throw new AdminMediaError(
      "File size must be a non-negative whole number of bytes.",
    );
  }
  return BigInt(value);
}

function coerceMediaValue(field: AdminMediaField, value: unknown) {
  switch (field) {
    case "mediaType":
      return mediaTypeValue(value);
    case "title":
      return textValue(value, "Title");
    case "artist":
      return textValue(value, "Artist");
    case "artistCredits":
      return creditsStorage(value, "Artist credits");
    case "albumArtist":
      return nullableText(value, "Album artist");
    case "albumArtistCredits":
      return optionalCreditsStorage(value, "Album artist credits");
    case "album":
      return nullableText(value, "Album");
    case "genres":
      return genresStorage(value);
    case "discNumber":
      return positiveIntegerOrNull(value, "Disc number");
    case "trackNumber":
      return positiveIntegerOrNull(value, "Track number");
    case "durationMs":
      return integerOrNull(value, "Duration");
    case "publishedAt":
      return dateOrNull(value, "Published date");
    case "metadataMode":
      return enumValue(value, METADATA_MODES, "Metadata mode");
    case "metadataTitle":
      return nullableText(value, "Matched title");
    case "metadataArtist":
      return nullableText(value, "Matched artist");
    case "metadataArtistCredits":
      return optionalCreditsStorage(value, "Matched artist credits");
    case "metadataAlbumArtist":
      return nullableText(value, "Matched album artist");
    case "metadataAlbumArtistCredits":
      return optionalCreditsStorage(value, "Matched album artist credits");
    case "metadataAlbum":
      return nullableText(value, "Matched album");
    case "metadataGenres":
      return genresStorage(value);
    case "metadataDiscNumber":
      return positiveIntegerOrNull(value, "Matched disc number");
    case "metadataTrackNumber":
      return positiveIntegerOrNull(value, "Matched track number");
    case "metadataProviderId":
      return nullableText(value, "Metadata provider ID");
    case "metadataProviderKind":
      return value == null || value === ""
        ? null
        : enumValue(value, PROVIDER_KINDS, "Metadata provider kind");
    case "metadataProviderName":
      return nullableText(value, "Metadata provider name");
    case "metadataExternalTrackId":
      return nullableText(value, "External track ID");
    case "metadataExternalReleaseId":
      return nullableText(value, "External release ID");
    case "metadataSourceUrl":
      return httpsUrlOrNull(value, "Metadata source URL");
    case "metadataDetails":
      return metadataDetailsStorage(value);
    case "metadataMatchedAt":
      return dateOrNull(value, "Metadata match date");
    case "coverId":
      return nullableText(value, "Cover ID");
  }
}

function coerceCopyValue(field: AdminMediaCopyField, value: unknown) {
  switch (field) {
    case "librarySourceId":
      return textValue(value, "Library source");
    case "relativePath":
      return textValue(value, "Relative path");
    case "mediaType":
      return mediaTypeValue(value);
    case "mediaTypeOrigin":
      return mediaTypeOriginValue(value);
    case "title":
      return textValue(value, "Title");
    case "artist":
      return textValue(value, "Artist");
    case "artistCredits":
      return creditsStorage(value, "Artist credits");
    case "albumArtist":
      return nullableText(value, "Album artist");
    case "albumArtistCredits":
      return optionalCreditsStorage(value, "Album artist credits");
    case "album":
      return nullableText(value, "Album");
    case "genres":
      return genresStorage(value);
    case "discNumber":
      return positiveIntegerOrNull(value, "Disc number");
    case "trackNumber":
      return positiveIntegerOrNull(value, "Track number");
    case "durationMs":
      return integerOrNull(value, "Duration");
    case "publishedAt":
      return dateOrNull(value, "Published date");
    case "mimeType":
      return textValue(value, "MIME type");
    case "fileSizeBytes":
      return fileSize(value);
    case "fileModifiedAt": {
      const parsed = dateOrNull(value, "File modified date");
      if (!parsed) throw new AdminMediaError("File modified date is required.");
      return parsed;
    }
    case "externalId":
      return nullableText(value, "External ID");
    case "externalVersion":
      return nullableText(value, "External version");
    case "externalContainer":
      return nullableText(value, "External container");
    case "externalCoverKey":
      return nullableText(value, "External cover key");
    case "recordingIdentityKeys":
      return serializeRecordingIdentityKeys(
        stringArray(value, "Recording identities"),
      );
    case "audioLossless":
      if (typeof value !== "boolean") {
        throw new AdminMediaError("Lossless state must be true or false.");
      }
      return value ? 1 : 0;
    case "audioBitrate":
      return integerOrNull(value, "Audio bitrate");
    case "coverId":
      return nullableText(value, "Cover ID");
  }
}

function assertKnownMediaField(
  field: string,
): asserts field is AdminMediaField {
  if (!MEDIA_FIELDS.has(field)) {
    throw new AdminMediaError("That media field is not editable.");
  }
}

function assertKnownCopyField(
  field: string,
): asserts field is AdminMediaCopyField {
  if (!MEDIA_COPY_FIELDS.has(field)) {
    throw new AdminMediaError("That file field is not editable.");
  }
}

function checkExpectedUpdatedAt(row: { updatedAt: Date }, expected: string) {
  const value = new Date(expected);
  if (
    Number.isNaN(value.getTime()) ||
    value.getTime() !== row.updatedAt.getTime()
  ) {
    throw new AdminMediaError(
      "This record changed since it was loaded. Reload and try again.",
      409,
      "media_edit_conflict",
    );
  }
}

async function assertCover(database: DatabaseClient, value: unknown) {
  if (value === null || value === undefined || value === "") return;
  if (typeof value !== "string") {
    throw new AdminMediaError("Cover ID must be text.");
  }
  const cover = await database.orm.Cover.first({ id: value });
  if (!cover) throw new AdminMediaError("Cover not found.", 404);
}

async function assertProvider(database: DatabaseClient, value: unknown) {
  if (value === null || value === undefined || value === "") return;
  if (typeof value !== "string") {
    throw new AdminMediaError("Metadata provider ID must be text.");
  }
  const provider = await database.orm.MetadataProvider.first({ id: value });
  if (!provider) {
    throw new AdminMediaError("Metadata provider not found.", 404);
  }
}

async function loadMediaRows(
  database: Database,
  ids: readonly string[],
): Promise<MediaRow[]> {
  const rows: MediaRow[] = [];
  for (const batch of chunks(ids)) {
    rows.push(
      ...(await database.orm.Media.where((media) => media.id.in(batch)).all()),
    );
  }
  return rows;
}

async function loadCopyRows(
  database: Database,
  mediaIds: readonly string[],
): Promise<MediaCopyRow[]> {
  const rows: MediaCopyRow[] = [];
  for (const batch of chunks(mediaIds)) {
    rows.push(
      ...(await database.orm.MediaCopy.where((copy) =>
        copy.mediaId.in(batch),
      ).all()),
    );
  }
  return rows;
}

async function loadSources(
  database: Database,
  copyRows: readonly MediaCopyRow[],
): Promise<Map<string, LibrarySourceRow>> {
  const ids = [...new Set(copyRows.map((copy) => copy.librarySourceId))];
  const rows: LibrarySourceRow[] = [];
  for (const batch of chunks(ids)) {
    rows.push(
      ...(await database.orm.LibrarySource.where((source) =>
        source.id.in(batch),
      ).all()),
    );
  }
  return new Map(rows.map((source) => [source.id, source]));
}

async function usageForMedia(database: Database, mediaIds: readonly string[]) {
  const likes = new Map<string, number>();
  const plays = new Map<string, number>();
  const playlistItems = new Map<string, number>();
  const aliases = new Map<string, number>();
  if (!mediaIds.length) return { likes, plays, playlistItems, aliases };
  for (const batch of chunks(mediaIds)) {
    const [likeRows, playRows, playlistRows, aliasRows] = await Promise.all([
      database.orm.MediaLike.where((row) => row.mediaId.in(batch)).all(),
      database.orm.MediaPlayEvent.where((row) => row.mediaId.in(batch)).all(),
      database.orm.PlaylistItem.where((row) => row.mediaId.in(batch)).all(),
      database.orm.MediaAlias.where((row) => row.mediaId.in(batch)).all(),
    ]);
    for (const row of likeRows)
      likes.set(row.mediaId, (likes.get(row.mediaId) ?? 0) + 1);
    for (const row of playRows)
      plays.set(row.mediaId, (plays.get(row.mediaId) ?? 0) + 1);
    for (const row of playlistRows) {
      if (row.mediaId) {
        playlistItems.set(
          row.mediaId,
          (playlistItems.get(row.mediaId) ?? 0) + 1,
        );
      }
    }
    for (const row of aliasRows) {
      aliases.set(row.mediaId, (aliases.get(row.mediaId) ?? 0) + 1);
    }
  }
  return { likes, plays, playlistItems, aliases };
}

function copyResponse(
  copy: MediaCopyRow,
  source: LibrarySourceRow,
): AdminMediaCopyResponse {
  return {
    id: copy.id,
    mediaId: copy.mediaId,
    librarySourceId: copy.librarySourceId,
    librarySourceName: source.name ?? "Library source",
    librarySourceKind: sourceKind(source),
    librarySourcePath: source.path ?? null,
    librarySourceRemoved: Boolean(source.removedAt),
    relativePath: copy.relativePath,
    mediaType: mediaType(copy.mediaType),
    mediaTypeOrigin: copyMediaTypeOrigin(copy),
    title: copy.title,
    artist: copy.artist,
    artistCredits: parseStoredArtistCredits(copy.artistCredits, copy.artist),
    albumArtist: copy.albumArtist,
    albumArtistCredits: parseStoredOptionalArtistCredits(
      copy.albumArtistCredits,
      copy.albumArtist,
    ),
    album: copy.album,
    genres: parseStoredGenres(copy.genres),
    discNumber: copy.discNumber,
    trackNumber: copy.trackNumber,
    durationMs: copy.durationMs,
    publishedAt: copy.publishedAt?.toISOString() ?? null,
    mimeType: copy.mimeType,
    fileSizeBytes: copy.fileSizeBytes.toString(),
    fileModifiedAt: copy.fileModifiedAt.toISOString(),
    externalId: copy.externalId,
    externalVersion: copy.externalVersion,
    externalContainer: copy.externalContainer,
    externalCoverKey: copy.externalCoverKey,
    recordingIdentityKeys: parseRecordingIdentityKeys(
      copy.recordingIdentityKeys,
    ),
    audioLossless: Boolean(copy.audioLossless),
    audioBitrate: copy.audioBitrate,
    coverId: copy.coverId,
    available: Boolean(copy.available),
    lastSeenScanId: copy.lastSeenScanId,
    metadataVersion: copy.metadataVersion,
    manualOverrideFields: copyFieldList(copy.manualOverrides),
    createdAt: copy.createdAt.toISOString(),
    updatedAt: copy.updatedAt.toISOString(),
  };
}

async function adminMediaItems(
  database: Database,
  mediaIds: readonly string[],
): Promise<AdminMediaResponse[]> {
  if (!mediaIds.length) return [];
  const mediaRows = await loadMediaRows(database, mediaIds);
  const copyRows = await loadCopyRows(database, mediaIds);
  const sourceById = await loadSources(database, copyRows);
  const [usage, providerRows] = await Promise.all([
    usageForMedia(database, mediaIds),
    database.orm.MetadataProvider.select("id", "name").all(),
  ]);
  const providerNames = new Map(
    providerRows.map((provider) => [provider.id, provider.name]),
  );
  const copiesByMedia = new Map<string, MediaCopyRow[]>();
  for (const copy of copyRows) {
    const items = copiesByMedia.get(copy.mediaId) ?? [];
    items.push(copy);
    copiesByMedia.set(copy.mediaId, items);
  }
  for (const items of copiesByMedia.values()) {
    items.sort((left, right) => {
      const leftSource = sourceById.get(left.librarySourceId);
      const rightSource = sourceById.get(right.librarySourceId);
      return (
        (leftSource?.position ?? 0) - (rightSource?.position ?? 0) ||
        left.relativePath.localeCompare(right.relativePath) ||
        left.id.localeCompare(right.id)
      );
    });
  }
  const mediaById = new Map(mediaRows.map((media) => [media.id, media]));
  return mediaIds.flatMap((mediaId) => {
    const media = mediaById.get(mediaId);
    if (!media) return [];
    const copies = (copiesByMedia.get(mediaId) ?? []).flatMap((copy) => {
      const source = sourceById.get(copy.librarySourceId);
      return source ? [copyResponse(copy, source)] : [];
    });
    return [
      {
        id: media.id,
        mediaType: storedMediaType(media.mediaType),
        mediaTypeOrigin: mediaOrigin(media),
        title: media.title,
        artist: media.artist,
        artistCredits: parseStoredArtistCredits(
          media.artistCredits,
          media.artist,
        ),
        albumArtist: media.albumArtist,
        albumArtistCredits: parseStoredOptionalArtistCredits(
          media.albumArtistCredits,
          media.albumArtist,
        ),
        album: media.album,
        genres: parseStoredGenres(media.genres),
        discNumber: media.discNumber,
        trackNumber: media.trackNumber,
        durationMs: media.durationMs,
        publishedAt: media.publishedAt?.toISOString() ?? null,
        metadataVersion: media.metadataVersion,
        metadataMode: media.metadataMode,
        metadataTitle: media.metadataTitle,
        metadataArtist: media.metadataArtist,
        metadataArtistCredits: parseStoredArtistCredits(
          media.metadataArtistCredits,
          media.metadataArtist ?? media.artist,
        ),
        metadataAlbumArtist: media.metadataAlbumArtist,
        metadataAlbumArtistCredits: parseStoredOptionalArtistCredits(
          media.metadataAlbumArtistCredits,
          media.metadataAlbumArtist,
        ),
        metadataAlbum: media.metadataAlbum,
        metadataGenres: parseStoredGenres(media.metadataGenres),
        metadataDiscNumber: media.metadataDiscNumber,
        metadataTrackNumber: media.metadataTrackNumber,
        metadataProviderId: media.metadataProviderId,
        metadataProviderKind: media.metadataProviderKind,
        metadataProviderName:
          media.metadataProviderName ??
          providerNames.get(media.metadataProviderId ?? "") ??
          null,
        metadataExternalTrackId: media.metadataExternalTrackId,
        metadataExternalReleaseId: media.metadataExternalReleaseId,
        metadataSourceUrl: media.metadataSourceUrl,
        metadataDetails: parseStoredMetadataDetails(media.metadataDetails),
        metadataMatchedAt: media.metadataMatchedAt?.toISOString() ?? null,
        metadataAttemptedSignature: media.metadataAttemptedSignature,
        coverId: media.coverId,
        available: Boolean(media.available),
        catalogProjectionPending: Boolean(media.catalogProjectionPending),
        manualOverrideFields: mediaFieldList(media.manualOverrides),
        usage: {
          copyCount: copies.length,
          likeCount: usage.likes.get(media.id) ?? 0,
          playCount: usage.plays.get(media.id) ?? 0,
          playlistItemCount: usage.playlistItems.get(media.id) ?? 0,
          aliasCount: usage.aliases.get(media.id) ?? 0,
        },
        copies,
        createdAt: media.createdAt.toISOString(),
        updatedAt: media.updatedAt.toISOString(),
      },
    ];
  });
}

function pageSize(value: number | undefined): 25 | 50 | 100 {
  return value && PAGE_SIZES.has(value) ? (value as 25 | 50 | 100) : 25;
}

function pageNumber(value: number | undefined): number {
  return Number.isSafeInteger(value) && value! > 0 ? value! : 1;
}

function sortField(
  value: AdminMediaSortField | undefined,
): AdminMediaSortField {
  return value && SORT_FIELDS.has(value) ? value : "updatedAt";
}

function sortColumn(field: AdminMediaSortField) {
  switch (field) {
    case "duration":
      return "durationMs" as const;
    case "published":
      return "publishedAt" as const;
    case "copyCount":
      return "updatedAt" as const;
    default:
      return field;
  }
}

export async function listAdminMedia(
  database: Database,
  input: AdminMediaListQuery,
): Promise<AdminMediaListResponse> {
  const requestedPage = pageNumber(input.page);
  const size = pageSize(input.pageSize);
  const sort = sortField(input.sort);
  const direction = input.direction === "asc" ? "asc" : "desc";
  const queryText = input.query?.trim().slice(0, 200) ?? "";
  const pattern = `%${queryText}%`;

  let query = database.orm.Media;
  if (
    input.mediaType &&
    ["music", "audiobook", "podcast"].includes(input.mediaType)
  ) {
    query = query.where({ mediaType: input.mediaType });
  }
  if (input.availability === "available") {
    query = query.where({ available: 1 });
  } else if (input.availability === "unavailable") {
    query = query.where({ available: 0 });
  }
  if (input.metadataState === "manual") {
    query = query.where({ metadataMode: "manual" });
  } else if (input.metadataState === "file") {
    query = query.where({ metadataMode: "file" });
  } else if (input.metadataState === "matched") {
    query = query.where((media) => media.metadataProviderId.isNotNull());
  } else if (input.metadataState === "unmatched") {
    query = query.where((media) => media.metadataProviderId.isNull());
  }
  if (input.providerId) {
    query = query.where({ metadataProviderId: input.providerId });
  }
  if (input.manual === "media") {
    query = query.where((media) => media.manualOverrides.neq("{}"));
  } else if (input.manual === "copy") {
    query = query.where((media) =>
      media.copies.some((copy) => copy.manualOverrides.neq("{}")),
    );
  } else if (input.manual === "none") {
    query = query
      .where((media) => media.manualOverrides.eq("{}"))
      .where((media) =>
        media.copies.every((copy) => copy.manualOverrides.eq("{}")),
      );
  }
  const publishedFrom = dateOrNull(input.publishedFrom, "Published from");
  const publishedTo = dateOrNull(input.publishedTo, "Published to");
  if (publishedFrom)
    query = query.where((media) => media.publishedAt.gte(publishedFrom));
  if (publishedTo)
    query = query.where((media) => media.publishedAt.lte(publishedTo));
  if (input.sourceId) {
    query = query.where((media) =>
      media.copies.some((copy) => copy.librarySourceId.eq(input.sourceId!)),
    );
  }
  if (input.lossless === "true") {
    query = query.where((media) =>
      media.copies.some((copy) => copy.audioLossless.eq(1)),
    );
  } else if (input.lossless === "false") {
    query = query.where((media) =>
      media.copies.some((copy) => copy.audioLossless.eq(0)),
    );
  }
  if (input.mimeType) {
    query = query.where((media) =>
      media.copies.some((copy) => copy.mimeType.eq(input.mimeType!)),
    );
  }
  if (input.minBitrate !== undefined) {
    query = query.where((media) =>
      media.copies.some((copy) => copy.audioBitrate.gte(input.minBitrate!)),
    );
  }
  if (input.maxBitrate !== undefined) {
    query = query.where((media) =>
      media.copies.some((copy) => copy.audioBitrate.lte(input.maxBitrate!)),
    );
  }
  if (input.minFileSizeBytes) {
    const minimum = fileSize(input.minFileSizeBytes);
    query = query.where((media) =>
      media.copies.some((copy) => copy.fileSizeBytes.gte(minimum)),
    );
  }
  if (input.maxFileSizeBytes) {
    const maximum = fileSize(input.maxFileSizeBytes);
    query = query.where((media) =>
      media.copies.some((copy) => copy.fileSizeBytes.lte(maximum)),
    );
  }
  const fileModifiedFrom = dateOrNull(
    input.fileModifiedFrom,
    "File modified from",
  );
  const fileModifiedTo = dateOrNull(input.fileModifiedTo, "File modified to");
  if (fileModifiedFrom) {
    query = query.where((media) =>
      media.copies.some((copy) => copy.fileModifiedAt.gte(fileModifiedFrom)),
    );
  }
  if (fileModifiedTo) {
    query = query.where((media) =>
      media.copies.some((copy) => copy.fileModifiedAt.lte(fileModifiedTo)),
    );
  }
  if (input.copyCount === "zero") {
    query = query.where((media) => media.copies.none());
  }
  switch (input.missing) {
    case "album":
      query = query.where((media) => media.album.isNull());
      break;
    case "genres":
      query = query.where((media) => media.genres.isNull());
      break;
    case "duration":
      query = query.where((media) => media.durationMs.isNull());
      break;
    case "publishedAt":
      query = query.where((media) => media.publishedAt.isNull());
      break;
    case "cover":
      query = query.where((media) => media.coverId.isNull());
      break;
    case "metadata":
      query = query.where((media) => media.metadataProviderId.isNull());
      break;
    case "copy":
      query = query.where((media) => media.copies.none());
      break;
  }
  if (queryText) {
    query = query.where((media) =>
      or(
        media.id.like(pattern),
        media.title.like(pattern),
        media.artist.like(pattern),
        media.artistCredits.like(pattern),
        media.albumArtist.like(pattern),
        media.album.like(pattern),
        media.genres.like(pattern),
        media.metadataTitle.like(pattern),
        media.metadataArtist.like(pattern),
        media.metadataAlbumArtist.like(pattern),
        media.metadataAlbum.like(pattern),
        media.metadataExternalTrackId.like(pattern),
        media.metadataExternalReleaseId.like(pattern),
        media.metadataProviderName.like(pattern),
        media.manualOverrides.like(pattern),
        media.copies.some((copy) =>
          or(
            copy.id.like(pattern),
            copy.relativePath.like(pattern),
            copy.title.like(pattern),
            copy.artist.like(pattern),
            copy.album.like(pattern),
            copy.externalId.like(pattern),
            copy.externalVersion.like(pattern),
            copy.manualOverrides.like(pattern),
          ),
        ),
      ),
    );
  }
  const needsCopyCount =
    sort === "copyCount" ||
    input.copyCount === "one" ||
    input.copyCount === "multiple";
  let pageIds: string[];
  let totalCount: number;
  let page: number;
  if (needsCopyCount) {
    const allRows = await query.all();
    const allCopies = await loadCopyRows(
      database,
      allRows.map((row) => row.id),
    );
    const countByMedia = new Map<string, number>();
    for (const copy of allCopies) {
      countByMedia.set(copy.mediaId, (countByMedia.get(copy.mediaId) ?? 0) + 1);
    }
    let filtered = allRows.filter((row) => {
      const count = countByMedia.get(row.id) ?? 0;
      if (input.copyCount === "one") return count === 1;
      if (input.copyCount === "multiple") return count > 1;
      return true;
    });
    const multiplier = direction === "asc" ? 1 : -1;
    filtered = filtered.sort((left, right) => {
      if (sort === "copyCount") {
        return (
          multiplier *
            ((countByMedia.get(left.id) ?? 0) -
              (countByMedia.get(right.id) ?? 0)) ||
          right.updatedAt.getTime() - left.updatedAt.getTime() ||
          right.id.localeCompare(left.id)
        );
      }
      return (
        multiplier *
          (left.updatedAt.getTime() - right.updatedAt.getTime() || 0) ||
        right.id.localeCompare(left.id)
      );
    });
    totalCount = filtered.length;
    const totalPages = Math.max(1, Math.ceil(totalCount / size));
    page = Math.min(requestedPage, totalPages);
    pageIds = filtered
      .slice((page - 1) * size, page * size)
      .map((row) => row.id);
  } else {
    const aggregate = await query.aggregate((aggregateQuery) => ({
      count: aggregateQuery.count(),
    }));
    totalCount = aggregate.count;
    const totalPages = Math.max(1, Math.ceil(totalCount / size));
    page = Math.min(requestedPage, totalPages);
    const rows = await query
      .orderBy(
        orderByField(query, sortColumn(sort), direction, [
          "title",
          "artist",
          "album",
          "mediaType",
          "available",
          "durationMs",
          "publishedAt",
          "createdAt",
          "updatedAt",
        ]),
      )
      .orderBy((media) => media.id[direction]())
      .offset((page - 1) * size)
      .limit(size)
      .all();
    pageIds = rows.map((row) => row.id);
  }
  const mimeRows = await database.orm.MediaCopy.select("mimeType").all();
  const mimeTypes = [...new Set(mimeRows.map((row) => row.mimeType))].sort();
  return {
    items: await adminMediaItems(database, pageIds),
    page,
    pageSize: size,
    totalCount,
    totalPages: Math.max(1, Math.ceil(totalCount / size)),
    mimeTypes,
  };
}

async function afterCatalogChange(
  database: Database,
  catalog: CatalogService,
  mediaId: string,
) {
  await catalog.reindexMedia(mediaId, "metadata");
  await catalog.flushChanges();
  return (await adminMediaItems(database, [mediaId]))[0]!;
}

export async function createAdminMedia(
  database: Database,
  catalog: CatalogService,
  input: CreateAdminMediaRequest,
): Promise<AdminMediaResponse> {
  if (!input || typeof input !== "object") {
    throw new AdminMediaError("Media details are required.");
  }
  const type = mediaTypeValue(input.mediaType);
  const title = requiredText(input.title, "Title");
  const artist = requiredText(input.artist, "Artist");
  let manualOverrides = "{}";
  const values: Record<string, unknown> = {
    mediaType: type,
    mediaTypeOrigin: "fallback",
    title,
    artist,
    artistCredits: serializeArtistCredits(
      input.artistCredits?.length ? input.artistCredits : [artist],
    ),
    albumArtist: null,
    albumArtistCredits: null,
    album: null,
    genres: null,
    discNumber: null,
    trackNumber: null,
    durationMs: null,
    publishedAt: null,
    metadataMode: "automatic",
    metadataTitle: null,
    metadataArtist: null,
    metadataArtistCredits: null,
    metadataAlbumArtist: null,
    metadataAlbumArtistCredits: null,
    metadataAlbum: null,
    metadataGenres: null,
    metadataDiscNumber: null,
    metadataTrackNumber: null,
    metadataProviderId: null,
    metadataProviderKind: null,
    metadataProviderName: null,
    metadataExternalTrackId: null,
    metadataExternalReleaseId: null,
    metadataSourceUrl: null,
    metadataDetails: null,
    metadataMatchedAt: null,
    coverId: null,
    available: 0,
    catalogProjectionPending: 1,
    metadataVersion: 0,
  };
  for (const field of ADMIN_MEDIA_FIELDS) {
    if (field === "title" || field === "artist") continue;
    if (!(field in input)) continue;
    const value = (input as unknown as Record<string, unknown>)[field];
    if (value === undefined) continue;
    if (field === "coverId") await assertCover(database, value);
    if (field === "metadataProviderId") await assertProvider(database, value);
    values[field] = coerceMediaValue(field, value);
  }
  for (const field of ["mediaType", "title", "artist"] as const) {
    manualOverrides = recordManualOverride(
      manualOverrides,
      field,
      values[field],
    );
  }
  const suppliedFields = Object.keys(input).filter(
    (field) =>
      MEDIA_FIELDS.has(field) &&
      (input as unknown as Record<string, unknown>)[field] !== undefined,
  );
  for (const field of suppliedFields) {
    manualOverrides = recordManualOverride(
      manualOverrides,
      field,
      values[field],
    );
  }
  values.manualOverrides = manualOverrides;
  const media = await database.orm.Media.create(values as never);
  return afterCatalogChange(database, catalog, media.id);
}

export async function updateAdminMedia(
  database: Database,
  catalog: CatalogService,
  mediaId: string,
  field: string,
  value: AdminMediaFieldValue,
  expectedUpdatedAt: string,
): Promise<AdminMediaResponse> {
  assertKnownMediaField(field);
  const media = await database.orm.Media.first({ id: mediaId });
  if (!media) throw new AdminMediaError("Media not found.", 404);
  checkExpectedUpdatedAt(media, expectedUpdatedAt);
  if (field === "coverId") await assertCover(database, value);
  if (field === "metadataProviderId") await assertProvider(database, value);
  const current = (media as unknown as Record<string, unknown>)[field];
  const manualOverrides = recordManualOverride(
    media.manualOverrides,
    field,
    current,
  );
  await database.orm.Media.where({ id: mediaId }).update({
    [field]: coerceMediaValue(field, value),
    manualOverrides,
  } as never);
  return afterCatalogChange(database, catalog, mediaId);
}

export async function resetAdminMediaField(
  database: Database,
  catalog: CatalogService,
  mediaId: string,
  field: string,
  expectedUpdatedAt: string,
): Promise<AdminMediaResponse> {
  assertKnownMediaField(field);
  const media = await database.orm.Media.first({ id: mediaId });
  if (!media) throw new AdminMediaError("Media not found.", 404);
  checkExpectedUpdatedAt(media, expectedUpdatedAt);
  const reset = resetManualOverride(media.manualOverrides, field);
  if (!reset.changed) {
    throw new AdminMediaError("This field is not manually overridden.", 409);
  }
  await database.orm.Media.where({ id: mediaId }).update({
    [field]: reset.value,
    manualOverrides: reset.manualOverrides,
  } as never);
  return afterCatalogChange(database, catalog, mediaId);
}

export async function deleteAdminMedia(
  database: Database,
  catalog: CatalogService,
  mediaId: string,
): Promise<void> {
  const media = await database.orm.Media.first({ id: mediaId });
  if (!media) throw new AdminMediaError("Media not found.", 404);
  await database.orm.Media.where({ id: mediaId }).delete();
  await catalog.reindexMedia(mediaId, "media-match");
  await catalog.flushChanges();
}

async function assertCopyUnique(
  database: DatabaseClient,
  librarySourceId: string,
  relativePath: string,
  externalId: string | null,
  excludingCopyId?: string,
) {
  const pathConflict = await database.orm.MediaCopy.first({
    librarySourceId,
    relativePath,
  });
  if (pathConflict && pathConflict.id !== excludingCopyId) {
    throw new AdminMediaError(
      "Another file already uses this source and location.",
      409,
      "media_copy_conflict",
    );
  }
  if (externalId) {
    const externalConflict = await database.orm.MediaCopy.first({
      librarySourceId,
      externalId,
    });
    if (externalConflict && externalConflict.id !== excludingCopyId) {
      throw new AdminMediaError(
        "Another file already uses this source and external ID.",
        409,
        "media_copy_conflict",
      );
    }
  }
}

export async function createAdminMediaCopy(
  database: Database,
  catalog: CatalogService,
  mediaId: string,
  input: CreateAdminMediaCopyRequest,
): Promise<AdminMediaResponse> {
  const media = await database.orm.Media.first({ id: mediaId });
  if (!media) throw new AdminMediaError("Media not found.", 404);
  const source = await database.orm.LibrarySource.first({
    id: requiredText(input.librarySourceId, "Library source"),
  });
  if (!source) throw new AdminMediaError("Library source not found.", 404);
  const librarySourceId = source.id;
  const relativePath = requiredText(input.relativePath, "Relative path");
  const type = mediaTypeValue(input.mediaType);
  const title = requiredText(input.title, "Title");
  const artist = requiredText(input.artist, "Artist");
  const artistCredits = input.artistCredits?.length
    ? input.artistCredits
    : [artist];
  const externalId = nullableText(input.externalId, "External ID");
  const fileModifiedAt =
    dateOrNull(input.fileModifiedAt, "File modified date") ?? new Date();
  await assertCopyUnique(database, librarySourceId, relativePath, externalId);
  if (input.coverId) await assertCover(database, input.coverId);
  const values: Record<string, unknown> = {
    mediaId,
    librarySourceId,
    relativePath,
    mediaType: type,
    mediaTypeOrigin: input.mediaTypeOrigin
      ? mediaTypeOriginValue(input.mediaTypeOrigin)
      : "fallback",
    title,
    artist,
    artistCredits: serializeArtistCredits(artistCredits),
    albumArtist: nullableText(input.albumArtist, "Album artist"),
    albumArtistCredits: optionalCreditsStorage(
      input.albumArtistCredits,
      "Album artist credits",
    ),
    album: nullableText(input.album, "Album"),
    genres: genresStorage(input.genres ?? []),
    discNumber: positiveIntegerOrNull(input.discNumber, "Disc number"),
    trackNumber: positiveIntegerOrNull(input.trackNumber, "Track number"),
    durationMs: integerOrNull(input.durationMs, "Duration"),
    publishedAt: dateOrNull(input.publishedAt, "Published date"),
    mimeType: requiredText(input.mimeType, "MIME type"),
    fileSizeBytes: fileSize(input.fileSizeBytes),
    fileModifiedAt,
    externalId,
    externalVersion: nullableText(input.externalVersion, "External version"),
    externalContainer: nullableText(
      input.externalContainer,
      "External container",
    ),
    externalCoverKey: nullableText(
      input.externalCoverKey,
      "External cover key",
    ),
    recordingIdentityKeys: serializeRecordingIdentityKeys(
      input.recordingIdentityKeys ?? [],
    ),
    audioLossless: input.audioLossless ? 1 : 0,
    audioBitrate: integerOrNull(input.audioBitrate, "Audio bitrate"),
    coverId: nullableText(input.coverId, "Cover ID"),
    available: source.removedAt ? 0 : 1,
    lastSeenScanId: null,
    metadataVersion: 0,
  };
  let manualOverrides = "{}";
  for (const field of ADMIN_MEDIA_COPY_FIELDS) {
    if (!(field in input)) continue;
    manualOverrides = recordManualOverride(
      manualOverrides,
      field,
      values[field],
    );
  }
  values.manualOverrides = manualOverrides;
  await database.transaction(async (transaction) => {
    await transaction.orm.MediaCopy.create(values as never);
    await refreshCanonicalMediaFromCopies(transaction, mediaId);
  });
  return afterCatalogChange(database, catalog, mediaId);
}

export async function updateAdminMediaCopy(
  database: Database,
  catalog: CatalogService,
  mediaId: string,
  copyId: string,
  field: string,
  value: AdminMediaFieldValue,
  expectedUpdatedAt: string,
): Promise<AdminMediaResponse> {
  assertKnownCopyField(field);
  const copy = await database.orm.MediaCopy.first({ id: copyId, mediaId });
  if (!copy) throw new AdminMediaError("File record not found.", 404);
  checkExpectedUpdatedAt(copy, expectedUpdatedAt);
  const coerced = coerceCopyValue(field, value);
  let librarySourceId = copy.librarySourceId;
  let relativePath = copy.relativePath;
  let externalId = copy.externalId;
  let sourceRemovedAt: Date | null | undefined;
  if (field === "librarySourceId") {
    const source = await database.orm.LibrarySource.first({
      id: String(coerced),
    });
    if (!source) throw new AdminMediaError("Library source not found.", 404);
    librarySourceId = source.id;
    sourceRemovedAt = source.removedAt;
  }
  if (field === "relativePath") relativePath = String(coerced);
  if (field === "externalId") externalId = coerced as string | null;
  if (field === "coverId") await assertCover(database, value);
  await assertCopyUnique(
    database,
    librarySourceId,
    relativePath,
    externalId,
    copy.id,
  );
  const current = (copy as unknown as Record<string, unknown>)[field];
  const manualOverrides = recordManualOverride(
    copy.manualOverrides,
    field,
    current,
  );
  await database.transaction(async (transaction) => {
    await transaction.orm.MediaCopy.where({ id: copy.id }).update({
      [field]: coerced,
      manualOverrides,
      ...(field === "librarySourceId"
        ? { available: sourceRemovedAt ? 0 : 1 }
        : {}),
    } as never);
    await refreshCanonicalMediaFromCopies(transaction, mediaId);
  });
  return afterCatalogChange(database, catalog, mediaId);
}

export async function resetAdminMediaCopyField(
  database: Database,
  catalog: CatalogService,
  mediaId: string,
  copyId: string,
  field: string,
  expectedUpdatedAt: string,
): Promise<AdminMediaResponse> {
  assertKnownCopyField(field);
  const copy = await database.orm.MediaCopy.first({ id: copyId, mediaId });
  if (!copy) throw new AdminMediaError("File record not found.", 404);
  checkExpectedUpdatedAt(copy, expectedUpdatedAt);
  const reset = resetManualOverride(copy.manualOverrides, field);
  if (!reset.changed) {
    throw new AdminMediaError("This field is not manually overridden.", 409);
  }
  if (field === "librarySourceId" && typeof reset.value !== "string") {
    throw new AdminMediaError("The saved source value is unavailable.", 409);
  }
  if (reset.value !== null) {
    await assertCopyUnique(
      database,
      field === "librarySourceId" ? String(reset.value) : copy.librarySourceId,
      field === "relativePath" ? String(reset.value) : copy.relativePath,
      field === "externalId" ? (reset.value as string | null) : copy.externalId,
      copy.id,
    );
  }
  await database.transaction(async (transaction) => {
    await transaction.orm.MediaCopy.where({ id: copy.id }).update({
      [field]: reset.value,
      manualOverrides: reset.manualOverrides,
    } as never);
    await refreshCanonicalMediaFromCopies(transaction, mediaId);
  });
  return afterCatalogChange(database, catalog, mediaId);
}

export async function deleteAdminMediaCopy(
  database: Database,
  catalog: CatalogService,
  mediaId: string,
  copyId: string,
): Promise<AdminMediaResponse> {
  const copy = await database.orm.MediaCopy.first({ id: copyId, mediaId });
  if (!copy) throw new AdminMediaError("File record not found.", 404);
  await database.transaction(async (transaction) => {
    await transaction.orm.MediaCopy.where({ id: copy.id }).delete();
    await refreshCanonicalMediaFromCopies(transaction, mediaId);
  });
  return afterCatalogChange(database, catalog, mediaId);
}
