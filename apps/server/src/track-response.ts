import type { TrackResponse } from "@peridot/contracts";
import {
  effectiveAlbumArtistCredits,
  effectiveArtistCredits,
} from "./metadata-enrichment.js";
import { parseStoredMetadataDetails } from "./metadata-details.js";
import type { PlaybackTokenService } from "./playback-tokens.js";
import type { TrackRow } from "./prisma/models.js";

export function effectiveTrackFields(track: TrackRow) {
  return {
    title: track.metadataTitle ?? track.title,
    artist: track.metadataArtist ?? track.artist,
    artists: effectiveArtistCredits(track),
    albumArtists: effectiveAlbumArtistCredits(track),
    album: track.metadataAlbum ?? track.album,
    discNumber: track.metadataDiscNumber ?? track.discNumber,
    trackNumber: track.metadataTrackNumber ?? track.trackNumber,
    durationMs: track.durationMs,
  };
}

export function albumReleaseYear(track: TrackRow): number | null {
  const detail = parseStoredMetadataDetails(track.metadataDetails).find(
    (item) => item.key.trim().toLowerCase() === "year",
  );
  const value = detail?.value.trim() ?? "";
  if (!/^\d{4}$/.test(value)) return null;
  const year = Number(value);
  return year >= 1000 && year <= 9999 ? year : null;
}

export function toCoverUrl(
  coverId: string | null,
  playbackTokens: PlaybackTokenService,
): string | null {
  return coverId
    ? `/api/covers/${encodeURIComponent(coverId)}?coverToken=${encodeURIComponent(playbackTokens.issueCover(coverId).token)}`
    : null;
}

export function toTrackResponse(
  track: TrackRow,
  playbackTokens: PlaybackTokenService,
  liked = false,
  albumId: string | null = null,
): TrackResponse {
  const effective = effectiveTrackFields(track);
  const matched =
    track.metadataExternalTrackId &&
    (track.metadataProviderKind === "musicbrainz" ||
      track.metadataProviderKind === "discogs") &&
    track.metadataMatchedAt
      ? {
          providerId: track.metadataProviderId!,
          providerKind: track.metadataProviderKind as "musicbrainz" | "discogs",
          providerName: track.metadataProviderName ?? "Metadata provider",
          externalTrackId: track.metadataExternalTrackId,
          externalReleaseId: track.metadataExternalReleaseId,
          matchedAt: track.metadataMatchedAt.toISOString(),
          mode:
            track.metadataMode === "manual"
              ? ("manual" as const)
              : ("automatic" as const),
          sourceUrl:
            track.metadataSourceUrl ??
            (track.metadataProviderKind === "musicbrainz"
              ? `https://musicbrainz.org/recording/${encodeURIComponent(track.metadataExternalTrackId)}`
              : "https://www.discogs.com/"),
          details: parseStoredMetadataDetails(track.metadataDetails),
        }
      : null;
  const coverUrl = toCoverUrl(track.coverId, playbackTokens);
  return {
    id: track.id,
    title: effective.title,
    artist: effective.artist,
    artists: effective.artists,
    album: effective.album,
    discNumber: effective.discNumber,
    trackNumber: effective.trackNumber,
    durationMs: effective.durationMs,
    albumId,
    mimeType: track.mimeType,
    available: Boolean(track.available),
    coverUrl,
    metadata: matched,
    liked,
  };
}
