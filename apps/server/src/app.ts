import { downloadCredentialEnvelope } from "./download-clients.js";
import Fastify, { LogController } from "fastify";
import cors from "@fastify/cors";
import websocket from "@fastify/websocket";
import type { HealthResponse } from "@peridot/contracts";
import { registerAuthRoutes, registerProtectedRoutes } from "./auth.js";
import { ArtworkCache } from "./artwork-cache.js";
import { CatalogService } from "./catalog.js";
import { registerCatalogRoutes } from "./catalog-routes.js";
import { loadServerConfig, type ServerConfig } from "./config.js";
import {
  createConnectorRegistry,
  librarySourceConnectorDefinition,
  metadataProviderConnectorDefinition,
  pathLibrarySourceConnectorDefinition,
  qBittorrentConnectorDefinition,
  torznabConnectorDefinition,
  type ConnectorRuntimeDefinition,
} from "./connectors.js";
import { CredentialStore } from "./credential-store.js";
import {
  configureDatabase,
  createDatabase,
  type Database,
} from "./database.js";
import { DiscogsClient, DiscogsResolver } from "./discogs.js";
import { MediaMatchService } from "./duplicate-detection.js";
import { registerLibraryRoutes } from "./library-routes.js";
import { registerLikeRoutes } from "./like-routes.js";
import { registerOpenApi, registerOpenApiRoutes } from "./openapi.js";
import { registerPlaylistRoutes } from "./playlist-routes.js";
import { LibraryScanner } from "./library-scanner.js";
import { registerLocalDiscoveryRoute } from "./local-discovery.js";
import { MetadataEnrichment } from "./metadata-enrichment.js";
import { ensureDefaultMetadataProvider } from "./metadata-providers.js";
import { MetadataResolverRegistry } from "./metadata-resolver.js";
import { registerMediaMetadataRoutes } from "./metadata-routes.js";
import { MusicBrainzClient, MusicBrainzResolver } from "./musicbrainz.js";
import { registerQuickPickRoutes } from "./quick-picks-routes.js";
import {
  PlaybackTokenService,
  redactPlaybackToken,
} from "./playback-tokens.js";
import { ReleaseImportService } from "./torznab.js";
import { registerAdminRoutes } from "./admin-routes.js";
import { ArtworkService, hasPendingArtworkJobs } from "./artwork-fetch.js";
import { createJellyfinIntegration } from "./jellyfin/index.js";
import {
  LibrarySourceConnectorRegistry,
  LibrarySourceConnectorService,
  type LibrarySourceConnectorDefinition,
} from "./source-integrations.js";
import { registerTaskRoutes } from "./task-routes.js";
import {
  queueArtworkFetch,
  queueCatalogProjection,
  queueMediaMatch,
  TaskService,
} from "./tasks.js";
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
import { SourceRemovalRegistry } from "./source-removal.js";

export const APPLICATION_PLUGIN_TIMEOUT_MS = 60_000;

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
  qbittorrentFetch?: typeof fetch;
  sourceIntegrations?: readonly LibrarySourceConnectorDefinition[];
  connectors?: readonly ConnectorRuntimeDefinition[];
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
  await configureDatabase(database);
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
      await database.orm.LibrarySource.where((source) =>
        source.credentialCiphertext.isNotNull(),
      ).all()
    ).flatMap((source) =>
      source.credentialCiphertext ? [source.credentialCiphertext] : [],
    );
    const downloadCredentials = await database.orm.DownloadClient.select(
      "credentialCiphertext",
    ).all();
    const releaseIndexerCredentials = (
      await database.orm.ReleaseIndexer.where((indexer) =>
        indexer.credentialCiphertext.isNotNull(),
      ).all()
    ).flatMap((indexer) =>
      indexer.credentialCiphertext ? [indexer.credentialCiphertext] : [],
    );
    const playlistAccountCredentials = (
      await database.orm.PlaylistAccount.where((account) =>
        account.credentialCiphertext.isNotNull(),
      ).all()
    ).flatMap((account) =>
      account.credentialCiphertext ? [account.credentialCiphertext] : [],
    );
    credentials = await CredentialStore.fromConfig(
      config.credentialEncryptionKey,
      config.databaseUrl,
      {
        metadataProvider: metadataProviderCredentials,
        librarySource: sourceCredentials,
        releaseIndexer: releaseIndexerCredentials,
        downloadClient: downloadCredentials.map((client) =>
          downloadCredentialEnvelope(client.credentialCiphertext),
        ),
        playlistAccount: playlistAccountCredentials,
      },
    );
  } catch (error) {
    if (ownsDatabase) await database.close();
    throw error;
  }
  const metadataRegistry = new MetadataResolverRegistry()
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
  const connectorRegistry = createConnectorRegistry([
    pathLibrarySourceConnectorDefinition(),
    ...(options.sourceIntegrations ?? [createJellyfinIntegration()]).map(
      librarySourceConnectorDefinition,
    ),
    torznabConnectorDefinition(),
    qBittorrentConnectorDefinition({
      ...(options.qbittorrentFetch ? { fetch: options.qbittorrentFetch } : {}),
    }),
    ...metadataRegistry.all().map(metadataProviderConnectorDefinition),
    ...(options.connectors ?? []),
  ]);
  const playbackTokens = new PlaybackTokenService();
  const librarySourceDefinitions = connectorRegistry
    .librarySourceConnectors()
    .flatMap((connector) =>
      connector.librarySource && "scan" in connector.librarySource
        ? [connector.librarySource]
        : [],
    );
  const sourceIntegrations = new LibrarySourceConnectorService(
    new LibrarySourceConnectorRegistry(librarySourceDefinitions),
    credentials,
  );
  const catalog = new CatalogService(database, playbackTokens);
  const mediaMatch = new MediaMatchService(database, catalog);
  const realtime = new RealtimeHub(database);
  const sourceRemovals = new SourceRemovalRegistry((progress) =>
    realtime.publishSourceRemoval(progress),
  );
  const metadataEnrichment = new MetadataEnrichment(
    database,
    metadataRegistry,
    credentials,
    catalog,
    artworkCache,
    options.discogsFetch ?? fetch,
  );
  const artworkService = new ArtworkService(
    database,
    sourceIntegrations,
    catalog,
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
    sourceIntegrations,
    metadataEnrichment,
    catalog,
    artworkCache,
  );
  tasks.registerExecutor("library_scan", (task, taskService, signal) =>
    scanner.runTask(task, taskService, signal),
  );
  tasks.registerExecutor("release_import", (task, taskService, signal) =>
    scanner.runTask(task, taskService, signal),
  );
  tasks.registerExecutor("metadata_enrichment", (task, taskService, signal) =>
    metadataEnrichment.runTask(task, taskService, signal),
  );
  tasks.registerExecutor("catalog_projection", (task, taskService, signal) =>
    catalog.runTask(task, taskService, signal),
  );
  tasks.registerExecutor("artwork_fetch", (task, taskService, signal) =>
    artworkService.runTask(task, taskService, signal),
  );
  tasks.registerExecutor("media_match", (task, taskService, signal) =>
    mediaMatch.runTask(task, taskService, signal),
  );
  logBuffer.onEntry((entry) => realtime.publishLog(entry));
  catalog.setPublisher((change) => realtime.publishCatalog(change));
  const app = Fastify({
    pluginTimeout: APPLICATION_PLUGIN_TIMEOUT_MS,
    logger:
      options.logger === false
        ? false
        : { stream: logBuffer.stream, level: "debug" },
    logController: new LogController({ disableRequestLogging: true }),
  });
  await registerOpenApi(app);
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
  if (await mediaMatch.needsRun()) {
    await queueMediaMatch(tasks);
  }
  const sourceRefreshScheduler = new SourceRefreshScheduler(
    database,
    tasks,
    (level, message) => logBuffer.add(level, message),
  );
  await sourceRefreshScheduler.initialize(
    options.enableSourceRefreshScheduler ?? false,
  );
  if (await catalog.hasPendingProjection()) {
    await queueCatalogProjection(tasks);
  }
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
        artworkCache,
        sourceIntegrations,
      );
      new ReleaseImportService(database, tasks, credentials).register(
        protectedApp,
      );
      await registerCatalogRoutes(protectedApp, catalog, artworkCache);
      await registerTaskRoutes(protectedApp, tasks);
      await registerLikeRoutes(protectedApp, database);
      await registerPlaylistRoutes(
        protectedApp,
        database,
        playbackTokens,
        credentials,
        connectorRegistry,
      );
      await registerQuickPickRoutes(protectedApp, database, catalog);
      await registerMediaMetadataRoutes(
        protectedApp,
        metadataEnrichment,
        tasks,
      );
      await registerAdminRoutes(
        protectedApp,
        database,
        logBuffer,
        tasks,
        metadataEnrichment,
        metadataRegistry,
        credentials,
        (sessionIds) => {
          for (const sessionId of sessionIds) {
            realtime.disconnectSession(sessionId);
          }
        },
        options.restartServer,
        sourceIntegrations,
        catalog,
        sourceRefreshScheduler,
        updateService,
        artworkCache,
        sourceRemovals,
        connectorRegistry,
      );
    },
    (request) => playbackTokens.authorizeRequest(request.method, request.url),
    (sessionId) => realtime.disconnectSession(sessionId),
  );
  await registerOpenApiRoutes(app);
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
