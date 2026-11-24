import type { AdminMediaCopyField, AdminMediaField } from "@peridot/contracts";

export const ADMIN_MEDIA_FIELDS = [
  "mediaType",
  "title",
  "artist",
  "artistCredits",
  "albumArtist",
  "albumArtistCredits",
  "album",
  "genres",
  "discNumber",
  "trackNumber",
  "durationMs",
  "publishedAt",
  "metadataMode",
  "metadataTitle",
  "metadataArtist",
  "metadataArtistCredits",
  "metadataAlbumArtist",
  "metadataAlbumArtistCredits",
  "metadataAlbum",
  "metadataGenres",
  "metadataDiscNumber",
  "metadataTrackNumber",
  "metadataProviderId",
  "metadataProviderKind",
  "metadataProviderName",
  "metadataExternalTrackId",
  "metadataExternalReleaseId",
  "metadataSourceUrl",
  "metadataDetails",
  "metadataMatchedAt",
  "coverId",
] as const satisfies readonly AdminMediaField[];

export const ADMIN_MEDIA_COPY_FIELDS = [
  "librarySourceId",
  "relativePath",
  "mediaType",
  "mediaTypeOrigin",
  "title",
  "artist",
  "artistCredits",
  "albumArtist",
  "albumArtistCredits",
  "album",
  "genres",
  "discNumber",
  "trackNumber",
  "durationMs",
  "publishedAt",
  "mimeType",
  "fileSizeBytes",
  "fileModifiedAt",
  "externalId",
  "externalVersion",
  "externalContainer",
  "externalCoverKey",
  "recordingIdentityKeys",
  "audioLossless",
  "audioBitrate",
  "coverId",
] as const satisfies readonly AdminMediaCopyField[];

type EncodedValue =
  | null
  | boolean
  | number
  | string
  | { type: "date"; value: string }
  | { type: "bigint"; value: string };

type ManualOverrideRecord = Record<string, EncodedValue>;

function encodeValue(value: unknown): EncodedValue | undefined {
  if (value === null) return null;
  if (typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "bigint")
    return { type: "bigint", value: String(value) };
  if (value instanceof Date) {
    return Number.isNaN(value.getTime())
      ? null
      : { type: "date", value: value.toISOString() };
  }
  return undefined;
}

function decodeValue(value: EncodedValue | undefined): unknown {
  if (value === undefined || value === null) return null;
  if (typeof value !== "object") return value;
  if (value.type === "date") return new Date(value.value);
  if (value.type === "bigint") return BigInt(value.value);
  return null;
}

function parseStoredValue(value: unknown): EncodedValue | undefined {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const record = value as Record<string, unknown>;
    if (record.type === "date" && typeof record.value === "string") {
      return { type: "date", value: record.value };
    }
    if (record.type === "bigint" && typeof record.value === "string") {
      return { type: "bigint", value: record.value };
    }
  }
  return encodeValue(value);
}

export function parseManualOverrides(
  raw: string | null | undefined,
): ManualOverrideRecord {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return {};
    }
    const result: ManualOverrideRecord = {};
    for (const [field, value] of Object.entries(parsed)) {
      const encoded = parseStoredValue(value);
      if (encoded !== undefined) result[field] = encoded;
    }
    return result;
  } catch {
    return {};
  }
}

export function serializeManualOverrides(
  overrides: ManualOverrideRecord,
): string {
  return JSON.stringify(overrides);
}

export function manualOverrideFields(raw: string | null | undefined): string[] {
  return Object.keys(parseManualOverrides(raw)).sort();
}

export function recordManualOverride(
  raw: string | null | undefined,
  field: string,
  currentValue: unknown,
): string {
  const overrides = parseManualOverrides(raw);
  if (!(field in overrides)) {
    const encoded = encodeValue(currentValue);
    if (encoded !== undefined) overrides[field] = encoded;
  }
  return serializeManualOverrides(overrides);
}

export function resetManualOverride(
  raw: string | null | undefined,
  field: string,
): { manualOverrides: string; value: unknown; changed: boolean } {
  const overrides = parseManualOverrides(raw);
  const value = decodeValue(overrides[field]);
  const changed = field in overrides;
  delete overrides[field];
  return {
    manualOverrides: serializeManualOverrides(overrides),
    value,
    changed,
  };
}

export function protectedAutomaticWrite<T extends Record<string, unknown>>(
  raw: string | null | undefined,
  incoming: T,
): {
  values: Partial<T>;
  manualOverrides: string;
  protectedFields: string[];
} {
  const overrides = parseManualOverrides(raw);
  const values: Partial<T> = {};
  const protectedFields: string[] = [];
  for (const [field, value] of Object.entries(incoming)) {
    if (value === undefined) continue;
    if (field in overrides) {
      protectedFields.push(field);
      const encoded = encodeValue(value);
      if (encoded !== undefined) overrides[field] = encoded;
    } else {
      values[field as keyof T] = value as T[keyof T];
    }
  }
  return {
    values,
    manualOverrides: serializeManualOverrides(overrides),
    protectedFields,
  };
}

export function hasManualOverride(
  raw: string | null | undefined,
  field: string,
): boolean {
  return field in parseManualOverrides(raw);
}
