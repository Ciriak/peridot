import type {
  CreateSourceRequest,
  DirectoryListResponse,
  LogListResponse,
  ReorderSourcesRequest,
  ServerSettingsResponse,
  SourceListResponse,
} from "@peridot/contracts";
import type { FastifyInstance } from "fastify";
import type { Database } from "./database.js";
import { sendError } from "./http.js";
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
