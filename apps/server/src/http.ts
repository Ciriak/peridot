import type { FastifyReply } from "fastify";
import type { ApiErrorResponse } from "@peridot/contracts";

export function sendError(
  reply: FastifyReply,
  statusCode: number,
  code: string,
  message: string,
) {
  const body: ApiErrorResponse = { error: { code, message } };
  return reply.code(statusCode).type("application/json").send(body);
}
