import type { FastifyReply } from "fastify";
import type { ApiErrorResponse, MessageDescriptor } from "@peridot/contracts";
import { message } from "./messages.js";

const CODE_MESSAGE_KEYS: Record<string, string> = {
  admin_required: "api.message.adminRequired",
  album_not_found: "api.message.albumNotFound",
  artist_not_found: "api.message.artistNotFound",
  cover_not_found: "api.message.coverNotFound",
  display_name_taken: "api.message.displayNameTaken",
  invalid_admin_user: "api.message.invalidAdminUser",
  invalid_credentials: "api.message.invalidCredentials",
  invalid_display_name: "api.message.invalidDisplayName",
  invalid_queue: "api.message.invalidQueue",
  invalid_range: "api.message.invalidRange",
  invalid_search: "api.message.invalidSearch",
  invalid_source: "api.message.sourceInvalid",
  invalid_task_page: "api.message.invalidTaskPage",
  invalid_task_status: "api.message.invalidTaskStatus",
  metadata_provider_not_found: "api.message.metadataProviderNotFound",
  metadata_reset_in_progress: "api.message.metadataResetInProgress",
  setup_complete: "api.message.setupComplete",
  setup_required: "api.message.setupRequired",
  source_not_found: "api.message.sourceNotFound",
  source_not_rescanable: "api.message.sourceNotRescanable",
  task_not_found: "api.message.taskNotFound",
  track_not_found: "api.message.trackNotFound",
  unauthorized: "api.message.unauthorized",
};

export function sendError(
  reply: FastifyReply,
  statusCode: number,
  code: string,
  _fallbackMessage: string,
  messageDescriptor?: MessageDescriptor | null,
) {
  const descriptor =
    messageDescriptor ??
    message(CODE_MESSAGE_KEYS[code] ?? "error.requestRejected");
  const body: ApiErrorResponse = {
    error: { code, messageDescriptor: descriptor },
  };
  return reply.code(statusCode).type("application/json").send(body);
}
