import Fastify, { LogController } from "fastify";
import cors from "@fastify/cors";
import type { HealthResponse } from "@peridot/contracts";
import { registerAuthRoutes, registerProtectedRoutes } from "./auth.js";
import { loadServerConfig, type ServerConfig } from "./config.js";
import { CredentialStore } from "./credential-store.js";
import { createDatabase, type Database } from "./database.js";
import { DiscogsClient, DiscogsResolver } from "./discogs.js";
import { registerLibraryRoutes } from "./library-routes.js";
import { registerLikeRoutes } from "./like-routes.js";
import { LibraryScanner } from "./library-scanner.js";
import { MetadataEnrichment } from "./metadata-enrichment.js";
import { ensureDefaultMetadataProvider } from "./metadata-providers.js";
import { MetadataResolverRegistry } from "./metadata-resolver.js";
import { registerTrackMetadataRoutes } from "./metadata-routes.js";
import { MusicBrainzClient, MusicBrainzResolver } from "./musicbrainz.js";
import { registerQuickPickRoutes } from "./quick-picks-routes.js";
import { registerQueueRoutes } from "./queue-routes.js";
import {
  PlaybackTokenService,
  redactPlaybackToken,
} from "./playback-tokens.js";
import { registerAdminRoutes } from "./admin-routes.js";
import { registerTaskRoutes } from "./task-routes.js";
import { TaskService } from "./tasks.js";
import { ensureServerSettings } from "./server-settings.js";
import { ensureDefaultSource } from "./sources.js";
import { ServerLogBuffer } from "./server-log.js";

export interface BuildAppOptions {
  config?: ServerConfig;
  database?: Database;
  logger?: boolean;
  logBuffer?: ServerLogBuffer;
  metadataFetch?: typeof fetch;
  metadataRequestIntervalMs?: number;
  discogsFetch?: typeof fetch;
  discogsRequestIntervalMs?: number;
}

export async function buildApp(options: BuildAppOptions = {}) {
  const config = options.config ?? (await loadServerConfig());
  const database = options.database ?? createDatabase(config.databaseUrl);
  const ownsDatabase = options.database === undefined;
  const credentials = new CredentialStore(config.credentialEncryptionKey);
  const registry = new MetadataResolverRegistry()
    .register(
      new MusicBrainzResolver(
        new MusicBrainzClient({
          ...(options.metadataFetch ? { fetch: options.metadataFetch } : {}),
          ...(options.metadataRequestIntervalMs !== undefined
            ? { requestIntervalMs: options.metadataRequestIntervalMs }
            : {}),
        }),
      ),
    )
    .register(
      new DiscogsResolver(
        new DiscogsClient({
          ...(options.discogsFetch ? { fetch: options.discogsFetch } : {}),
          ...(options.discogsRequestIntervalMs !== undefined
            ? { requestIntervalMs: options.discogsRequestIntervalMs }
            : {}),
        }),
      ),
    );
  const metadataEnrichment = new MetadataEnrichment(
    database,
    registry,
    credentials,
  );
  const tasks = new TaskService(database);
  const scanner = new LibraryScanner(database, metadataEnrichment);
  tasks.registerExecutor("library_scan", (task, taskService) =>
    scanner.runTask(task, taskService),
  );
  tasks.registerExecutor("metadata_fetch", (task, taskService) =>
    metadataEnrichment.runTask(task, taskService),
  );
  const playbackTokens = new PlaybackTokenService();
  const logBuffer = options.logBuffer ?? new ServerLogBuffer();
  const app = Fastify({
    logger:
      options.logger === false
        ? false
        : { stream: logBuffer.stream, level: "debug" },
    logController: new LogController({ disableRequestLogging: true }),
  });
  app.addHook("onResponse", async (request, reply) => {
    const details = {
      req: {
        method: request.method,
        url: redactPlaybackToken(request.url),
      },
      res: reply,
      responseTime: reply.elapsedTime,
    };
    if (reply.statusCode >= 400) {
      request.log.warn(details, "request completed");
    } else {
      request.log.debug(details, "request completed");
    }
  });
  await app.register(cors, {
    origin: config.webOrigins,
    methods: ["GET", "HEAD", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Authorization", "Content-Type", "Range"],
    exposedHeaders: ["Accept-Ranges", "Content-Length", "Content-Range"],
  });
  app.get("/api/health", async (): Promise<HealthResponse> => ({
    status: "ok",
    service: "peridot",
  }));
  await registerAuthRoutes(app, database);
  await ensureServerSettings(database, config.libraryRoot);
  await ensureDefaultSource(database, config.libraryRoot);
  await ensureDefaultMetadataProvider(database);
  await tasks.initialize();
  await registerProtectedRoutes(
    app,
    database,
    async (protectedApp) => {
      await registerLibraryRoutes(
        protectedApp,
        database,
        tasks,
        playbackTokens,
      );
      await registerTaskRoutes(protectedApp, tasks);
      await registerLikeRoutes(protectedApp, database);
      await registerQuickPickRoutes(protectedApp, database);
      await registerQueueRoutes(protectedApp, database);
      await registerTrackMetadataRoutes(protectedApp, metadataEnrichment);
      await registerAdminRoutes(
        protectedApp,
        database,
        logBuffer,
        tasks,
        metadataEnrichment,
        registry,
        credentials,
      );
    },
    (request) => playbackTokens.authorizeRequest(request.method, request.url),
  );
  app.addHook("onClose", async () => {
    metadataEnrichment.close();
    await tasks.close();
    if (ownsDatabase) await database.close();
  });
  return app;
}
