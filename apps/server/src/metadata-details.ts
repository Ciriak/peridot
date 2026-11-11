import type { TrackMetadataDetail } from "@peridot/contracts";

const MAX_DETAILS = 12;
const MAX_KEY_LENGTH = 64;
const MAX_LABEL_LENGTH = 80;
const MAX_VALUE_LENGTH = 300;

function text(value: unknown, maximum: number): string {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, maximum);
}

export function normalizeMetadataDetails(
  value: unknown,
): TrackMetadataDetail[] {
  if (!Array.isArray(value)) return [];
  const details: TrackMetadataDetail[] = [];
  const keys = new Set<string>();
  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const record = item as Record<string, unknown>;
    const key = text(record.key, MAX_KEY_LENGTH);
    const label = text(record.label, MAX_LABEL_LENGTH);
    const detailValue = text(record.value, MAX_VALUE_LENGTH);
    if (!key || !label || !detailValue || keys.has(key)) continue;
    keys.add(key);
    details.push({ key, label, value: detailValue });
    if (details.length === MAX_DETAILS) break;
  }
  return details;
}

export function serializeMetadataDetails(value: unknown): string | null {
  const details = normalizeMetadataDetails(value);
  return details.length ? JSON.stringify(details) : null;
}

export function parseStoredMetadataDetails(
  value: string | null,
): TrackMetadataDetail[] {
  if (!value) return [];
  try {
    return normalizeMetadataDetails(JSON.parse(value) as unknown);
  } catch {
    return [];
  }
}
