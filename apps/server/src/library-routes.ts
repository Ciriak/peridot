import path from "node:path";
import { createReadStream } from "node:fs";
import { realpath, stat } from "node:fs/promises";
import type { FastifyInstance, FastifyRequest } from "fastify";
import type {
  LibraryScanResponse,
  LibraryScanStatus,
  TrackListResponse,
  TrackResponse,
} from "@peridot/contracts";
import type { LibraryScan, Track } from "./generated/prisma/client.js";
import type { Database } from "./database.js";
import { sendError } from "./http.js";
import type { LibraryScanner } from "./library-scanner.js";

function toTrackResponse(track: Track): TrackResponse {
  return {
    id: track.id,
    title: track.title,
    artist: track.artist,
    album: track.album,
    durationMs: track.durationMs,
    mimeType: track.mimeType,
    available: track.available,
  };
}

function toScanResponse(scan: LibraryScan): LibraryScanResponse {
  return {
    id: scan.id,
    status: scan.status as LibraryScanStatus,
    discoveredCount: scan.discoveredCount,
    createdCount: scan.createdCount,
    updatedCount: scan.updatedCount,
    unchangedCount: scan.unchangedCount,
    errorCount: scan.errorCount,
    unavailableCount: scan.unavailableCount,
    failureSummary: scan.failureSummary,
    createdAt: scan.createdAt.toISOString(),
    startedAt: scan.startedAt?.toISOString() ?? null,
    completedAt: scan.completedAt?.toISOString() ?? null,
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
  scanner: LibraryScanner,
) {
  app.post("/api/library/scans", async (_request, reply) => {
    const scan = await scanner.queueScan();
    if (!scan) {
      return sendError(
        reply,
        409,
        "scan_in_progress",
        "A library scan is already active",
      );
    }
    return reply.code(202).send(toScanResponse(scan));
  });

  app.get<{ Params: { id: string } }>(
    "/api/library/scans/:id",
    async (request, reply) => {
      const scan = await database.libraryScan.findUnique({
        where: { id: request.params.id },
      });
      if (!scan)
        return sendError(
          reply,
          404,
          "scan_not_found",
          "Library scan not found",
        );
      return toScanResponse(scan);
    },
  );

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
      const tracks = await database.track.findMany({
        ...(availability === "all"
          ? {}
          : { where: { available: availability === "available" } }),
        orderBy: [{ artist: "asc" }, { album: "asc" }, { title: "asc" }],
      });
      const response: TrackListResponse = {
        items: tracks.map(toTrackResponse),
      };
      return response;
    },
  );

  app.get<{ Params: { id: string } }>(
    "/api/tracks/:id",
    async (request, reply) => {
      const track = await database.track.findUnique({
        where: { id: request.params.id },
      });
      if (!track)
        return sendError(reply, 404, "track_not_found", "Track not found");
      return toTrackResponse(track);
    },
  );

  async function sendAudio(
    request: AudioRequest,
    reply: Parameters<typeof sendError>[0],
    head: boolean,
  ) {
    const track = await database.track.findUnique({
      where: { id: request.params.id },
      include: { source: true },
    });
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
      await database.track.update({
        where: { id: track.id },
        data: { available: false },
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
