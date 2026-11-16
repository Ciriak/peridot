import { buildApp } from "./app.js";
import { DEFAULT_PORT } from "./config.js";
import { fileURLToPath } from "node:url";

const DEFAULT_WEB_DIST = new URL("../../web/.output/public", import.meta.url);

export interface ServerRuntimeOptions {
  port: number;
  host: string;
  serveWeb: boolean;
  webRoot: string;
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
): Promise<void> {
  const { port, host, serveWeb, webRoot } = resolveServerRuntimeOptions(
    environment,
    fileURLToPath(DEFAULT_WEB_DIST),
  );
  let app: Awaited<ReturnType<typeof buildApp>> | null = null;
  let restartScheduled = false;
  let shuttingDown = false;

  async function closeApp() {
    await app?.close();
    app = null;
  }

  async function buildAndListen() {
    app = await buildApp({
      restartServer: requestRestart,
      enableSourceRefreshScheduler: true,
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
        process.exitCode = 1;
        console.error("Could not restart the Peridot server.", error);
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
  } catch (error) {
    console.error("Could not start the Peridot server.", error);
    await closeApp().catch(() => undefined);
    process.exitCode = 1;
  }
}
