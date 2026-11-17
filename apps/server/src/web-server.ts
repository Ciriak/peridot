import { stat } from "node:fs/promises";
import type { FastifyInstance } from "fastify";
import fastifyStatic from "@fastify/static";

export interface WebApplicationOptions {
  webRoot: string;
}

export async function registerWebApplication(
  app: FastifyInstance,
  options: WebApplicationOptions,
) {
  const rootStat = await stat(options.webRoot).catch(() => null);
  if (!rootStat?.isDirectory()) {
    throw new Error(
      `The built web application was not found at ${options.webRoot}. Run the web build before starting the embedded UI.`,
    );
  }

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
}
