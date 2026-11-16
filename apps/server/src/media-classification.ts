import type {
  MediaType,
  SourceClassificationMode,
  TrackMediaTypeOrigin,
} from "@peridot/contracts";

export type DetectedMediaTypeOrigin = Extract<
  TrackMediaTypeOrigin,
  "jellyfin" | "embedded" | "fallback"
>;

export interface MediaDetectionInput {
  extension?: string | null;
  podcast?: boolean;
  podcastId?: string | null;
  podcastUrl?: string | null;
  releaseTypes?: readonly string[];
  iTunesMediaType?: number;
  jellyfinItemType?: string | null;
  jellyfinLibraryCollectionType?: string | null;
  jellyfinTags?: readonly string[];
  jellyfinProviderIds?: Readonly<Record<string, string | null>>;
}

export interface DetectedMediaType {
  mediaType: MediaType;
  origin: DetectedMediaTypeOrigin;
}

export interface EffectiveMediaType {
  mediaType: MediaType;
  origin: TrackMediaTypeOrigin;
}

function normalized(value: string | null | undefined): string {
  return (value ?? "")
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .trim()
    .toLowerCase();
}

function hasPodcastEvidence(input: MediaDetectionInput): boolean {
  return (
    input.podcast === true ||
    Boolean(input.podcastId?.trim()) ||
    Boolean(input.podcastUrl?.trim()) ||
    (input.jellyfinTags ?? []).some((tag) => normalized(tag) === "podcast") ||
    Object.keys(input.jellyfinProviderIds ?? {}).some((key) =>
      ["podcast", "podcastguid", "podcastindex"].includes(normalized(key)),
    )
  );
}

function hasAudiobookEvidence(input: MediaDetectionInput): boolean {
  const extension = normalized(input.extension).replace(/^\./u, "");
  return (
    extension === "m4b" ||
    input.iTunesMediaType === 2 ||
    (input.releaseTypes ?? []).some(
      (value) => normalized(value) === "audiobook",
    ) ||
    normalized(input.jellyfinItemType) === "audiobook" ||
    normalized(input.jellyfinLibraryCollectionType) === "books"
  );
}

export function detectMediaType(input: MediaDetectionInput): DetectedMediaType {
  if (hasPodcastEvidence(input)) {
    return {
      mediaType: "podcast",
      origin:
        input.jellyfinTags?.length ||
        Object.keys(input.jellyfinProviderIds ?? {}).length
          ? "jellyfin"
          : "embedded",
    };
  }
  if (hasAudiobookEvidence(input)) {
    return {
      mediaType: "audiobook",
      origin:
        input.jellyfinItemType || input.jellyfinLibraryCollectionType
          ? "jellyfin"
          : "embedded",
    };
  }
  return { mediaType: "music", origin: "fallback" };
}

export function effectiveMediaType(
  detected: DetectedMediaType,
  options: {
    override?: string | null;
    classificationMode?: string | null;
    fixedMediaType?: string | null;
  },
): EffectiveMediaType {
  const override = mediaTypeValue(options.override);
  if (override) return { mediaType: override, origin: "manual" };
  if (options.classificationMode === "fixed") {
    const fixed = mediaTypeValue(options.fixedMediaType);
    if (fixed) return { mediaType: fixed, origin: "source" };
  }
  return detected;
}

export function mediaTypeValue(value: unknown): MediaType | null {
  return value === "music" || value === "audiobook" || value === "podcast"
    ? value
    : null;
}

export function sourceClassificationMode(
  value: unknown,
  fallback: SourceClassificationMode = "auto",
): SourceClassificationMode {
  return value === "fixed" || value === "auto" ? value : fallback;
}
