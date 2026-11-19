import path from "node:path";
import type {
  CreateUserRequest,
  CreateMetadataProviderRequest,
  CreateSourceRequest,
  CreateSourceResponse,
  DirectoryListResponse,
  DiscoverSourceIntegrationRequest,
  LogListResponse,
  MetadataProviderDefinitionListResponse,
  MetadataProviderListResponse,
  ReorderMetadataProvidersRequest,
  ReorderSourcesRequest,
  ResetMetadataResponse,
  RestartServerResponse,
  ServerSettingsResponse,
  SourceListResponse,
  UpdateMetadataProviderRequest,
  UpdateServerSettingsRequest,
  UpdateUserRequest,
  UserListResponse,
  UpdateStatusResponse,
  SourceIntegrationOptionListResponse,
} from "@peridot/contracts";
import type { FastifyInstance } from "fastify";
import type { CatalogService } from "./catalog.js";
import type { CredentialStore } from "./credential-store.js";
import type { Database } from "./database.js";
import { sendError } from "./http.js";
import { message } from "./messages.js";
import type { MetadataEnrichment } from "./metadata-enrichment.js";
import {
  createMetadataProvider,
  listMetadataProviders,
  MetadataProviderError,
  reorderMetadataProviders,
  updateMetadataProvider,
} from "./metadata-providers.js";
import type { MetadataResolverRegistry } from "./metadata-resolver.js";
import type { ServerLogBuffer } from "./server-log.js";
import {
  readFileLoggingSettings,
  readScanWorkerSettings,
  readSourceRefreshSettings,
  ServerSettingsError,
  updateServerSettings,
  validateFileLoggingSettings,
} from "./server-settings.js";
import type { SourceRefreshScheduler } from "./source-refresh-scheduler.js";
import { UpdateError, type UpdateService } from "./updates.js";
import type { SourceIntegrationService } from "./source-integrations.js";
import {
  createSource,
  discoverIntegrationSources,
  listDirectoryEntries,
  listSources,
  reorderSources,
  searchDirectoryEntries,
  SourceError,
} from "./sources.js";
import {
  queueDuplicateDetection,
  queueLibraryScan,
  queueMetadataFetch,
  toTaskResponse,
  type TaskService,
} from "./tasks.js";
import {
  createManagedUser,
  deleteManagedUser,
  listManagedUsers,
  updateManagedUser,
  UserManagementError,
} from "./users.js";
import { pruneReferencedArtwork, type ArtworkCache } from "./artwork-cache.js";

export async function registerAdminRoutes(
  app: FastifyInstance,
  database: Database,
  logBuffer: ServerLogBuffer,
  tasks: TaskService,
  metadataEnrichment: MetadataEnrichment,
  metadataRegistry: MetadataResolverRegistry,
  metadataCredentials: CredentialStore,
  onSessionsRevoked?: (sessionIds: string[]) => void,
  restartServer?: () => void,
  sourceIntegrations?: SourceIntegrationService,
  catalog?: CatalogService,
  sourceRefreshScheduler?: SourceRefreshScheduler,
  updates?: UpdateService,
  artworkCache?: ArtworkCache,
) {
  await app.register(async (admin) => {
    admin.addHook("onRequest", async (request, reply) => {
      if (request.authenticatedUser?.role !== "admin") {
        return sendError(
          reply,
          403,
          "admin_required",
          "Administrator access is required",
          message("api.message.adminRequired"),
        );
      }
    });

    admin.get(
      "/api/admin/server",
      async (): Promise<ServerSettingsResponse> => {
        const [trackCount, availableTrackCount] = await Promise.all([
          database.orm.Track.aggregate((aggregate) => ({
            count: aggregate.count(),
          })),
          database.orm.Track.where({ available: 1 }).aggregate((aggregate) => ({
            count: aggregate.count(),
          })),
        ]);
        return {
          trackCount: trackCount.count,
          availableTrackCount: availableTrackCount.count,
          scanning: await readScanWorkerSettings(database),
          sourceRefresh: sourceRefreshScheduler?.status() ?? {
            enabled: false,
            cron: "",
            nextRunAt: null,
          },
          fileLogging: {
            ...(await readFileLoggingSettings(database)),
            path: logBuffer.filePath,
          },
        };
      },
    );

    admin.put<{ Body: UpdateServerSettingsRequest }>(
      "/api/admin/server",
      async (request, reply): Promise<ServerSettingsResponse | undefined> => {
        const previousFileLogging = await readFileLoggingSettings(database);
        try {
          const requestedFileLogging = request.body?.fileLogging
            ? validateFileLoggingSettings(request.body.fileLogging)
            : undefined;
          if (requestedFileLogging) {
            await logBuffer.configureFileLogging(
              requestedFileLogging.enabled,
              requestedFileLogging.retentionDays,
            );
          }
          const settings = await updateServerSettings(database, request.body);
          const sourceRefresh = settings.sourceRefresh
            ? ((await sourceRefreshScheduler?.reconfigure(
                settings.sourceRefresh,
              )) ?? {
                ...settings.sourceRefresh,
                nextRunAt: null,
              })
            : (sourceRefreshScheduler?.status() ?? {
                ...(await readSourceRefreshSettings(database)),
                nextRunAt: null,
              });
          const [trackCount, availableTrackCount] = await Promise.all([
            database.orm.Track.aggregate((aggregate) => ({
              count: aggregate.count(),
            })),
            database.orm.Track.where({ available: 1 }).aggregate(
              (aggregate) => ({ count: aggregate.count() }),
            ),
          ]);
          return {
            trackCount: trackCount.count,
            availableTrackCount: availableTrackCount.count,
            scanning: settings.scanning
              ? settings.scanning
              : await readScanWorkerSettings(database),
            sourceRefresh,
            fileLogging: {
              ...(await readFileLoggingSettings(database)),
              path: logBuffer.filePath,
            },
          };
        } catch (error) {
          await logBuffer
            .configureFileLogging(
              previousFileLogging.enabled,
              previousFileLogging.retentionDays,
            )
            .catch(() => undefined);
          if (error instanceof ServerSettingsError) {
            return sendError(
              reply,
              400,
              "invalid_server_settings",
              error.message,
              error.messageDescriptor,
            );
          }
          throw error;
        }
      },
    );

    admin.post(
      "/api/admin/server/restart",
      async (_request, reply): Promise<RestartServerResponse | undefined> => {
        if (!restartServer) {
          sendError(
            reply,
            503,
            "server_restart_unavailable",
            "Server restart is unavailable in this runtime.",
            message("api.message.serverRestartUnavailable"),
          );
          return undefined;
        }
        reply.code(202).send({ status: "restarting" });
        restartServer();
        return undefined;
      },
    );

    admin.get("/api/admin/updates", async (): Promise<UpdateStatusResponse> => {
      if (!updates) {
        throw new Error("Update service is unavailable.");
      }
      return updates.status();
    });

    admin.post("/api/admin/updates/check", async (_request, reply) => {
      if (!updates) {
        throw new Error("Update service is unavailable.");
      }
      try {
        return await updates.check();
      } catch (error) {
        if (error instanceof UpdateError) {
          return sendError(
            reply,
            error.statusCode,
            error.code,
            error.message,
            message(error.messageKey),
          );
        }
        throw error;
      }
    });

    admin.get("/api/admin/sources", async (): Promise<SourceListResponse> => ({
      items: await listSources(database),
    }));

    admin.post<{
      Params: { kind: string };
      Body: DiscoverSourceIntegrationRequest;
    }>(
      "/api/admin/source-integrations/:kind/discover",
      async (
        request,
        reply,
      ): Promise<SourceIntegrationOptionListResponse | undefined> => {
        try {
          if (!sourceIntegrations) {
            throw new Error("Source integration service is unavailable.");
          }
          return {
            items: await discoverIntegrationSources(
              sourceIntegrations,
              request.params.kind,
              request.body,
            ),
          };
        } catch (error) {
          if (error instanceof SourceError) {
            return sendError(
              reply,
              400,
              "invalid_source",
              error.message,
              error.messageDescriptor,
            );
          }
          throw error;
        }
      },
    );

    admin.get("/api/admin/users", async (): Promise<UserListResponse> => ({
      items: await listManagedUsers(database),
    }));

    admin.post<{ Body: CreateUserRequest }>(
      "/api/admin/users",
      async (request, reply) => {
        try {
          return reply
            .code(201)
            .send(await createManagedUser(database, request.body));
        } catch (error) {
          if (error instanceof UserManagementError) {
            return reply.code(error.statusCode).send(error.toResponse());
          }
          throw error;
        }
      },
    );

    admin.put<{ Params: { id: string }; Body: UpdateUserRequest }>(
      "/api/admin/users/:id",
      async (request, reply) => {
        try {
          const result = await updateManagedUser(
            database,
            request.authenticatedUser!,
            request.params.id,
            request.body,
          );
          onSessionsRevoked?.(result.revokedSessionIds);
          return result.user;
        } catch (error) {
          if (error instanceof UserManagementError) {
            return reply.code(error.statusCode).send(error.toResponse());
          }
          throw error;
        }
      },
    );

    admin.delete<{ Params: { id: string } }>(
      "/api/admin/users/:id",
      async (request, reply) => {
        try {
          const sessionIds = await deleteManagedUser(
            database,
            request.authenticatedUser!,
            request.params.id,
          );
          onSessionsRevoked?.(sessionIds);
          return reply.code(204).send();
        } catch (error) {
          if (error instanceof UserManagementError) {
            return reply.code(error.statusCode).send(error.toResponse());
          }
          throw error;
        }
      },
    );

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
          if (!sourceIntegrations) {
            throw new Error("Source integration service is unavailable.");
          }
          const source = await createSource(
            database,
            request.body,
            sourceIntegrations,
            metadataCredentials,
          );
          const task =
            (source.kind === "path" && source.path) ||
            sourceIntegrations.registry.has(source.kind)
              ? await queueLibraryScan(tasks, {
                  id: source.id,
                  name:
                    source.name ||
                    (source.path
                      ? path.basename(source.path)
                      : "Integration source"),
                })
              : null;
          const response: CreateSourceResponse = {
            ...source,
            task: task ? toTaskResponse(task) : null,
          };
          return reply.code(201).send(response);
        } catch (error) {
          if (error instanceof SourceError) {
            return sendError(
              reply,
              400,
              "invalid_source",
              error.message,
              error.messageDescriptor,
            );
          }
          throw error;
        }
      },
    );

    admin.put<{ Body: ReorderSourcesRequest }>(
      "/api/admin/sources/order",
      async (request, reply) => {
        try {
          const result = {
            items: await reorderSources(database, request.body?.ids),
          };
          await queueDuplicateDetection(tasks);
          return result;
        } catch (error) {
          if (error instanceof SourceError) {
            return sendError(
              reply,
              400,
              "invalid_source",
              error.message,
              error.messageDescriptor,
            );
          }
          throw error;
        }
      },
    );

    admin.delete<{ Params: { id: string } }>(
      "/api/admin/sources/:id",
      async (request, reply) => {
        const source = await database.orm.Source.first({
          id: request.params.id,
        });
        if (!source) {
          return sendError(
            reply,
            404,
            "source_not_found",
            "Source not found",
            message("api.message.sourceNotFound"),
          );
        }
        await tasks.stopForSource(source.id);
        const removedTrackIds = (
          await database.orm.Track.where({
            sourceId: source.id,
          })
            .select("id")
            .all()
        ).map((track) => track.id);
        await database.transaction(async (transaction) => {
          if (removedTrackIds.length) {
            await transaction.orm.Track.where({
              sourceId: source.id,
            }).delete();
          }
          await transaction.orm.Source.where({ id: source.id }).delete();
        });
        if (artworkCache) {
          try {
            await pruneReferencedArtwork(database, artworkCache);
          } catch (error) {
            request.log.warn(
              { err: error, sourceId: source.id },
              "Could not prune removed source artwork",
            );
          }
        }
        if (removedTrackIds.length && catalog) {
          try {
            for (const trackId of removedTrackIds) {
              await catalog.removeTrack(trackId);
            }
            await catalog.flushChanges();
          } catch (error) {
            request.log.error(
              { err: error, sourceId: source.id },
              "Could not clean up the removed source catalog",
            );
          }
        }
        if (catalog) {
          try {
            await catalog.markSourceRemoval(source.id);
          } catch (error) {
            request.log.error(
              { err: error, sourceId: source.id },
              "Could not publish the removed source catalog change",
            );
          }
        }
        await queueDuplicateDetection(tasks);
        return reply.code(204).send();
      },
    );

    admin.post<{ Params: { id: string } }>(
      "/api/admin/tasks/:id/cancel",
      async (request, reply) => {
        const task = await tasks.cancel(request.params.id);
        if (!task) {
          return sendError(
            reply,
            404,
            "task_not_found",
            "Task not found",
            message("api.message.taskNotFound"),
          );
        }
        return toTaskResponse(task);
      },
    );

    admin.post<{ Params: { id: string } }>(
      "/api/admin/sources/:id/scans",
      async (request, reply) => {
        const source = await database.orm.Source.first({
          id: request.params.id,
        });
        if (!source) {
          return sendError(
            reply,
            404,
            "source_not_found",
            "Source not found",
            message("api.message.sourceNotFound"),
          );
        }
        if (
          (source.kind !== "path" || !source.path) &&
          !sourceIntegrations?.registry.has(source.kind)
        ) {
          return sendError(
            reply,
            400,
            "source_not_rescanable",
            "Only configured folder and integration sources can be rescanned.",
            message("api.message.sourceNotRescanable"),
          );
        }
        const task = await queueLibraryScan(tasks, {
          id: source.id,
          name:
            source.name ||
            (source.path ? path.basename(source.path) : "Integration source"),
        });
        return reply.code(202).send(toTaskResponse(task));
      },
    );

    admin.get(
      "/api/admin/metadata-providers/definitions",
      async (): Promise<MetadataProviderDefinitionListResponse> => ({
        items: metadataRegistry.definitions(),
      }),
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
            .send(
              await createMetadataProvider(
                database,
                metadataRegistry,
                metadataCredentials,
                request.body,
              ),
            );
        } catch (error) {
          if (error instanceof MetadataProviderError) {
            return sendError(
              reply,
              error.statusCode,
              "invalid_metadata_provider",
              error.message,
              error.messageDescriptor,
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
              error.messageDescriptor,
            );
          }
          throw error;
        }
      },
    );

    admin.put<{
      Params: { id: string };
      Body: UpdateMetadataProviderRequest;
    }>("/api/admin/metadata-providers/:id", async (request, reply) => {
      try {
        const provider = await updateMetadataProvider(
          database,
          metadataRegistry,
          metadataCredentials,
          request.params.id,
          request.body,
        );
        if (!provider) {
          return sendError(
            reply,
            404,
            "metadata_provider_not_found",
            "Metadata provider not found",
            message("api.message.metadataProviderNotFound"),
          );
        }
        return provider;
      } catch (error) {
        if (error instanceof MetadataProviderError) {
          return sendError(
            reply,
            error.statusCode,
            "invalid_metadata_provider",
            error.message,
            error.messageDescriptor,
          );
        }
        throw error;
      }
    });

    admin.post("/api/admin/metadata/reset", async (_request, reply) => {
      if (await tasks.hasActiveWork()) {
        return sendError(
          reply,
          409,
          "metadata_reset_in_progress",
          "Wait for the active library operation to finish.",
          message("api.message.metadataResetInProgress"),
        );
      }
      const artistCount = await metadataEnrichment.resetAllArtists();
      const trackCount = await metadataEnrichment.resetAll();
      await queueDuplicateDetection(tasks);
      const response: ResetMetadataResponse = {
        trackCount,
        artistCount,
      };
      return response;
    });

    admin.post("/api/admin/metadata/refresh", async (_request, reply) => {
      const task = await queueMetadataFetch(tasks, { force: true });
      await queueDuplicateDetection(tasks, task.id);
      return reply.code(202).send(toTaskResponse(task));
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
            message("api.message.invalidSearch"),
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
