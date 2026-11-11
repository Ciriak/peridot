import type {
  QuickPickListResponse,
  RecordTrackPlayResponse,
} from "@peridot/contracts";
import type { FastifyInstance } from "fastify";
import type { Database } from "./database.js";
import { sendError } from "./http.js";
import { rankQuickPicks } from "./quick-picks.js";

export async function registerQuickPickRoutes(
  app: FastifyInstance,
  database: Database,
) {
  app.post<{ Params: { id: string } }>(
    "/api/tracks/:id/plays",
    async (request, reply) => {
      const track = await database.orm.Track.select("id", "available").first({
        id: request.params.id,
      });
      if (!track?.available) {
        return sendError(
          reply,
          404,
          "track_not_found",
          "Available track not found",
        );
      }
      const event = await database.orm.TrackPlayEvent.create({
        userId: request.authenticatedUser!.id,
        trackId: track.id,
      });
      const response: RecordTrackPlayResponse = {
        trackId: event.trackId,
        playedAt: event.playedAt.toISOString(),
      };
      return reply.code(201).send(response);
    },
  );

  app.get(
    "/api/quick-picks",
    async (request): Promise<QuickPickListResponse> => {
      const events = await database.orm.TrackPlayEvent.where({
        userId: request.authenticatedUser!.id,
      })
        .include("track")
        .all();
      return {
        items: rankQuickPicks(events, new Date()),
      };
    },
  );
}
