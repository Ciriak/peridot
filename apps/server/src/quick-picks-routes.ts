import type {
  QuickPickListResponse,
  QuickPickItemResponse,
  RecordTrackPlayResponse,
} from "@peridot/contracts";
import type { FastifyInstance } from "fastify";
import { catalogAlbumId, type CatalogService } from "./catalog.js";
import type { Database } from "./database.js";
import { sendError } from "./http.js";
import { rankQuickPicks } from "./quick-picks.js";

export async function registerQuickPickRoutes(
  app: FastifyInstance,
  database: Database,
  catalog: CatalogService,
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
      const ranked = rankQuickPicks(events, new Date());
      const trackIds = ranked.flatMap((item) =>
        item.kind === "track" ? [item.trackId] : [],
      );
      const tracks = new Map(
        (
          await catalog.resolveTracks(trackIds, request.authenticatedUser!.id)
        ).items.map((track) => [track.id, track]),
      );
      const albumTrackIds = new Map(
        events.flatMap((event) => {
          const title = (
            event.track.metadataAlbum ?? event.track.album
          )?.trim();
          const artist = (
            event.track.metadataArtist ?? event.track.artist
          ).trim();
          return title && artist
            ? [[catalogAlbumId(artist, title), event.track.id] as const]
            : [];
        }),
      );
      const items: QuickPickItemResponse[] = [];
      for (const item of ranked) {
        if (item.kind === "track") {
          const track = tracks.get(item.trackId);
          if (track) items.push({ ...item, track });
          continue;
        }
        const albumId = catalogAlbumId(item.artist, item.title);
        let album = await catalog.album(albumId, request.authenticatedUser!.id);
        const representativeTrackId = albumTrackIds.get(albumId);
        if (!album && representativeTrackId) {
          await catalog.reindexTrack(representativeTrackId, "source");
          album = await catalog.album(albumId, request.authenticatedUser!.id);
        }
        if (album) items.push({ ...item, album });
      }
      return {
        items,
      };
    },
  );
}
