import path from "node:path";
import { createReadStream } from "node:fs";
import { realpath, stat } from "node:fs/promises";
import type { FastifyInstance, FastifyRequest } from "fastify";
import type { PlaybackTokenResponse } from "@peridot/contracts";
import type { Database } from "./database.js";
import { sendError } from "./http.js";
import { message } from "./messages.js";
import type { PlaybackTokenService } from "./playback-tokens.js";
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
) {
  app.post("/api/library/scans", async (_request, reply) => {
    const task = await queueLibraryScan(tasks);
    return reply.code(202).send(toTaskResponse(task));
  });

  app.get<{ Params: { id: string } }>(
    "/api/tracks/:id",
    async (request, reply) => {
      const track = await database.orm.Track.first({ id: request.params.id });
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
      const projected = await database.orm.CatalogTrack.select("albumId").first(
        { id: track.id },
      );
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
      const track = await database.orm.Track.select("id", "available").first({
        id: request.params.id,
      });
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
    const cover = await database.orm.TrackCover.select(
      "data",
      "mimeType",
    ).first({
      id: request.params.id,
    });
    if (!cover) {
      return sendError(
        reply,
        404,
        "cover_not_found",
        "Cover not found",
        message("api.message.coverNotFound"),
      );
    }
    const data = Buffer.from(cover.data);
    reply
      .header("Cache-Control", "private, max-age=3600")
      .header("Content-Type", cover.mimeType)
      .header("Content-Length", data.length);
    return head ? reply.send() : reply.send(data);
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
        message("api.message.trackNotFound"),
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
