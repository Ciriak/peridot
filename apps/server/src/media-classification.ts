import type { MediaType, TrackMediaTypeOrigin } from "@peridot/contracts";

export interface MediaDetectionInput {
  extension?: string | null;
  podcast?: boolean;
  podcastId?: string | null;
  podcastUrl?: string | null;
  releaseTypes?: readonly string[];
  iTunesMediaType?: number;
}

export interface DetectedMediaType {
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
    Boolean(input.podcastUrl?.trim())
  );
}

function hasAudiobookEvidence(input: MediaDetectionInput): boolean {
  const extension = normalized(input.extension).replace(/^\./u, "");
  return (
    extension === "m4b" ||
    input.iTunesMediaType === 2 ||
    (input.releaseTypes ?? []).some(
      (value) => normalized(value) === "audiobook",
    )
  );
}

export function detectMediaType(input: MediaDetectionInput): DetectedMediaType {
  if (hasPodcastEvidence(input)) {
    return {
      mediaType: "podcast",
      origin: "embedded",
    };
  }
  if (hasAudiobookEvidence(input)) {
    return {
      mediaType: "audiobook",
      origin: "embedded",
    };
  }
  return { mediaType: "music", origin: "fallback" };
}

export function mediaTypeValue(value: unknown): MediaType | null {
  return value === "music" || value === "audiobook" || value === "podcast"
    ? value
    : null;
}
