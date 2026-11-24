import { createReadStream } from "node:fs";
import { realpath, stat } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import type {
  LibrarySourceKind,
  PlaybackTokenResponse,
} from "@peridot/contracts";
import { ARTWORK_MIME_TYPE, type ArtworkCache } from "./artwork-cache.js";
import type { Database } from "./database.js";
import { sendError } from "./http.js";
import { canonicalMedia, canonicalMediaId } from "./media-resolver.js";
import { mediaCopiesWithSources, rankedMediaCopies } from "./media-copies.js";
import { toMediaResponse } from "./media-response.js";
import { message } from "./messages.js";
import type { PlaybackTokenService } from "./playback-tokens.js";
import {
  LibrarySourceConnectorError,
  type LibrarySourceConnectorService,
} from "./source-integrations.js";
import { queueLibraryScan, toTaskResponse, type TaskService } from "./tasks.js";

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

function sourceKind(value: string): LibrarySourceKind | null {
  return value === "path" || value === "jellyfin" ? value : null;
}

export async function registerLibraryRoutes(
  app: FastifyInstance,
  database: Database,
  tasks: TaskService,
  playbackTokens: PlaybackTokenService,
  artworkCache: ArtworkCache,
  sourceIntegrations: LibrarySourceConnectorService,
) {
  app.post("/api/library/scans", async (_request, reply) => {
    const task = await queueLibraryScan(tasks);
    return reply.code(202).send(toTaskResponse(task));
  });

  app.get<{ Params: { id: string } }>(
    "/api/media/:id",
    async (request, reply) => {
      const mediaId = await canonicalMediaId(database, request.params.id);
      const media = await database.orm.Media.first({ id: mediaId });
      if (!media) {
        return sendError(
          reply,
          404,
          "media_not_found",
          "Media not found",
          message("api.message.trackNotFound"),
        );
      }
      const [liked, projected, copies] = await Promise.all([
        database.orm.MediaLike.first({
          userId: request.authenticatedUser!.id,
          mediaId: media.id,
        }),
        database.orm.CatalogMedia.select("albumId").first({ id: media.id }),
        mediaCopiesWithSources(database, media.id),
      ]);
      const primaryCopy =
        copies.find(({ copy }) => Boolean(copy.available)) ?? null;
      return toMediaResponse(media, playbackTokens, {
        sourceKind: primaryCopy ? sourceKind(primaryCopy.source.kind) : null,
        ...(primaryCopy ? { mimeType: primaryCopy.copy.mimeType } : {}),
        liked: Boolean(liked),
        albumId: projected?.albumId ?? null,
        copies: copies.flatMap(({ copy, source }) => {
          const kind = sourceKind(source.kind);
          return kind ? [{ copy, kind }] : [];
        }),
      });
    },
  );

  app.post<{ Params: { id: string } }>(
    "/api/media/:id/playback-token",
    async (request, reply) => {
      const media = await canonicalMedia(database, request.params.id);
      if (!media?.available) {
        return sendError(
          reply,
          404,
          "media_not_found",
          "Available media not found",
          message("api.message.trackNotFound"),
        );
      }
      const issued = playbackTokens.issue(media.id);
      const response: PlaybackTokenResponse = {
        token: issued.token,
        expiresAt: issued.expiresAt.toISOString(),
      };
      return response;
    },
  );

  async function sendCover(
    request: AudioRequest,
    reply: FastifyReply,
    head: boolean,
  ) {
    const cover = await database.orm.Cover.select("hash").first({
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
    reply: FastifyReply,
    head: boolean,
  ) {
    const media = await canonicalMedia(database, request.params.id);
    if (!media?.available) {
      return sendError(
        reply,
        404,
        "media_not_found",
        "Available media not found",
        message("api.message.trackNotFound"),
      );
    }
    const ranked = await rankedMediaCopies(database, media.id);
    const markCopyUnavailable = async (copyId: string) => {
      await database.orm.MediaCopy.where({ id: copyId }).update({
        available: 0,
      });
      const remaining = await database.orm.MediaCopy.where({
        mediaId: media.id,
        available: 1,
      }).first();
      if (!remaining) {
        await database.orm.Media.where({ id: media.id }).update({
          available: 0,
          catalogProjectionPending: 1,
        });
        await database.orm.CatalogMedia.where({ id: media.id }).update({
          available: 0,
          albumId: null,
        });
      }
    };
    let invalidRange: string | null = null;
    let sourceFailure: LibrarySourceConnectorError | null = null;
    for (const { copy, source } of ranked) {
      if (source.kind === "path") {
        if (!source.path) continue;
        const candidate = path.resolve(source.path, copy.relativePath);
        if (!isContained(source.path, candidate)) continue;
        let resolved: string;
        let fileStat: Awaited<ReturnType<typeof stat>>;
        try {
          resolved = await realpath(candidate);
          fileStat = await stat(resolved);
          if (!isContained(source.path, resolved) || !fileStat.isFile()) {
            throw new Error("invalid file");
          }
        } catch {
          await markCopyUnavailable(copy.id);
          continue;
        }
        const size = fileStat.size;
        reply
          .header("Accept-Ranges", "bytes")
          .header("Content-Type", copy.mimeType);
        const rangeHeader = request.headers.range;
        if (rangeHeader) {
          const range = parseByteRange(rangeHeader, size);
          if (!range) {
            invalidRange = `bytes */${size}`;
            continue;
          }
          const length = range.end - range.start + 1;
          reply
            .code(206)
            .header(
              "Content-Range",
              `bytes ${range.start}-${range.end}/${size}`,
            )
            .header("Content-Length", length);
          if (head) return reply.send();
          const stream = createReadStream(resolved, range);
          stream.once("error", () => {
            void markCopyUnavailable(copy.id);
          });
          return reply.send(stream);
        }
        reply.header("Content-Length", size);
        if (head) return reply.send();
        const stream = createReadStream(resolved);
        stream.once("error", () => {
          void markCopyUnavailable(copy.id);
        });
        return reply.send(stream);
      }

      if (!sourceIntegrations.registry.has(source.kind) || !copy.externalId) {
        continue;
      }
      const controller = new AbortController();
      const abort = () => controller.abort();
      request.raw.once("aborted", abort);
      reply.raw.once("close", abort);
      try {
        const integration = sourceIntegrations.definition(source.kind);
        const upstream = await integration.openAudio({
          source: sourceIntegrations.sourceHandle(source),
          externalId: copy.externalId,
          container: copy.externalContainer ?? mimeExtension(copy.mimeType),
          range: request.headers.range,
          method: head ? "HEAD" : "GET",
          signal: controller.signal,
        });
        if (upstream.status === 401 || upstream.status === 403) {
          sourceFailure = new LibrarySourceConnectorError(
            "The library source rejected its saved credentials.",
            "invalid_credentials",
            502,
            message("api.message.sourceIntegrationAuthFailed"),
          );
          continue;
        }
        if (upstream.status === 404 || upstream.status === 410) {
          await markCopyUnavailable(copy.id);
          continue;
        }
        if (upstream.status === 416) {
          invalidRange =
            upstream.headers.get("content-range") ??
            request.headers.range ??
            null;
          continue;
        }
        if (!upstream.ok) continue;
        reply
          .code(upstream.status)
          .header(
            "Accept-Ranges",
            upstream.headers.get("accept-ranges") ?? "bytes",
          )
          .header(
            "Content-Type",
            upstream.headers.get("content-type") ?? copy.mimeType,
          );
        for (const header of ["content-length", "content-range"] as const) {
          const value = upstream.headers.get(header);
          if (value) {
            reply.header(
              header === "content-length" ? "Content-Length" : "Content-Range",
              value,
            );
          }
        }
        if (head || !upstream.body) return reply.send();
        const reader = (
          upstream.body as import("node:stream/web").ReadableStream<Uint8Array>
        ).getReader();
        const stream = Readable.from(
          (async function* () {
            try {
              while (true) {
                const { done, value } = await reader.read();
                if (done) return;
                yield value;
              }
            } catch (error) {
              await markCopyUnavailable(copy.id);
              throw error;
            }
          })(),
        );
        return reply.send(stream);
      } catch (error) {
        if (controller.signal.aborted) return reply;
        if (error instanceof LibrarySourceConnectorError) {
          sourceFailure = error;
          continue;
        }
        await markCopyUnavailable(copy.id);
      } finally {
        request.raw.removeListener("aborted", abort);
        reply.raw.removeListener("close", abort);
      }
    }
    if (invalidRange) {
      reply.header("Content-Range", invalidRange);
      return sendError(
        reply,
        416,
        "invalid_range",
        "Requested byte range is not satisfiable",
        message("api.message.invalidRange"),
      );
    }
    if (sourceFailure) {
      return sendError(
        reply,
        sourceFailure.statusCode,
        sourceFailure.code === "invalid_credentials"
          ? "source_integration_auth_failed"
          : "source_integration_unavailable",
        sourceFailure.message,
        sourceFailure.messageDescriptor,
      );
    }
    const remaining = await database.orm.MediaCopy.where({
      mediaId: media.id,
      available: 1,
    }).first();
    if (!remaining) {
      await database.orm.Media.where({ id: media.id }).update({
        available: 0,
        catalogProjectionPending: 1,
      });
      await database.orm.CatalogMedia.where({ id: media.id }).update({
        available: 0,
        albumId: null,
      });
    }
    return sendError(
      reply,
      404,
      "media_not_found",
      "Available media not found",
      message("api.message.trackNotFound"),
    );
  }

  app.get<{ Params: { id: string } }>(
    "/api/media/:id/audio",
    { exposeHeadRoute: false },
    async (request, reply) => sendAudio(request, reply, false),
  );
  app.head<{ Params: { id: string } }>(
    "/api/media/:id/audio",
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
