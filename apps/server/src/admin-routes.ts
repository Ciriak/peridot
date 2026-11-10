import type {
  CreateMetadataProviderRequest,
  CreateSourceRequest,
  DirectoryListResponse,
  LogListResponse,
  MetadataProviderListResponse,
  ReorderMetadataProvidersRequest,
  ReorderSourcesRequest,
  ResetTrackMetadataResponse,
  ServerSettingsResponse,
  SourceListResponse,
} from "@peridot/contracts";
import type { FastifyInstance } from "fastify";
import type { Database } from "./database.js";
import { sendError } from "./http.js";
import type { LibraryScanner } from "./library-scanner.js";
import { toScanResponse } from "./library-routes.js";
import type { MetadataEnrichment } from "./metadata-enrichment.js";
import {
  createMetadataProvider,
  deleteMetadataProvider,
  listMetadataProviders,
  MetadataProviderError,
  reorderMetadataProviders,
} from "./metadata-providers.js";
import type { ServerLogBuffer } from "./server-log.js";
import {
  createSource,
  deleteSource,
  listDirectoryEntries,
  listSources,
  reorderSources,
  searchDirectoryEntries,
  SourceError,
} from "./sources.js";

export async function registerAdminRoutes(
  app: FastifyInstance,
  database: Database,
  logBuffer: ServerLogBuffer,
  scanner: LibraryScanner,
  metadataEnrichment: MetadataEnrichment,
) {
  await app.register(async (admin) => {
    admin.addHook("onRequest", async (request, reply) => {
      if (request.authenticatedUser?.role !== "admin") {
        return sendError(
          reply,
          403,
          "admin_required",
          "Administrator access is required",
        );
      }
    });

    admin.get(
      "/api/admin/server",
      async (): Promise<ServerSettingsResponse> => {
        const [trackCount, availableTrackCount] = await Promise.all([
          database.track.count(),
          database.track.count({ where: { available: true } }),
        ]);
        return { trackCount, availableTrackCount };
      },
    );

    admin.get("/api/admin/sources", async (): Promise<SourceListResponse> => ({
      items: await listSources(database),
    }));

    admin.get<{ Querystring: { after?: string } }>(
      "/api/admin/logs",
      async (request): Promise<LogListResponse> => {
        const after = Number(request.query.after ?? 0);
        return {
          items: logBuffer.list(
            Number.isFinite(after) && after > 0 ? after : 0,
          ),
        };
      },
    );

    admin.post<{ Body: CreateSourceRequest }>(
      "/api/admin/sources",
      async (request, reply) => {
        try {
          const source = await createSource(database, request.body);
          return reply.code(201).send(source);
        } catch (error) {
          if (error instanceof SourceError) {
            return sendError(reply, 400, "invalid_source", error.message);
          }
          throw error;
        }
      },
    );

    admin.put<{ Body: ReorderSourcesRequest }>(
      "/api/admin/sources/order",
      async (request, reply) => {
        try {
          return {
            items: await reorderSources(database, request.body?.ids),
          };
        } catch (error) {
          if (error instanceof SourceError) {
            return sendError(reply, 400, "invalid_source", error.message);
          }
          throw error;
        }
      },
    );

    admin.delete<{ Params: { id: string } }>(
      "/api/admin/sources/:id",
      async (request, reply) => {
        const removed = await deleteSource(database, request.params.id);
        if (!removed) {
          return sendError(reply, 404, "source_not_found", "Source not found");
        }
        return reply.code(204).send();
      },
    );

    admin.post<{ Params: { id: string } }>(
      "/api/admin/sources/:id/scans",
      async (request, reply) => {
        const source = await database.source.findUnique({
          where: { id: request.params.id },
        });
        if (!source) {
          return sendError(reply, 404, "source_not_found", "Source not found");
        }
        if (source.kind !== "path" || !source.path) {
          return sendError(
            reply,
            400,
            "source_not_rescanable",
            "Only local folder sources can be rescanned.",
          );
        }
        const scan = await scanner.queueScan({
          id: source.id,
          name: source.name,
          path: source.path,
        });
        if (!scan) {
          return sendError(
            reply,
            409,
            "scan_in_progress",
            "A library scan is already active",
          );
        }
        return reply.code(202).send(toScanResponse(scan));
      },
    );

    admin.get(
      "/api/admin/metadata-providers",
      async (): Promise<MetadataProviderListResponse> => ({
        items: await listMetadataProviders(database),
      }),
    );

    admin.post<{ Body: CreateMetadataProviderRequest }>(
      "/api/admin/metadata-providers",
      async (request, reply) => {
        try {
          return reply
            .code(201)
            .send(await createMetadataProvider(database, request.body));
        } catch (error) {
          if (error instanceof MetadataProviderError) {
            return sendError(
              reply,
              400,
              "invalid_metadata_provider",
              error.message,
            );
          }
          throw error;
        }
      },
    );

    admin.put<{ Body: ReorderMetadataProvidersRequest }>(
      "/api/admin/metadata-providers/order",
      async (request, reply) => {
        try {
          return {
            items: await reorderMetadataProviders(database, request.body?.ids),
          };
        } catch (error) {
          if (error instanceof MetadataProviderError) {
            return sendError(
              reply,
              400,
              "invalid_metadata_provider",
              error.message,
            );
          }
          throw error;
        }
      },
    );

    admin.delete<{ Params: { id: string } }>(
      "/api/admin/metadata-providers/:id",
      async (request, reply) => {
        const removed = await deleteMetadataProvider(
          database,
          request.params.id,
        );
        if (!removed) {
          return sendError(
            reply,
            404,
            "metadata_provider_not_found",
            "Metadata provider not found",
          );
        }
        return reply.code(204).send();
      },
    );

    admin.post("/api/admin/metadata/reset", async (_request, reply) => {
      if (scanner.hasActiveOperation()) {
        return sendError(
          reply,
          409,
          "metadata_reset_in_progress",
          "Wait for the active library operation to finish.",
        );
      }
      const response: ResetTrackMetadataResponse = {
        resetCount: await metadataEnrichment.resetAll(),
      };
      return response;
    });

    admin.post("/api/admin/metadata/refresh", async (_request, reply) => {
      const scan = await scanner.queueMetadataRefresh();
      if (!scan) {
        return sendError(
          reply,
          409,
          "metadata_refresh_in_progress",
          "A library operation is already active.",
        );
      }
      return reply.code(202).send(toScanResponse(scan));
    });

    admin.get<{ Querystring: { path?: string } }>(
      "/api/admin/filesystem/tree",
      async (request): Promise<DirectoryListResponse> => ({
        items: await listDirectoryEntries(request.query.path ?? ""),
      }),
    );

    admin.get<{ Querystring: { query?: string; path?: string } }>(
      "/api/admin/filesystem/search",
      async (request, reply) => {
        const query = request.query.query?.trim() ?? "";
        if (!query || query.length > 200) {
          return sendError(
            reply,
            400,
            "invalid_search",
            "Enter a search term up to 200 characters.",
          );
        }
        const controller = new AbortController();
        const abortSearch = () => controller.abort();
        reply.raw.once("close", abortSearch);
        try {
          return await searchDirectoryEntries(
            request.query.path,
            query,
            controller.signal,
          );
        } finally {
          reply.raw.off("close", abortSearch);
        }
      },
    );
  });
}
