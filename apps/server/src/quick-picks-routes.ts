import type {
  QuickPickListResponse,
  QuickPickItemResponse,
  RecordTrackPlayResponse,
} from "@peridot/contracts";
import type { FastifyInstance } from "fastify";
import type { CatalogService } from "./catalog.js";
import type { Database } from "./database.js";
import { canonicalTrack } from "./duplicate-resolver.js";
import { sendError } from "./http.js";
import { message } from "./messages.js";
import { rankQuickPicks } from "./quick-picks.js";

export async function registerQuickPickRoutes(
  app: FastifyInstance,
  database: Database,
  catalog: CatalogService,
) {
  app.post<{ Params: { id: string } }>(
    "/api/tracks/:id/plays",
    async (request, reply) => {
      const track = await canonicalTrack(database, request.params.id);
      if (!track?.available) {
        return sendError(
          reply,
          404,
          "track_not_found",
          "Available track not found",
          message("api.message.trackNotFound"),
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
      const eventTrackIds = [...new Set(events.map((event) => event.trackId))];
      let projectionRows = eventTrackIds.length
        ? await database.orm.CatalogTrack.where((track) =>
            track.id.in(eventTrackIds),
          ).all()
        : [];
      const projectedIds = new Set(projectionRows.map((track) => track.id));
      const missingProjectionIds = eventTrackIds.filter(
        (trackId) => !projectedIds.has(trackId),
      );
      for (const trackId of missingProjectionIds) {
        await catalog.reindexTrack(trackId, "source");
      }
      if (missingProjectionIds.length) {
        projectionRows = await database.orm.CatalogTrack.where((track) =>
          track.id.in(eventTrackIds),
        ).all();
      }
      const projectedTracks = new Map(
        projectionRows.map((track) => [track.id, track]),
      );
      const enrichedEvents = events.map((event) => {
        const projected = projectedTracks.get(event.trackId);
        return {
          ...event,
          track: {
            ...event.track,
            album: projected?.album ?? event.track.album,
            albumArtist: projected?.albumArtist || null,
            albumId: projected?.albumId ?? null,
          },
        };
      });
      const ranked = rankQuickPicks(enrichedEvents, new Date());
      const trackIds = ranked.flatMap((item) =>
        item.kind === "track" ? [item.trackId] : [],
      );
      const tracks = new Map(
        (
          await catalog.resolveTracks(trackIds, request.authenticatedUser!.id)
        ).items.map((track) => [track.id, track]),
      );
      const albumTrackIds = new Map(
        enrichedEvents.flatMap((event) =>
          event.track.albumId
            ? [[event.track.albumId, event.track.id] as const]
            : [],
        ),
      );
      const items: QuickPickItemResponse[] = [];
      for (const item of ranked) {
        if (item.kind === "track") {
          const track = tracks.get(item.trackId);
          if (track) items.push({ ...item, track });
          continue;
        }
        const { albumId } = item;
        let album = await catalog.album(albumId, request.authenticatedUser!.id);
        const representativeTrackId = albumTrackIds.get(albumId);
        if (!album && representativeTrackId) {
          await catalog.reindexTrack(representativeTrackId, "source");
          album = await catalog.album(albumId, request.authenticatedUser!.id);
        }
        if (album) {
          items.push({
            ...item,
            title: album.title,
            artist: album.artist,
            album,
          });
        }
      }
      return {
        items,
      };
    },
  );
}
