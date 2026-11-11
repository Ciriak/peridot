import path from "node:path";
import { createReadStream } from "node:fs";
import { realpath, stat } from "node:fs/promises";
import type { FastifyInstance, FastifyRequest } from "fastify";
import type {
  PlaybackTokenResponse,
  TrackListResponse,
  TrackResponse,
} from "@peridot/contracts";
import type { Database } from "./database.js";
import { sendError } from "./http.js";
import { effectiveArtistCredits } from "./metadata-enrichment.js";
import { parseStoredMetadataDetails } from "./metadata-details.js";
import type { TrackRow } from "./prisma/models.js";
import type { PlaybackTokenService } from "./playback-tokens.js";
import { queueLibraryScan, toTaskResponse, type TaskService } from "./tasks.js";

function toTrackResponse(
  track: TrackRow,
  playbackTokens: PlaybackTokenService,
): TrackResponse {
  const artists = effectiveArtistCredits(track);
  const title = track.metadataTitle ?? track.title;
  const artist = track.metadataArtist ?? track.artist;
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
  const coverUrl = track.coverId
    ? `/api/tracks/${encodeURIComponent(track.id)}/cover?coverToken=${encodeURIComponent(playbackTokens.issueCover(track.id).token)}`
    : null;
  return {
    id: track.id,
    title,
    artist,
    artists,
    album: track.metadataAlbum ?? track.album,
    discNumber: track.metadataDiscNumber ?? track.discNumber,
    trackNumber: track.metadataTrackNumber ?? track.trackNumber,
    durationMs: track.durationMs,
    mimeType: track.mimeType,
    available: Boolean(track.available),
    coverUrl,
    metadata: matched,
  };
}

function isContained(root: string, candidate: string): boolean {
  const relative = path.relative(root, candidate);
  return (
    relative === "" ||
    (!relative.startsWith("..") && !path.isAbsolute(relative))
  );
}

interface ByteRange {
  start: number;
  end: number;
}

function parseByteRange(header: string, size: number): ByteRange | null {
  if (!header.startsWith("bytes=") || header.includes(",")) return null;
  const match = /^bytes=(\d*)-(\d*)$/.exec(header);
  if (!match) return null;
  const [, startText, endText] = match;
  if (!startText && !endText) return null;

  if (!startText) {
    const suffixLength = Number(endText);
    if (!Number.isSafeInteger(suffixLength) || suffixLength <= 0) return null;
    return { start: Math.max(size - suffixLength, 0), end: size - 1 };
  }

  const start = Number(startText);
  const requestedEnd = endText ? Number(endText) : size - 1;
  if (
    !Number.isSafeInteger(start) ||
    !Number.isSafeInteger(requestedEnd) ||
    start < 0 ||
    requestedEnd < start ||
    start >= size
  ) {
    return null;
  }
  return { start, end: Math.min(requestedEnd, size - 1) };
}

interface AudioRequest extends FastifyRequest {
  params: { id: string };
}

export async function registerLibraryRoutes(
  app: FastifyInstance,
  database: Database,
  tasks: TaskService,
  playbackTokens: PlaybackTokenService,
) {
  app.post("/api/library/scans", async (_request, reply) => {
    const task = await queueLibraryScan(tasks);
    return reply.code(202).send(toTaskResponse(task));
  });

  app.get<{ Querystring: { availability?: string } }>(
    "/api/tracks",
    async (request, reply) => {
      const availability = request.query.availability ?? "available";
      if (!new Set(["available", "unavailable", "all"]).has(availability)) {
        return sendError(
          reply,
          400,
          "invalid_availability",
          "availability must be available, unavailable, or all",
        );
      }
      const tracks = await (
        availability === "all"
          ? database.orm.Track
          : database.orm.Track.where({
              available: availability === "available" ? 1 : 0,
            })
      )
        .orderBy([
          (track) => track.artist.asc(),
          (track) => track.album.asc(),
          (track) => track.title.asc(),
        ])
        .all();
      const response: TrackListResponse = {
        items: tracks.map((track) => toTrackResponse(track, playbackTokens)),
      };
      return response;
    },
  );

  app.get<{ Params: { id: string } }>(
    "/api/tracks/:id",
    async (request, reply) => {
      const track = await database.orm.Track.first({ id: request.params.id });
      if (!track)
        return sendError(reply, 404, "track_not_found", "Track not found");
      return toTrackResponse(track, playbackTokens);
    },
  );

  app.post<{ Params: { id: string } }>(
    "/api/tracks/:id/playback-token",
    async (request, reply) => {
      const track = await database.orm.Track.select("id", "available").first({
        id: request.params.id,
      });
      if (!track || !track.available) {
        return sendError(
          reply,
          404,
          "track_not_found",
          "Available track not found",
        );
      }
      const issued = playbackTokens.issue(track.id);
      const response: PlaybackTokenResponse = {
        token: issued.token,
        expiresAt: issued.expiresAt.toISOString(),
      };
      return response;
    },
  );

  async function sendCover(
    request: AudioRequest,
    reply: Parameters<typeof sendError>[0],
    head: boolean,
  ) {
    const track = await database.orm.Track.select("coverId").first({
      id: request.params.id,
    });
    if (!track?.coverId) {
      return sendError(reply, 404, "cover_not_found", "Cover not found");
    }
    const cover = await database.orm.TrackCover.select(
      "data",
      "mimeType",
    ).first({ id: track.coverId });
    if (!cover) {
      return sendError(reply, 404, "cover_not_found", "Cover not found");
    }
    const data = Buffer.from(cover.data);
    reply
      .header("Cache-Control", "private, max-age=3600")
      .header("Content-Type", cover.mimeType)
      .header("Content-Length", data.length);
    return head ? reply.send() : reply.send(data);
  }

  app.get<{ Params: { id: string } }>(
    "/api/tracks/:id/cover",
    { exposeHeadRoute: false },
    async (request, reply) => sendCover(request, reply, false),
  );
  app.head<{ Params: { id: string } }>(
    "/api/tracks/:id/cover",
    async (request, reply) => sendCover(request, reply, true),
  );

  async function sendAudio(
    request: AudioRequest,
    reply: Parameters<typeof sendError>[0],
    head: boolean,
  ) {
    const track = await database.orm.Track.where({
      id: request.params.id,
    })
      .include("source")
      .first();
    if (!track || !track.available) {
      return sendError(
        reply,
        404,
        "track_not_found",
        "Available track not found",
      );
    }

    const libraryRoot =
      track.source?.kind === "path" && track.source.path
        ? track.source.path
        : null;
    if (!libraryRoot) {
      return sendError(
        reply,
        404,
        "track_not_found",
        "Available track not found",
      );
    }
    const candidate = path.resolve(libraryRoot, track.relativePath);
    if (!isContained(libraryRoot, candidate)) {
      return sendError(
        reply,
        404,
        "track_not_found",
        "Available track not found",
      );
    }

    let resolved: string;
    let fileStat;
    try {
      resolved = await realpath(candidate);
      fileStat = await stat(resolved);
      if (!isContained(libraryRoot, resolved) || !fileStat.isFile())
        throw new Error("invalid file");
    } catch {
      await database.orm.Track.where({ id: track.id }).update({
        available: 0,
      });
      return sendError(
        reply,
        404,
        "track_not_found",
        "Available track not found",
      );
    }

    const size = fileStat.size;
    reply
      .header("Accept-Ranges", "bytes")
      .header("Content-Type", track.mimeType);
    const rangeHeader = request.headers.range;
    if (rangeHeader) {
      const range = parseByteRange(rangeHeader, size);
      if (!range) {
        reply.header("Content-Range", `bytes */${size}`);
        return sendError(
          reply,
          416,
          "invalid_range",
          "Requested byte range is not satisfiable",
        );
      }
      const length = range.end - range.start + 1;
      reply
        .code(206)
        .header("Content-Range", `bytes ${range.start}-${range.end}/${size}`)
        .header("Content-Length", length);
      return head
        ? reply.send()
        : reply.send(createReadStream(resolved, range));
    }

    reply.header("Content-Length", size);
    return head ? reply.send() : reply.send(createReadStream(resolved));
  }

  app.get<{ Params: { id: string } }>(
    "/api/tracks/:id/audio",
    { exposeHeadRoute: false },
    async (request, reply) => sendAudio(request, reply, false),
  );
  app.head<{ Params: { id: string } }>(
    "/api/tracks/:id/audio",
    async (request, reply) => sendAudio(request, reply, true),
  );
}
