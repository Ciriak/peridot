import type {
  ApplyArtistMetadataRequest,
  ApplyMediaMetadataRequest,
  ArtistMetadataCandidateListResponse,
  MetadataCandidateListResponse,
} from "@peridot/contracts";
import type { FastifyInstance } from "fastify";
import { sendError } from "./http.js";
import { message } from "./messages.js";
import {
  MetadataEnrichment,
  MetadataEnrichmentError,
} from "./metadata-enrichment.js";
import { queueMediaMatch, type TaskService } from "./tasks.js";

export async function registerMediaMetadataRoutes(
  app: FastifyInstance,
  metadataEnrichment: MetadataEnrichment,
  tasks: TaskService,
) {
  app.get<{
    Params: { id: string };
    Querystring: { query?: string };
  }>("/api/media/:id/metadata/candidates", async (request, reply) => {
    try {
      const response: MetadataCandidateListResponse = {
        items: await metadataEnrichment.candidates(
          request.params.id,
          request.query.query,
        ),
      };
      return response;
    } catch (error) {
      if (error instanceof MetadataEnrichmentError) {
        return sendError(
          reply,
          error.statusCode,
          "metadata_candidates_failed",
          error.message,
          error.messageDescriptor,
        );
      }
      throw error;
    }
  });

  app.put<{
    Params: { id: string };
    Body: ApplyMediaMetadataRequest;
  }>("/api/media/:id/metadata", async (request, reply) => {
    try {
      await metadataEnrichment.apply(request.params.id, request.body);
      await queueMediaMatch(tasks);
      return reply.code(204).send();
    } catch (error) {
      if (error instanceof MetadataEnrichmentError) {
        return sendError(
          reply,
          error.statusCode,
          "metadata_match_failed",
          error.message,
          error.messageDescriptor,
        );
      }
      throw error;
    }
  });

  app.delete<{ Params: { id: string } }>(
    "/api/media/:id/metadata",
    async (request, reply) => {
      const removed = await metadataEnrichment.revert(request.params.id);
      if (!removed) {
        return sendError(
          reply,
          404,
          "media_not_found",
          "Media not found",
          message("api.message.trackNotFound"),
        );
      }
      await queueMediaMatch(tasks);
      return reply.code(204).send();
    },
  );

  app.get<{
    Params: { id: string };
    Querystring: { query?: string };
  }>("/api/artists/:id/metadata/candidates", async (request, reply) => {
    try {
      const response: ArtistMetadataCandidateListResponse = {
        items: await metadataEnrichment.artistCandidates(
          request.params.id,
          request.query.query,
        ),
      };
      return response;
    } catch (error) {
      if (error instanceof MetadataEnrichmentError) {
        return sendError(
          reply,
          error.statusCode,
          "metadata_candidates_failed",
          error.message,
          error.messageDescriptor,
        );
      }
      throw error;
    }
  });

  app.put<{
    Params: { id: string };
    Body: ApplyArtistMetadataRequest;
  }>("/api/artists/:id/metadata", async (request, reply) => {
    try {
      await metadataEnrichment.applyArtist(request.params.id, request.body);
      return reply.code(204).send();
    } catch (error) {
      if (error instanceof MetadataEnrichmentError) {
        return sendError(
          reply,
          error.statusCode,
          "metadata_match_failed",
          error.message,
          error.messageDescriptor,
        );
      }
      throw error;
    }
  });

  app.delete<{ Params: { id: string } }>(
    "/api/artists/:id/metadata",
    async (request, reply) => {
      const removed = await metadataEnrichment.revertArtist(request.params.id);
      if (!removed) {
        return sendError(
          reply,
          404,
          "artist_not_found",
          "Artist not found",
          message("api.message.artistNotFound"),
        );
      }
      return reply.code(204).send();
    },
  );
}
