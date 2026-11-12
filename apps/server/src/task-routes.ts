import type { TaskListResponse } from "@peridot/contracts";
import type { FastifyInstance } from "fastify";
import { sendError } from "./http.js";
import { message } from "./messages.js";
import { toTaskResponse, type TaskService } from "./tasks.js";

const MAX_TASK_PAGE_SIZE = 100;

export async function registerTaskRoutes(
  app: FastifyInstance,
  tasks: TaskService,
) {
  app.get<{
    Querystring: { status?: string; limit?: string; offset?: string };
  }>("/api/tasks", async (request, reply) => {
    const status = request.query.status ?? "all";
    if (!["all", "active", "terminal"].includes(status)) {
      return sendError(
        reply,
        400,
        "invalid_task_status",
        "status must be all, active, or terminal",
        message("api.message.invalidTaskStatus"),
      );
    }
    const limit = Number(request.query.limit ?? 50);
    const offset = Number(request.query.offset ?? 0);
    if (
      !Number.isSafeInteger(limit) ||
      limit < 1 ||
      limit > MAX_TASK_PAGE_SIZE ||
      !Number.isSafeInteger(offset) ||
      offset < 0
    ) {
      return sendError(
        reply,
        400,
        "invalid_task_page",
        `limit must be between 1 and ${MAX_TASK_PAGE_SIZE}, and offset must be non-negative`,
        message("api.message.invalidTaskPage"),
      );
    }
    const result = await tasks.list(status as "all" | "active" | "terminal");
    return {
      ...result,
      items: result.items.slice(offset, offset + limit),
    } satisfies TaskListResponse;
  });

  app.get<{ Params: { id: string } }>(
    "/api/tasks/:id",
    async (request, reply) => {
      const task = await tasks.get(request.params.id);
      if (!task) {
        return sendError(
          reply,
          404,
          "task_not_found",
          "Task not found",
          message("api.message.taskNotFound"),
        );
      }
      return toTaskResponse(task);
    },
  );
}
