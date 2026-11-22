import path from "node:path";
import { createReadStream } from "node:fs";
import { realpath, stat } from "node:fs/promises";
import { Readable } from "node:stream";
import type { FastifyInstance, FastifyRequest } from "fastify";
import type { PlaybackTokenResponse } from "@peridot/contracts";
import { ARTWORK_MIME_TYPE, type ArtworkCache } from "./artwork-cache.js";
import type { Database } from "./database.js";
import { canonicalTrack } from "./duplicate-resolver.js";
import { sendError } from "./http.js";
import { message } from "./messages.js";
import type { PlaybackTokenService } from "./playback-tokens.js";
import {
  SourceIntegrationError,
  type SourceIntegrationService,
} from "./source-integrations.js";
import { queueLibraryScan, toTaskResponse, type TaskService } from "./tasks.js";
import { toTrackResponse } from "./track-response.js";

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
  artworkCache: ArtworkCache,
  sourceIntegrations: SourceIntegrationService,
) {
  app.post("/api/library/scans", async (_request, reply) => {
    const task = await queueLibraryScan(tasks);
    return reply.code(202).send(toTaskResponse(task));
  });

  app.get<{ Params: { id: string } }>(
    "/api/tracks/:id",
    async (request, reply) => {
      const canonical = await canonicalTrack(database, request.params.id);
      const track = canonical
        ? await database.orm.Track.where({ id: canonical.id })
            .include("source", (source) => source.select("kind"))
            .first()
        : null;
      if (!track)
        return sendError(
          reply,
          404,
          "track_not_found",
          "Track not found",
          message("api.message.trackNotFound"),
        );
      const liked = Boolean(
        await database.orm.TrackLike.first({
          userId: request.authenticatedUser!.id,
          trackId: track.id,
        }),
      );
      const projected = await database.orm.CatalogTrack.select("albumId").first({
        id: track.id,
      });
      return toTrackResponse(
        track,
        playbackTokens,
        liked,
        projected?.albumId ?? null,
      );
    },
  );

  app.post<{ Params: { id: string } }>(
    "/api/tracks/:id/playback-token",
    async (request, reply) => {
      const track = await canonicalTrack(database, request.params.id);
      if (!track || !track.available) {
        return sendError(
          reply,
          404,
          "track_not_found",
          "Available track not found",
          message("api.message.trackNotFound"),
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
    const cover = await database.orm.TrackCover.select("hash").first({
      id: request.params.id,
    });
    const file = cover ? await artworkCache.read(cover.hash) : null;
    if (!file) {
      return sendError(
        reply,
        404,
        "cover_not_found",
        "Cover not found",
        message("api.message.coverNotFound"),
      );
    }
    reply
      .header("Cache-Control", "private, max-age=3600")
      .header("Content-Type", ARTWORK_MIME_TYPE)
      .header("Content-Length", file.size);
    return head ? reply.send() : reply.send(createReadStream(file.path));
  }

  app.get<{ Params: { id: string } }>(
    "/api/covers/:id",
    { exposeHeadRoute: false },
    async (request, reply) => sendCover(request, reply, false),
  );
  app.head<{ Params: { id: string } }>(
    "/api/covers/:id",
    async (request, reply) => sendCover(request, reply, true),
  );

  async function sendAudio(
    request: AudioRequest,
    reply: Parameters<typeof sendError>[0],
    head: boolean,
  ) {
    const canonicalSourceTrack = await canonicalTrack(
      database,
      request.params.id,
    );
    const track = canonicalSourceTrack
      ? await database.orm.Track.where({ id: canonicalSourceTrack.id })
          .include("source")
          .first()
      : null;
    if (!track || !track.available) {
      return sendError(
        reply,
        404,
        "track_not_found",
        "Available track not found",
        message("api.message.trackNotFound"),
      );
    }

    const libraryRoot =
      track.source?.kind === "path" && track.source.path
        ? track.source.path
        : null;
    if (!libraryRoot) {
      if (
        track.source &&
        sourceIntegrations.registry.has(track.source.kind) &&
        track.externalId
      ) {
        const controller = new AbortController();
        const abort = () => controller.abort();
        request.raw.once("aborted", abort);
        reply.raw.once("close", abort);
        try {
          const integration = sourceIntegrations.definition(track.source.kind);
          const upstream = await integration.openAudio({
            source: sourceIntegrations.sourceHandle(track.source),
            externalId: track.externalId,
            container: track.externalContainer ?? mimeExtension(track.mimeType),
            range: request.headers.range,
            method: head ? "HEAD" : "GET",
            signal: controller.signal,
          });
          if (upstream.status === 401 || upstream.status === 403) {
            return sendError(
              reply,
              502,
              "source_integration_auth_failed",
              "The source integration rejected its saved credentials.",
              message("api.message.sourceIntegrationAuthFailed"),
            );
          }
          if (upstream.status === 404 || upstream.status === 410) {
            await database.orm.Track.where({ id: track.id }).update({
              available: 0,
            });
            return sendError(
              reply,
              404,
              "track_not_found",
              "Available track not found",
              message("api.message.trackNotFound"),
            );
          }
          if (upstream.status === 416) {
            const contentRange = upstream.headers.get("content-range");
            if (contentRange) reply.header("Content-Range", contentRange);
            return sendError(
              reply,
              416,
              "invalid_range",
              "Requested byte range is not satisfiable",
              message("api.message.invalidRange"),
            );
          }
          if (!upstream.ok) {
            return sendError(
              reply,
              502,
              "source_integration_unavailable",
              "The source integration could not provide this track.",
              message("api.message.sourceIntegrationUnavailable"),
            );
          }

          reply
            .code(upstream.status)
            .header(
              "Accept-Ranges",
              upstream.headers.get("accept-ranges") ?? "bytes",
            )
            .header(
              "Content-Type",
              upstream.headers.get("content-type") ?? track.mimeType,
            );
          for (const header of ["content-length", "content-range"] as const) {
            const value = upstream.headers.get(header);
            if (value) {
              reply.header(
                header === "content-length"
                  ? "Content-Length"
                  : "Content-Range",
                value,
              );
            }
          }
          if (head || !upstream.body) return reply.send();
          return reply.send(
            Readable.fromWeb(
              upstream.body as import("node:stream/web").ReadableStream,
            ),
          );
        } catch (error) {
          if (controller.signal.aborted) return reply;
          if (error instanceof SourceIntegrationError) {
            return sendError(
              reply,
              error.statusCode,
              error.code === "invalid_credentials"
                ? "source_integration_auth_failed"
                : "source_integration_unavailable",
              error.message,
              error.messageDescriptor,
            );
          }
          throw error;
        }
      }
      return sendError(
        reply,
        404,
        "track_not_found",
        "Available track not found",
        message("api.message.trackNotFound"),
      );
    }
    const candidate = path.resolve(libraryRoot, track.relativePath);
    if (!isContained(libraryRoot, candidate)) {
      return sendError(
        reply,
        404,
        "track_not_found",
        "Available track not found",
        message("api.message.trackNotFound"),
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
        message("api.message.trackNotFound"),
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
          message("api.message.invalidRange"),
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

function mimeExtension(mimeType: string): string {
  return (
    {
      "audio/aac": "aac",
      "audio/flac": "flac",
      "audio/mp4": "m4a",
      "audio/mpeg": "mp3",
      "audio/ogg": "ogg",
      "audio/wav": "wav",
    }[mimeType] ?? "mp3"
  );
}
