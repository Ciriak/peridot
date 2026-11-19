const MAX_RECORDING_IDENTITIES = 16;
const MAX_IDENTITY_LENGTH = 256;

function identity(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  return normalized && normalized.length <= MAX_IDENTITY_LENGTH
    ? normalized
    : null;
}

export function recordingIdentity(
  kind: "acoustid" | "isrc" | "musicbrainz",
  value: unknown,
): string | null {
  const normalized = identity(value);
  return normalized ? `${kind}:${normalized}` : null;
}

export function parseRecordingIdentityKeys(value: string | null): string[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!Array.isArray(parsed)) return [];
    return [
      ...new Set(
        parsed
          .map(identity)
          .filter((item): item is string => Boolean(item))
          .slice(0, MAX_RECORDING_IDENTITIES),
      ),
    ];
  } catch {
    return [];
  }
}

export function serializeRecordingIdentityKeys(
  values: readonly (string | null)[],
): string {
  return JSON.stringify(
    [
      ...new Set(values.filter((value): value is string => Boolean(value))),
    ].slice(0, MAX_RECORDING_IDENTITIES),
  );
}

export function localRecordingIdentityKeys(metadata: {
  musicBrainzRecordingIds: readonly string[];
  isrcs: readonly string[];
  acoustIds: readonly string[];
}): string[] {
  return [
    ...metadata.musicBrainzRecordingIds.map((value) =>
      recordingIdentity("musicbrainz", value),
    ),
    ...metadata.isrcs.map((value) => recordingIdentity("isrc", value)),
    ...metadata.acoustIds.map((value) => recordingIdentity("acoustid", value)),
  ].filter((value): value is string => Boolean(value));
}

export function providerRecordingIdentityKeys(
  providerIds: Record<string, string | null | undefined>,
): string[] {
  const byName = new Map(
    Object.entries(providerIds).map(([key, value]) => [
      key.trim().toLowerCase(),
      value,
    ]),
  );
  return [
    recordingIdentity(
      "musicbrainz",
      byName.get("musicbrainztrack") ?? byName.get("musicbrainzrecording"),
    ),
    recordingIdentity("isrc", byName.get("isrc")),
    recordingIdentity("acoustid", byName.get("acoustid")),
  ].filter((value): value is string => Boolean(value));
}
