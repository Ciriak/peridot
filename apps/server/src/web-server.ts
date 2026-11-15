import { stat } from "node:fs/promises";
import Fastify from "fastify";
import httpProxy from "@fastify/http-proxy";
import fastifyStatic from "@fastify/static";

export interface WebServerOptions {
  apiBaseUrl: string;
  webRoot: string;
  logger?: boolean;
}

export async function buildWebServer(options: WebServerOptions) {
  const rootStat = await stat(options.webRoot).catch(() => null);
  if (!rootStat?.isDirectory()) {
    throw new Error(
      `The built web application was not found at ${options.webRoot}. Run the web build before starting the embedded UI.`,
    );
  }

  const app = Fastify({
    logger:
      options.logger === false
        ? false
        : {
            level: "info",
          },
  });

  await app.register(httpProxy, {
    upstream: options.apiBaseUrl,
    prefix: "/api",
    rewritePrefix: "/api",
    websocket: true,
  });
  await app.register(fastifyStatic, {
    root: options.webRoot,
    index: "index.html",
  });
  app.setNotFoundHandler((request, reply) => {
    if (request.url.startsWith("/api/")) {
      return reply.code(404).send({
        error: {
          code: "route_not_found",
          message: "API route not found.",
        },
      });
    }
    if (request.method !== "GET" && request.method !== "HEAD") {
      return reply.code(404).send({ error: "Route not found." });
    }
    return reply.sendFile("200.html");
  });

  return app;
}
