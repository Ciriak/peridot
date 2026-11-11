import Fastify, { LogController } from "fastify";
import cors from "@fastify/cors";
import type { HealthResponse } from "@peridot/contracts";
import { registerAuthRoutes, registerProtectedRoutes } from "./auth.js";
import { loadServerConfig, type ServerConfig } from "./config.js";
import { createDatabase, type Database } from "./database.js";
import { registerLibraryRoutes } from "./library-routes.js";
import { registerLikeRoutes } from "./like-routes.js";
import { LibraryScanner } from "./library-scanner.js";
import { MetadataEnrichment } from "./metadata-enrichment.js";
import { ensureDefaultMetadataProvider } from "./metadata-providers.js";
import { registerTrackMetadataRoutes } from "./metadata-routes.js";
import { MusicBrainzClient } from "./musicbrainz.js";
import { registerQueueRoutes } from "./queue-routes.js";
import {
  PlaybackTokenService,
  redactPlaybackToken,
} from "./playback-tokens.js";
import { registerAdminRoutes } from "./admin-routes.js";
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
}

export async function buildApp(options: BuildAppOptions = {}) {
  const config = options.config ?? (await loadServerConfig());
  const database = options.database ?? createDatabase(config.databaseUrl);
  const ownsDatabase = options.database === undefined;
  const metadataEnrichment = new MetadataEnrichment(
    database,
    new MusicBrainzClient({
      ...(options.metadataFetch ? { fetch: options.metadataFetch } : {}),
      ...(options.metadataRequestIntervalMs !== undefined
        ? { requestIntervalMs: options.metadataRequestIntervalMs }
        : {}),
    }),
  );
  const scanner = new LibraryScanner(database, metadataEnrichment);
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
  await scanner.markInterruptedScans();
  await registerProtectedRoutes(
    app,
    database,
    async (protectedApp) => {
      await registerLibraryRoutes(
        protectedApp,
        database,
        scanner,
        playbackTokens,
      );
      await registerLikeRoutes(protectedApp, database);
      await registerQueueRoutes(protectedApp, database);
      await registerTrackMetadataRoutes(protectedApp, metadataEnrichment);
      await registerAdminRoutes(
        protectedApp,
        database,
        logBuffer,
        scanner,
        metadataEnrichment,
      );
    },
    (request) => playbackTokens.authorizeRequest(request.method, request.url),
  );
  app.addHook("onClose", async () => {
    await scanner.close();
    if (ownsDatabase) await database.close();
  });
  return app;
}
