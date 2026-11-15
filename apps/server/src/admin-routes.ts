import path from "node:path";
import type {
  CreateUserRequest,
  CreateMetadataProviderRequest,
  CreateSourceRequest,
  CreateSourceResponse,
  DirectoryListResponse,
  DiscoverJellyfinLibrariesRequest,
  JellyfinLibraryListResponse,
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
  UpdateSourceRequest,
  UpdateUserRequest,
  UserListResponse,
  UpdateStatusResponse,
  InstallUpdateResponse,
} from "@peridot/contracts";
import type { FastifyInstance } from "fastify";
import type { CatalogService } from "./catalog.js";
import type { CredentialStore } from "./credential-store.js";
import type { Database } from "./database.js";
import { sendError } from "./http.js";
import type { JellyfinClient } from "./jellyfin.js";
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
  ServerSettingsError,
  updateSourceRefreshSettings,
} from "./server-settings.js";
import type { SourceRefreshScheduler } from "./source-refresh-scheduler.js";
import { UpdateError, type UpdateService } from "./updates.js";
import {
  createSource,
  deleteSource,
  listDirectoryEntries,
  listJellyfinLibraries,
  listSources,
  reorderSources,
  searchDirectoryEntries,
  SourceError,
  updateSourceMediaType,
} from "./sources.js";
import {
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
  jellyfin?: JellyfinClient,
  catalog?: CatalogService,
  sourceRefreshScheduler?: SourceRefreshScheduler,
  updates?: UpdateService,
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
          sourceRefresh: sourceRefreshScheduler?.status() ?? {
            enabled: false,
            cron: "",
            nextRunAt: null,
          },
        };
      },
    );

    admin.put<{ Body: UpdateServerSettingsRequest }>(
      "/api/admin/server",
      async (request, reply): Promise<ServerSettingsResponse | undefined> => {
        try {
          const settings = await updateSourceRefreshSettings(
            database,
            request.body?.sourceRefresh,
          );
          const sourceRefresh = (await sourceRefreshScheduler?.reconfigure(
            settings,
          )) ?? {
            ...settings,
            nextRunAt: null,
          };
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
            sourceRefresh,
          };
        } catch (error) {
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

    admin.post(
      "/api/admin/updates/install",
      async (request, reply): Promise<InstallUpdateResponse | undefined> => {
        if (!updates) {
          throw new Error("Update service is unavailable.");
        }
        try {
          const response = updates.install();
          reply.code(202).send(response);
          setImmediate(() => {
            void updates.requestWatchtowerUpdate().catch((error) => {
              request.log.error(error, "Could not request a Watchtower update");
            });
          });
          return undefined;
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
      },
    );

    admin.get("/api/admin/sources", async (): Promise<SourceListResponse> => ({
      items: await listSources(database),
    }));

    admin.post<{ Body: DiscoverJellyfinLibrariesRequest }>(
      "/api/admin/integrations/jellyfin/libraries",
      async (
        request,
        reply,
      ): Promise<JellyfinLibraryListResponse | undefined> => {
        try {
          if (!jellyfin) {
            throw new Error("Jellyfin client is unavailable.");
          }
          return {
            items: await listJellyfinLibraries(jellyfin, request.body),
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
          if (!jellyfin) {
            throw new Error("Jellyfin client is unavailable.");
          }
          const source = await createSource(
            database,
            request.body,
            jellyfin,
            metadataCredentials,
          );
          const task =
            (source.kind === "path" && source.path) ||
            (source.kind === "integration" && source.integration === "jellyfin")
              ? await queueLibraryScan(tasks, {
                  id: source.id,
                  name:
                    source.name ||
                    (source.path
                      ? path.basename(source.path)
                      : (source.url ?? "Jellyfin")),
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

    admin.patch<{ Params: { id: string }; Body: UpdateSourceRequest }>(
      "/api/admin/sources/:id",
      async (request, reply): Promise<CreateSourceResponse | undefined> => {
        try {
          const source = await updateSourceMediaType(
            database,
            request.params.id,
            request.body?.mediaType,
          );
          await tasks.stopForSource(source.id);
          const task = await queueLibraryScan(tasks, {
            id: source.id,
            name:
              source.name ||
              (source.path
                ? path.basename(source.path)
                : (source.url ?? "Jellyfin")),
          });
          return { ...source, task: toTaskResponse(task) };
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
          return {
            items: await reorderSources(database, request.body?.ids),
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
        if (
          source.kind === "integration" &&
          source.integration === "jellyfin"
        ) {
          const tracks = await database.orm.Track.where({
            sourceId: source.id,
          })
            .select("id")
            .all();
          for (const track of tracks) {
            await database.orm.Track.where({ id: track.id }).delete();
            await catalog?.removeTrack(track.id);
          }
          await catalog?.flushChanges();
        }
        const removed = await deleteSource(database, request.params.id);
        if (!removed) {
          return sendError(
            reply,
            404,
            "source_not_found",
            "Source not found",
            message("api.message.sourceNotFound"),
          );
        }
        return reply.code(204).send();
      },
    );

    admin.post<{ Params: { id: string } }>(
      "/api/admin/tasks/:id/stop",
      async (request, reply) => {
        const task = await tasks.stop(request.params.id);
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
          !(
            source.kind === "integration" &&
            source.integration === "jellyfin" &&
            source.url &&
            source.credentialCiphertext
          )
        ) {
          return sendError(
            reply,
            400,
            "source_not_rescanable",
            "Only configured folder and Jellyfin sources can be rescanned.",
            message("api.message.sourceNotRescanable"),
          );
        }
        const task = await queueLibraryScan(tasks, {
          id: source.id,
          name:
            source.name ||
            (source.path
              ? path.basename(source.path)
              : (source.url ?? "Jellyfin")),
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
      const response: ResetMetadataResponse = {
        trackCount,
        artistCount,
      };
      return response;
    });

    admin.post("/api/admin/metadata/refresh", async (_request, reply) => {
      const task = await queueMetadataFetch(tasks, { force: true });
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
