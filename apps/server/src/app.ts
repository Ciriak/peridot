import Fastify from "fastify";
import cors from "@fastify/cors";
import type { HealthResponse } from "@peridot/contracts";
import { registerAuthRoutes, registerProtectedRoutes } from "./auth.js";
import { loadServerConfig, type ServerConfig } from "./config.js";
import { createDatabase, type Database } from "./database.js";
import { registerLibraryRoutes } from "./library-routes.js";
import { LibraryScanner } from "./library-scanner.js";
import { registerAdminRoutes } from "./admin-routes.js";
import { ensureServerSettings } from "./server-settings.js";
import { ensureDefaultSource } from "./sources.js";
import { ServerLogBuffer } from "./server-log.js";

export interface BuildAppOptions {
  config?: ServerConfig;
  database?: Database;
  logger?: boolean;
  logBuffer?: ServerLogBuffer;
}

export async function buildApp(options: BuildAppOptions = {}) {
  const config = options.config ?? (await loadServerConfig());
  const database = options.database ?? createDatabase(config.databaseUrl);
  const ownsDatabase = options.database === undefined;
  const scanner = new LibraryScanner(database);
  const logBuffer = options.logBuffer ?? new ServerLogBuffer();
  const app = Fastify({
    logger: options.logger === false ? false : { stream: logBuffer.stream },
  });
  await app.register(cors, {
    origin: config.webOrigins,
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
  await scanner.markInterruptedScans();
  await registerProtectedRoutes(app, database, async (protectedApp) => {
    await registerLibraryRoutes(protectedApp, database, scanner);
    await registerAdminRoutes(protectedApp, database, logBuffer);
  });
  app.addHook("onClose", async () => {
    await scanner.close();
    if (ownsDatabase) await database.$disconnect();
  });
  return app;
}
