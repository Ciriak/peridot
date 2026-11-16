import type { UpdateMediaTypeRequest } from "@peridot/contracts";
import type { FastifyInstance } from "fastify";
import type { CatalogService } from "./catalog.js";
import type { Database } from "./database.js";
import { sendError } from "./http.js";
import {
  effectiveMediaType,
  mediaTypeValue,
  sourceClassificationMode,
  type DetectedMediaType,
} from "./media-classification.js";
import { mediaType } from "./media.js";
import { message } from "./messages.js";

function detectedFromTrack(track: {
  detectedMediaType: string;
  detectedMediaTypeOrigin: string;
}): DetectedMediaType {
  const origin =
    track.detectedMediaTypeOrigin === "jellyfin" ||
    track.detectedMediaTypeOrigin === "embedded"
      ? track.detectedMediaTypeOrigin
      : "fallback";
  return {
    mediaType: mediaType(track.detectedMediaType),
    origin,
  };
}

export async function registerMediaClassificationRoutes(
  app: FastifyInstance,
  database: Database,
  catalog: CatalogService,
) {
  app.put<{
    Params: { id: string };
    Body: UpdateMediaTypeRequest;
  }>("/api/admin/tracks/:id/media-type", async (request, reply) => {
    const track = await database.orm.Track.first({ id: request.params.id });
    const requested = mediaTypeValue(request.body?.mediaType);
    if (!track) {
      return sendError(
        reply,
        404,
        "track_not_found",
        "Track not found",
        message("api.message.trackNotFound"),
      );
    }
    if (!requested) {
      return sendError(
        reply,
        400,
        "invalid_media_type",
        "Choose music, audiobooks, or podcasts.",
        message("api.message.sourceMediaTypeInvalid"),
      );
    }
    await database.orm.Track.where({ id: track.id }).update({
      mediaType: requested,
      mediaTypeOrigin: "manual",
      mediaTypeOverride: requested,
    });
    await catalog.reindexTrack(track.id, "source");
    await catalog.flushChanges();
    return reply.code(204).send();
  });

  app.delete<{ Params: { id: string } }>(
    "/api/admin/tracks/:id/media-type",
    async (request, reply) => {
      const track = await database.orm.Track.first({ id: request.params.id });
      if (!track) {
        return sendError(
          reply,
          404,
          "track_not_found",
          "Track not found",
          message("api.message.trackNotFound"),
        );
      }
      const source = track.sourceId
        ? await database.orm.Source.first({ id: track.sourceId })
        : null;
      const effective = effectiveMediaType(detectedFromTrack(track), {
        override: null,
        classificationMode: sourceClassificationMode(
          source?.classificationMode,
        ),
        fixedMediaType: source?.fixedMediaType ?? null,
      });
      await database.orm.Track.where({ id: track.id }).update({
        mediaType: effective.mediaType,
        mediaTypeOrigin: effective.origin,
        mediaTypeOverride: null,
      });
      await catalog.reindexTrack(track.id, "source");
      await catalog.flushChanges();
      return reply.code(204).send();
    },
  );

  app.put<{
    Params: { id: string };
    Body: UpdateMediaTypeRequest;
  }>("/api/admin/media-collections/:id/media-type", async (request, reply) => {
    const requested = mediaTypeValue(request.body?.mediaType);
    if (!requested) {
      return sendError(
        reply,
        400,
        "invalid_media_type",
        "Choose music, audiobooks, or podcasts.",
        message("api.message.sourceMediaTypeInvalid"),
      );
    }
    const tracks = await database.orm.CatalogTrack.where({
      albumId: request.params.id,
      available: 1,
    }).all();
    if (!tracks.length) {
      return sendError(
        reply,
        404,
        "media_collection_not_found",
        "Media collection not found",
        message("api.message.mediaCollectionNotFound"),
      );
    }
    for (const track of tracks) {
      await database.orm.Track.where({ id: track.id }).update({
        mediaType: requested,
        mediaTypeOrigin: "manual",
        mediaTypeOverride: requested,
      });
    }
    for (const track of tracks) {
      await catalog.reindexTrack(track.id, "source");
    }
    await catalog.flushChanges();
    return reply.code(204).send();
  });

  app.delete<{ Params: { id: string } }>(
    "/api/admin/media-collections/:id/media-type",
    async (request, reply) => {
      const catalogTracks = await database.orm.CatalogTrack.where({
        albumId: request.params.id,
        available: 1,
      }).all();
      if (!catalogTracks.length) {
        return sendError(
          reply,
          404,
          "media_collection_not_found",
          "Media collection not found",
          message("api.message.mediaCollectionNotFound"),
        );
      }
      const sourceIds = [
        ...new Set(
          (
            await database.orm.Track.where((track) =>
              track.id.in(catalogTracks.map((item) => item.id)),
            ).all()
          ).flatMap((track) => (track.sourceId ? [track.sourceId] : [])),
        ),
      ];
      const sources = await database.orm.Source.where((source) =>
        source.id.in(sourceIds),
      ).all();
      const sourcesById = new Map(sources.map((source) => [source.id, source]));
      for (const catalogTrack of catalogTracks) {
        const track = await database.orm.Track.first({ id: catalogTrack.id });
        if (!track) continue;
        const source = track.sourceId
          ? sourcesById.get(track.sourceId)
          : undefined;
        const effective = effectiveMediaType(detectedFromTrack(track), {
          override: null,
          classificationMode: sourceClassificationMode(
            source?.classificationMode,
          ),
          fixedMediaType: source?.fixedMediaType ?? null,
        });
        await database.orm.Track.where({ id: track.id }).update({
          mediaType: effective.mediaType,
          mediaTypeOrigin: effective.origin,
          mediaTypeOverride: null,
        });
      }
      for (const track of catalogTracks) {
        await catalog.reindexTrack(track.id, "source");
      }
      await catalog.flushChanges();
      return reply.code(204).send();
    },
  );
}
