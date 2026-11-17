import type { TrackResponse } from "@peridot/contracts";
import {
  effectiveAlbumArtistCredits,
  effectiveArtistCredits,
} from "./metadata-enrichment.js";
import {
  parseStoredArtistCredits,
  parseStoredOptionalArtistCredits,
} from "./artist-credits.js";
import { parseStoredMetadataDetails } from "./metadata-details.js";
import { effectiveTrackGenres, parseStoredGenres } from "./genres.js";
import type { PlaybackTokenService } from "./playback-tokens.js";
import type { TrackRow } from "./prisma/models.js";
import { storedMediaType } from "./media.js";

export function effectiveTrackFields(track: TrackRow) {
  const music = storedMediaType(track.mediaType) === "music";
  return {
    title: music ? (track.metadataTitle ?? track.title) : track.title,
    artist: music ? (track.metadataArtist ?? track.artist) : track.artist,
    artists: music
      ? effectiveArtistCredits(track)
      : parseStoredArtistCredits(track.artistCredits, track.artist),
    albumArtists: music
      ? effectiveAlbumArtistCredits(track)
      : (() => {
          const creators = parseStoredOptionalArtistCredits(
            track.albumArtistCredits,
            track.albumArtist,
          );
          return creators.length ? creators : [track.artist];
        })(),
    album: music ? (track.metadataAlbum ?? track.album) : track.album,
    genres: music
      ? effectiveTrackGenres(track)
      : parseStoredGenres(track.genres),
    discNumber: music
      ? (track.metadataDiscNumber ?? track.discNumber)
      : track.discNumber,
    trackNumber: music
      ? (track.metadataTrackNumber ?? track.trackNumber)
      : track.trackNumber,
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
    storedMediaType(track.mediaType) === "music" &&
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
          genres: parseStoredGenres(track.metadataGenres),
          details: parseStoredMetadataDetails(track.metadataDetails),
        }
      : null;
  const coverUrl = toCoverUrl(track.coverId, playbackTokens);
  return {
    id: track.id,
    mediaType: storedMediaType(track.mediaType),
    mediaTypeOrigin:
      track.mediaTypeOrigin === "source" || track.mediaTypeOrigin === "embedded"
        ? track.mediaTypeOrigin
        : "fallback",
    title: effective.title,
    artist: effective.artist,
    artists: effective.artists,
    album: effective.album,
    genres: effective.genres,
    discNumber: effective.discNumber,
    trackNumber: effective.trackNumber,
    durationMs: effective.durationMs,
    publishedAt: track.publishedAt?.toISOString() ?? null,
    albumId,
    mimeType: track.mimeType,
    available: Boolean(track.available),
    coverUrl,
    metadata: matched,
    liked,
  };
}
