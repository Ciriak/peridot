import type {
  LibrarySourceKind,
  MediaCopyResponse,
  MediaResponse,
} from "@peridot/contracts";
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
import type { MediaCopyRow, MediaRow } from "./prisma/models.js";
import { storedMediaType } from "./media.js";

export function effectiveMediaFields(media: MediaRow) {
  const music = storedMediaType(media.mediaType) === "music";
  return {
    title: music ? (media.metadataTitle ?? media.title) : media.title,
    artist: music ? (media.metadataArtist ?? media.artist) : media.artist,
    artists: music
      ? effectiveArtistCredits(media)
      : parseStoredArtistCredits(media.artistCredits, media.artist),
    albumArtists: music
      ? effectiveAlbumArtistCredits(media)
      : (() => {
          const creators = parseStoredOptionalArtistCredits(
            media.albumArtistCredits,
            media.albumArtist,
          );
          return creators.length ? creators : [media.artist];
        })(),
    album: music ? (media.metadataAlbum ?? media.album) : media.album,
    genres: music
      ? effectiveTrackGenres(media)
      : parseStoredGenres(media.genres),
    discNumber: music
      ? (media.metadataDiscNumber ?? media.discNumber)
      : media.discNumber,
    trackNumber: music
      ? (media.metadataTrackNumber ?? media.trackNumber)
      : media.trackNumber,
    durationMs: media.durationMs,
  };
}

export function albumReleaseYear(media: MediaRow): number | null {
  const detail = parseStoredMetadataDetails(media.metadataDetails).find(
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

export function toMediaCopyResponse(
  copy: MediaCopyRow,
  kind: LibrarySourceKind,
): MediaCopyResponse {
  return {
    id: copy.id,
    librarySourceId: copy.librarySourceId,
    librarySourceKind: kind,
    relativePath: copy.relativePath,
    mimeType: copy.mimeType,
    available: Boolean(copy.available),
    fileSizeBytes: copy.fileSizeBytes.toString(),
    audioLossless: Boolean(copy.audioLossless),
    audioBitrate: copy.audioBitrate,
  };
}

export function toMediaResponse(
  media: MediaRow,
  playbackTokens: PlaybackTokenService,
  options: {
    sourceKind?: LibrarySourceKind | null;
    liked?: boolean;
    albumId?: string | null;
    mimeType?: string;
    copies?: Array<{ copy: MediaCopyRow; kind: LibrarySourceKind }>;
  } = {},
): MediaResponse {
  const effective = effectiveMediaFields(media);
  const matched =
    storedMediaType(media.mediaType) === "music" &&
    media.metadataExternalTrackId &&
    (media.metadataProviderKind === "musicbrainz" ||
      media.metadataProviderKind === "discogs") &&
    media.metadataMatchedAt
      ? {
          providerId: media.metadataProviderId!,
          providerKind: media.metadataProviderKind as "musicbrainz" | "discogs",
          providerName: media.metadataProviderName ?? "Metadata provider",
          externalTrackId: media.metadataExternalTrackId,
          externalReleaseId: media.metadataExternalReleaseId,
          matchedAt: media.metadataMatchedAt.toISOString(),
          mode:
            media.metadataMode === "manual"
              ? ("manual" as const)
              : ("automatic" as const),
          sourceUrl:
            media.metadataSourceUrl ??
            (media.metadataProviderKind === "musicbrainz"
              ? `https://musicbrainz.org/recording/${encodeURIComponent(media.metadataExternalTrackId)}`
              : "https://www.discogs.com/"),
          genres: parseStoredGenres(media.metadataGenres),
          details: parseStoredMetadataDetails(media.metadataDetails),
        }
      : null;
  return {
    id: media.id,
    mediaType: storedMediaType(media.mediaType),
    mediaTypeOrigin:
      media.mediaTypeOrigin === "source" || media.mediaTypeOrigin === "embedded"
        ? media.mediaTypeOrigin
        : "fallback",
    sourceKind: options.sourceKind ?? null,
    title: effective.title,
    artist: effective.artist,
    artists: effective.artists,
    album: effective.album,
    genres: effective.genres,
    discNumber: effective.discNumber,
    trackNumber: effective.trackNumber,
    durationMs: effective.durationMs,
    publishedAt: media.publishedAt?.toISOString() ?? null,
    albumId: options.albumId ?? null,
    mimeType: options.mimeType ?? "application/octet-stream",
    available: Boolean(media.available),
    coverUrl: toCoverUrl(media.coverId, playbackTokens),
    metadata: matched,
    liked: options.liked ?? false,
    ...(options.copies
      ? {
          copies: options.copies.map(({ copy, kind }) =>
            toMediaCopyResponse(copy, kind),
          ),
        }
      : {}),
  };
}
