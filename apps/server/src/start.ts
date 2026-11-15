import { buildApp } from "./app.js";
import { DEFAULT_SERVER_PORT } from "./config.js";

type PeridotServer = Awaited<ReturnType<typeof buildApp>>;

export async function startServer(
  environment: NodeJS.ProcessEnv = process.env,
): Promise<void> {
  const port = Number(environment.PORT ?? DEFAULT_SERVER_PORT);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error("PORT must be an integer between 1 and 65535");
  }
  const host = environment.HOST ?? "127.0.0.1";
  let app: PeridotServer;
  let restartScheduled = false;
  let shuttingDown = false;

  function requestRestart() {
    if (shuttingDown || restartScheduled) return;
    restartScheduled = true;
    setImmediate(async () => {
      try {
        await app.close();
        if (shuttingDown) return;

        app = await buildApp({
          restartServer: requestRestart,
          enableSourceRefreshScheduler: true,
        });
        if (shuttingDown) {
          await app.close();
          return;
        }
        await app.listen({ port, host });
      } catch (error) {
        process.exitCode = 1;
        console.error("Could not restart the Peridot server.", error);
      } finally {
        restartScheduled = false;
      }
    });
  }

  app = await buildApp({
    restartServer: requestRestart,
    enableSourceRefreshScheduler: true,
  });
  for (const signal of ["SIGINT", "SIGTERM"] as const) {
    process.once(signal, () => {
      if (shuttingDown) return;
      shuttingDown = true;
      void app.close();
    });
  }
  try {
    await app.listen({ port, host });
  } catch (error) {
    app.log.error(error);
    process.exitCode = 1;
  }
}
