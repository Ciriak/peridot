import type { QueueResponse, ReplaceQueueRequest } from "@peridot/contracts";
import type { FastifyInstance } from "fastify";
import type { Database } from "./database.js";
import { sendError } from "./http.js";

const MAX_TRACK_ID_LENGTH = 200;

interface QueueSnapshot {
  trackIds: string[];
  activeTrackId: string | null;
  shuffleEnabled: boolean;
  shuffleTrackIds: string[];
}

function parseTrackId(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized.length > 0 && normalized.length <= MAX_TRACK_ID_LENGTH
    ? normalized
    : null;
}

function parseQueue(body: unknown): QueueSnapshot | null {
  if (!body || typeof body !== "object") return null;
  const request = body as Partial<ReplaceQueueRequest>;
  if (!Array.isArray(request.trackIds)) return null;
  const trackIds = request.trackIds.map(parseTrackId);
  if (trackIds.some((trackId) => trackId === null)) return null;
  const normalizedTrackIds = trackIds as string[];
  if (new Set(normalizedTrackIds).size !== normalizedTrackIds.length) {
    return null;
  }

  const activeTrackId =
    request.activeTrackId === undefined
      ? (normalizedTrackIds[0] ?? null)
      : request.activeTrackId === null
        ? null
        : parseTrackId(request.activeTrackId);
  if (activeTrackId === null && normalizedTrackIds.length > 0) return null;
  if (activeTrackId !== null && !normalizedTrackIds.includes(activeTrackId)) {
    return null;
  }

  const shuffleEnabled = request.shuffleEnabled ?? false;
  if (typeof shuffleEnabled !== "boolean") return null;
  const shuffleTrackIds = request.shuffleTrackIds ?? [];
  if (!Array.isArray(shuffleTrackIds)) return null;
  const normalizedShuffleTrackIds = shuffleTrackIds.map(parseTrackId);
  if (normalizedShuffleTrackIds.some((trackId) => trackId === null)) {
    return null;
  }
  const shuffleIds = normalizedShuffleTrackIds as string[];
  if (new Set(shuffleIds).size !== shuffleIds.length) return null;
  if (
    (!shuffleEnabled && shuffleIds.length > 0) ||
    shuffleIds.some(
      (trackId) =>
        trackId === activeTrackId || !normalizedTrackIds.includes(trackId),
    )
  ) {
    return null;
  }

  return {
    trackIds: normalizedTrackIds,
    activeTrackId,
    shuffleEnabled,
    shuffleTrackIds: shuffleIds,
  };
}

async function listQueue(
  database: Database,
  userId: string,
): Promise<QueueResponse> {
  const [items, state] = await Promise.all([
    database.orm.QueueItem.where({ userId })
      .select("trackId", "randomPosition")
      .orderBy((item) => item.position.asc())
      .all(),
    database.orm.QueueState.where({ userId }).first(),
  ]);
  const trackIds = items.map((item) => item.trackId);
  const shuffleTrackIds = items
    .filter(
      (
        item,
      ): item is typeof item & {
        randomPosition: number;
      } => item.randomPosition !== null,
    )
    .sort((left, right) => left.randomPosition - right.randomPosition)
    .map((item) => item.trackId);
  const savedActiveTrackId = state?.activeTrackId ?? null;
  const activeTrackId =
    savedActiveTrackId && trackIds.includes(savedActiveTrackId)
      ? savedActiveTrackId
      : (trackIds[0] ?? null);
  return {
    trackIds,
    activeTrackId,
    shuffleEnabled: Boolean(state?.shuffleEnabled),
    shuffleTrackIds,
  };
}

export async function registerQueueRoutes(
  app: FastifyInstance,
  database: Database,
) {
  app.get("/api/queue", async (request): Promise<QueueResponse> => {
    return listQueue(database, request.authenticatedUser!.id);
  });

  app.put<{ Body: unknown }>("/api/queue", async (request, reply) => {
    const queue = parseQueue(request.body);
    if (!queue) {
      return sendError(
        reply,
        400,
        "invalid_queue",
        "Queue state must reference unique catalog tracks with a valid active and random pool.",
      );
    }

    const existingTracks =
      queue.trackIds.length > 0
        ? await database.orm.Track.where((track) => track.id.in(queue.trackIds))
            .select("id")
            .all()
        : [];
    if (existingTracks.length !== queue.trackIds.length) {
      return sendError(
        reply,
        400,
        "invalid_queue",
        "Queue contains a track that is not in the catalog.",
      );
    }

    const userId = request.authenticatedUser!.id;
    const randomPositions = new Map(
      queue.shuffleTrackIds.map((trackId, position) => [trackId, position]),
    );
    await database.transaction(async (transaction) => {
      await transaction.orm.QueueState.where({ userId }).deleteAndCount();
      await transaction.orm.QueueItem.where({ userId }).deleteAndCount();
      for (const [position, trackId] of queue.trackIds.entries()) {
        await transaction.orm.QueueItem.create({
          userId,
          trackId,
          position,
          randomPosition: randomPositions.get(trackId) ?? null,
        });
      }
      if (queue.activeTrackId || queue.shuffleEnabled) {
        await transaction.orm.QueueState.create({
          userId,
          activeTrackId: queue.activeTrackId,
          shuffleEnabled: queue.shuffleEnabled ? 1 : 0,
        });
      }
    });
    return listQueue(database, userId);
  });
}
