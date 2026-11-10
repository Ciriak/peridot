import type { QueueResponse, ReplaceQueueRequest } from "@peridot/contracts";
import type { FastifyInstance } from "fastify";
import type { Database } from "./database.js";
import { sendError } from "./http.js";

const MAX_TRACK_ID_LENGTH = 200;

function parseTrackIds(body: unknown): string[] | null {
  if (!body || typeof body !== "object") return null;
  const trackIds = (body as Partial<ReplaceQueueRequest>).trackIds;
  if (
    !Array.isArray(trackIds) ||
    trackIds.some(
      (trackId) =>
        typeof trackId !== "string" ||
        trackId.trim().length === 0 ||
        trackId.trim().length > MAX_TRACK_ID_LENGTH,
    )
  ) {
    return null;
  }
  const normalized = trackIds.map((trackId) => trackId.trim());
  return new Set(normalized).size === normalized.length ? normalized : null;
}

async function listQueue(
  database: Database,
  userId: string,
): Promise<QueueResponse> {
  const items = await database.queueItem.findMany({
    where: { userId },
    orderBy: { position: "asc" },
    select: { trackId: true },
  });
  return { trackIds: items.map((item) => item.trackId) };
}

export async function registerQueueRoutes(
  app: FastifyInstance,
  database: Database,
) {
  app.get("/api/queue", async (request): Promise<QueueResponse> => {
    return listQueue(database, request.authenticatedUser!.id);
  });

  app.put<{ Body: unknown }>("/api/queue", async (request, reply) => {
    const trackIds = parseTrackIds(request.body);
    if (!trackIds) {
      return sendError(
        reply,
        400,
        "invalid_queue",
        "Queue order must be a unique list of track ids.",
      );
    }

    const existingTracks =
      trackIds.length > 0
        ? await database.track.findMany({
            where: { id: { in: trackIds } },
            select: { id: true },
          })
        : [];
    if (existingTracks.length !== trackIds.length) {
      return sendError(
        reply,
        400,
        "invalid_queue",
        "Queue contains a track that is not in the catalog.",
      );
    }

    const userId = request.authenticatedUser!.id;
    await database.$transaction(async (transaction) => {
      await transaction.queueItem.deleteMany({ where: { userId } });
      if (trackIds.length) {
        await transaction.queueItem.createMany({
          data: trackIds.map((trackId, position) => ({
            userId,
            trackId,
            position,
          })),
        });
      }
    });
    return listQueue(database, userId);
  });
}
