import { buildApp } from "./app.js";
import { DEFAULT_SERVER_PORT } from "./config.js";

export async function startServer(
  environment: NodeJS.ProcessEnv = process.env,
): Promise<void> {
  const app = await buildApp();
  const port = Number(environment.PORT ?? DEFAULT_SERVER_PORT);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error("PORT must be an integer between 1 and 65535");
  }
  for (const signal of ["SIGINT", "SIGTERM"] as const) {
    process.once(signal, () => {
      void app.close();
    });
  }
  try {
    await app.listen({ port, host: environment.HOST ?? "127.0.0.1" });
  } catch (error) {
    app.log.error(error);
    process.exitCode = 1;
  }
}
