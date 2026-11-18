import Fastify, { LogController } from "fastify";
import cors from "@fastify/cors";
import websocket from "@fastify/websocket";
import type { HealthResponse } from "@peridot/contracts";
import { registerAuthRoutes, registerProtectedRoutes } from "./auth.js";
import { ArtworkCache } from "./artwork-cache.js";
import { CatalogService } from "./catalog.js";
import { registerCatalogRoutes } from "./catalog-routes.js";
import { loadServerConfig, type ServerConfig } from "./config.js";
import { CredentialStore } from "./credential-store.js";
import { createDatabase, type Database } from "./database.js";
import { DiscogsClient, DiscogsResolver } from "./discogs.js";
import { JellyfinClient } from "./jellyfin.js";
import { registerLibraryRoutes } from "./library-routes.js";
import { registerLikeRoutes } from "./like-routes.js";
import { registerPlaylistRoutes } from "./playlist-routes.js";
import { LibraryScanner } from "./library-scanner.js";
import { registerLocalDiscoveryRoute } from "./local-discovery.js";
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
import { ArtworkService, hasPendingArtworkJobs } from "./artwork-fetch.js";
import { registerTaskRoutes } from "./task-routes.js";
import { queueArtworkFetch, TaskService } from "./tasks.js";
import { ensureServerSettings } from "./server-settings.js";
import { SourceRefreshScheduler } from "./source-refresh-scheduler.js";
import { ensureDefaultSource } from "./sources.js";
import { ServerLogBuffer, serverLogFilePath } from "./server-log.js";
import {
  RealtimeHub,
  redactRealtimeTicket,
  registerRealtimeSocket,
  registerRealtimeTicketRoute,
} from "./realtime.js";
import { UpdateService, type UpdateConfig } from "./updates.js";
import {
  UpdateCheckScheduler,
  type UpdateCheckSchedulerOptions,
} from "./update-check-scheduler.js";
import { registerWebApplication } from "./web-server.js";

export interface BuildAppOptions {
  config?: ServerConfig;
  database?: Database;
  logger?: boolean;
  logBuffer?: ServerLogBuffer;
  restartServer?: () => void;
  metadataFetch?: typeof fetch;
  metadataRequestIntervalMs?: number;
  discogsFetch?: typeof fetch;
  discogsRequestIntervalMs?: number;
  jellyfinFetch?: typeof fetch;
  jellyfinRequestTimeoutMs?: number;
  enableSourceRefreshScheduler?: boolean;
  enableUpdateCheckScheduler?: boolean;
  updateCheckSchedulerOptions?: UpdateCheckSchedulerOptions;
  updateService?: UpdateService;
  webRoot?: string;
}

export async function buildApp(options: BuildAppOptions = {}) {
  const config = options.config ?? (await loadServerConfig());
  const updateService =
    options.updateService ??
    new UpdateService(
      config.updates ??
        ({
          channel: "local",
          repository: "Ciriak/peridot",
          currentTag: null,
          currentCommit: null,
        } satisfies UpdateConfig),
    );
  const database = options.database ?? createDatabase(config.databaseUrl);
  const ownsDatabase = options.database === undefined;
  const artworkCache = new ArtworkCache(config.databaseUrl);
  let credentials: CredentialStore;
  try {
    const metadataProviderCredentials = (
      await database.orm.MetadataProvider.where((provider) =>
        provider.credentialCiphertext.isNotNull(),
      ).all()
    ).flatMap((provider) =>
      provider.credentialCiphertext ? [provider.credentialCiphertext] : [],
    );
    const sourceCredentials = (
      await database.orm.Source.where((source) =>
        source.credentialCiphertext.isNotNull(),
      ).all()
    ).flatMap((source) =>
      source.credentialCiphertext ? [source.credentialCiphertext] : [],
    );
    credentials = await CredentialStore.fromConfig(
      config.credentialEncryptionKey,
      config.databaseUrl,
      {
        metadataProvider: metadataProviderCredentials,
        source: sourceCredentials,
      },
    );
  } catch (error) {
    if (ownsDatabase) await database.close();
    throw error;
  }
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
  const playbackTokens = new PlaybackTokenService();
  const jellyfin = new JellyfinClient(
    options.jellyfinFetch ?? fetch,
    options.jellyfinRequestTimeoutMs,
  );
  const catalog = new CatalogService(database, playbackTokens);
  const realtime = new RealtimeHub(database);
  const metadataEnrichment = new MetadataEnrichment(
    database,
    registry,
    credentials,
    catalog,
    artworkCache,
    options.discogsFetch ?? fetch,
  );
  const artworkService = new ArtworkService(
    database,
    jellyfin,
    catalog,
    credentials,
    artworkCache,
  );
  const logBuffer =
    options.logBuffer ??
    new ServerLogBuffer(serverLogFilePath(config.databaseUrl));
  const updateCheckScheduler = new UpdateCheckScheduler(
    updateService,
    (message) => logBuffer.add("warn", message),
    options.updateCheckSchedulerOptions,
  );
  const tasks = new TaskService(
    database,
    (task) => realtime.publishTask(task),
    (level, message) => logBuffer.add(level, message),
  );
  const scanner = new LibraryScanner(
    database,
    metadataEnrichment,
    catalog,
    jellyfin,
    credentials,
    artworkCache,
  );
  tasks.registerExecutor("library_scan", (task, taskService, signal) =>
    scanner.runTask(task, taskService, signal),
  );
  tasks.registerExecutor("metadata_fetch", (task, taskService, signal) =>
    metadataEnrichment.runTask(task, taskService, signal),
  );
  tasks.registerExecutor("artwork_fetch", (task, taskService, signal) =>
    artworkService.runTask(task, taskService, signal),
  );
  logBuffer.onEntry((entry) => realtime.publishLog(entry));
  catalog.setPublisher((change) => realtime.publishCatalog(change));
  const app = Fastify({
    logger:
      options.logger === false
        ? false
        : { stream: logBuffer.stream, level: "debug" },
    logController: new LogController({ disableRequestLogging: true }),
  });
  let backfillImmediate: ReturnType<typeof setImmediate> | undefined;
  app.addHook("onListen", async () => {
    if (options.enableUpdateCheckScheduler ?? false) {
      updateCheckScheduler.start();
    }
    backfillImmediate = setImmediate(() => {
      backfillImmediate = undefined;
      void catalog.startBackfill();
    });
  });
  await app.register(websocket, {
    options: { maxPayload: 16 * 1024 },
  });
  app.addHook("onResponse", async (request, reply) => {
    const details = {
      req: {
        method: request.method,
        url: redactRealtimeTicket(redactPlaybackToken(request.url)),
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
    methods: ["GET", "HEAD", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Authorization", "Content-Type", "Range"],
    exposedHeaders: ["Accept-Ranges", "Content-Length", "Content-Range"],
  });
  app.get("/api/health", async (_request, reply): Promise<HealthResponse> => {
    reply.header("access-control-allow-origin", "*");
    return {
      status: "ok",
      service: "peridot",
    };
  });
  await registerLocalDiscoveryRoute(app);
  await registerRealtimeSocket(app, realtime, config.webOrigins);
  await registerAuthRoutes(app, database, (sessionIds) => {
    for (const sessionId of sessionIds) {
      realtime.disconnectSession(sessionId);
    }
  });
  await catalog.initialize();
  const initialServerSettings = await ensureServerSettings(
    database,
    config.libraryRoot,
  );
  await logBuffer.configureFileLogging(
    initialServerSettings.fileLogging.enabled,
    initialServerSettings.fileLogging.retentionDays,
  );
  await logBuffer.loadPersistedHistory();
  await ensureDefaultSource(database, config.libraryRoot);
  await ensureDefaultMetadataProvider(database);
  await tasks.initialize();
  const sourceRefreshScheduler = new SourceRefreshScheduler(
    database,
    tasks,
    (level, message) => logBuffer.add(level, message),
  );
  await sourceRefreshScheduler.initialize(
    options.enableSourceRefreshScheduler ?? false,
  );
  if (await hasPendingArtworkJobs(database, null)) {
    await queueArtworkFetch(tasks);
  }
  await registerProtectedRoutes(
    app,
    database,
    async (protectedApp) => {
      await registerRealtimeTicketRoute(protectedApp, realtime);
      await registerLibraryRoutes(
        protectedApp,
        database,
        tasks,
        playbackTokens,
        jellyfin,
        credentials,
        artworkCache,
      );
      await registerCatalogRoutes(protectedApp, catalog, artworkCache);
      await registerTaskRoutes(protectedApp, tasks);
      await registerLikeRoutes(protectedApp, database);
      await registerPlaylistRoutes(protectedApp, database, playbackTokens);
      await registerQuickPickRoutes(protectedApp, database, catalog);
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
        (sessionIds) => {
          for (const sessionId of sessionIds) {
            realtime.disconnectSession(sessionId);
          }
        },
        options.restartServer,
        jellyfin,
        catalog,
        sourceRefreshScheduler,
        updateService,
        artworkCache,
      );
    },
    (request) => playbackTokens.authorizeRequest(request.method, request.url),
    (sessionId) => realtime.disconnectSession(sessionId),
  );
  if (options.webRoot) {
    await registerWebApplication(app, { webRoot: options.webRoot });
  }
  app.addHook("onClose", async () => {
    updateCheckScheduler.close();
    sourceRefreshScheduler.close();
    if (backfillImmediate) {
      clearImmediate(backfillImmediate);
      backfillImmediate = undefined;
    }
    metadataEnrichment.close();
    await tasks.close();
    await catalog.close();
    await artworkCache.close();
    await logBuffer.close();
    logBuffer.onEntry(null);
    realtime.close();
    if (ownsDatabase) await database.close();
  });
  return app;
}
