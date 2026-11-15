import { buildApp } from "./app.js";
import { DEFAULT_SERVER_PORT, DEFAULT_WEB_PORT } from "./config.js";
import { buildWebServer } from "./web-server.js";
import { fileURLToPath } from "node:url";

type PeridotServer = Awaited<ReturnType<typeof buildApp>>;
type PeridotWebServer = Awaited<ReturnType<typeof buildWebServer>>;

const DEFAULT_WEB_DIST = new URL("../../web/.output/public", import.meta.url);

function parsePort(value: string | undefined, fallback: number, name: string) {
  const port = Number(value ?? fallback);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`${name} must be an integer between 1 and 65535`);
  }
  return port;
}

function apiBaseUrl(host: string, port: number): string {
  const targetHost =
    host === "0.0.0.0" || host === "::"
      ? "127.0.0.1"
      : host.includes(":")
        ? `[${host}]`
        : host;
  return `http://${targetHost}:${port}`;
}

export async function startServer(
  environment: NodeJS.ProcessEnv = process.env,
): Promise<void> {
  const port = parsePort(environment.PORT, DEFAULT_SERVER_PORT, "PORT");
  const webPort = parsePort(environment.WEB_PORT, DEFAULT_WEB_PORT, "WEB_PORT");
  const host = environment.HOST ?? "127.0.0.1";
  const webHost = environment.WEB_HOST ?? host;
  const serveWeb = environment.PERIDOT_SERVE_WEB !== "false";
  const webRoot =
    environment.PERIDOT_WEB_DIST?.trim() || fileURLToPath(DEFAULT_WEB_DIST);
  let app: PeridotServer | null = null;
  let webApp: PeridotWebServer | null = null;
  let restartScheduled = false;
  let shuttingDown = false;

  async function closeApps() {
    await webApp?.close();
    webApp = null;
    await app?.close();
    app = null;
  }

  async function buildAndListen() {
    app = await buildApp({
      restartServer: requestRestart,
      enableSourceRefreshScheduler: true,
    });
    await app.listen({ port, host });
    if (serveWeb) {
      webApp = await buildWebServer({
        apiBaseUrl: apiBaseUrl(host, port),
        webRoot,
      });
      await webApp.listen({ port: webPort, host: webHost });
    }
  }

  function requestRestart() {
    if (shuttingDown || restartScheduled) return;
    restartScheduled = true;
    setImmediate(async () => {
      try {
        await closeApps();
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
        void closeApps();
      });
    }
  } catch (error) {
    console.error("Could not start the Peridot server.", error);
    await closeApps().catch(() => undefined);
    process.exitCode = 1;
  }
}
