import Fastify from "fastify";
import type { HealthResponse } from "@peridot/contracts";

export function buildApp() {
  const app = Fastify({ logger: true });
  app.get("/api/health", async (): Promise<HealthResponse> => ({
    status: "ok",
    service: "peridot",
  }));
  return app;
}
