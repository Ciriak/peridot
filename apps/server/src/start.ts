import { buildApp } from "./app.js";
import { DEFAULT_PORT } from "./config.js";
import { fileURLToPath } from "node:url";
import { reportFatalFailure } from "./failure-reporting.js";
import { serverLogFilePath } from "./server-log.js";

const DEFAULT_WEB_DIST = new URL("../../web/.output/public", import.meta.url);

export interface ServerRuntimeOptions {
  port: number;
  host: string;
  serveWeb: boolean;
  webRoot: string;
}

export interface StartServerDependencies {
  buildApp?: typeof buildApp;
  reportFailure?: typeof reportFatalFailure;
}

function parsePort(value: string | undefined, fallback: number, name: string) {
  const port = Number(value ?? fallback);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`${name} must be an integer between 1 and 65535`);
  }
  return port;
}

export function resolveServerRuntimeOptions(
  environment: NodeJS.ProcessEnv,
  defaultWebRoot: string,
): ServerRuntimeOptions {
  const host = environment.HOST ?? "127.0.0.1";
  return {
    port: parsePort(environment.PORT, DEFAULT_PORT, "PORT"),
    host,
    serveWeb: environment.PERIDOT_SERVE_WEB !== "false",
    webRoot: environment.PERIDOT_WEB_DIST?.trim() || defaultWebRoot,
  };
}

export async function startServer(
  environment: NodeJS.ProcessEnv = process.env,
  dependencies: StartServerDependencies = {},
): Promise<boolean> {
  const buildApplication = dependencies.buildApp ?? buildApp;
  const reportFailure = dependencies.reportFailure ?? reportFatalFailure;
  const logFilePath = (() => {
    const databaseUrl = environment.DATABASE_URL;
    if (!databaseUrl) return undefined;
    try {
      return serverLogFilePath(databaseUrl);
    } catch {
      return undefined;
    }
  })();
  const failureLogFile = logFilePath ? { logFilePath } : {};
  let runtime: ServerRuntimeOptions;
  try {
    runtime = resolveServerRuntimeOptions(
      environment,
      fileURLToPath(DEFAULT_WEB_DIST),
    );
  } catch (error) {
    await reportFailure(error, {
      message: "Could not resolve the Peridot server runtime.",
      component: "server",
      operation: "startup",
      ...failureLogFile,
    });
    process.exitCode = 1;
    return false;
  }
  const { port, host, serveWeb, webRoot } = runtime;
  let app: Awaited<ReturnType<typeof buildApp>> | null = null;
  let restartScheduled = false;
  let shuttingDown = false;

  async function closeApp() {
    await app?.close();
    app = null;
  }

  async function buildAndListen() {
    app = await buildApplication({
      restartServer: requestRestart,
      enableSourceRefreshScheduler: true,
      enableUpdateCheckScheduler: true,
      ...(serveWeb ? { webRoot } : {}),
    });
    await app.listen({ port, host });
  }

  function requestRestart() {
    if (shuttingDown || restartScheduled) return;
    restartScheduled = true;
    setImmediate(async () => {
      try {
        await closeApp();
        if (shuttingDown) return;
        await buildAndListen();
      } catch (error) {
        await reportFailure(error, {
          message: "Could not restart the Peridot server.",
          component: "server",
          operation: "restart",
          ...failureLogFile,
          fields: { host, port, serveWeb },
        });
        process.exitCode = 1;
      } finally {
        restartScheduled = false;
      }
    });
  }

  try {
    await buildAndListen();
    for (const signal of ["SIGINT", "SIGTERM"] as const) {
      process.once(signal, () => {
        if (shuttingDown) return;
        shuttingDown = true;
        void closeApp();
      });
    }
    return true;
  } catch (error) {
    await closeApp().catch(() => undefined);
    await reportFailure(error, {
      message: "Could not start the Peridot server.",
      component: "server",
      operation: "startup",
      ...failureLogFile,
      fields: { host, port, serveWeb },
    });
    process.exitCode = 1;
    return false;
  }
}
