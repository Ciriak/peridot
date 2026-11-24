import type {
  QuickPickListResponse,
  QuickPickItemResponse,
  RecordMediaPlayResponse,
} from "@peridot/contracts";
import type { FastifyInstance } from "fastify";
import type { CatalogService } from "./catalog.js";
import type { Database } from "./database.js";
import { canonicalMedia } from "./media-resolver.js";
import { sendError } from "./http.js";
import { message } from "./messages.js";
import { rankQuickPicks } from "./quick-picks.js";

export async function registerQuickPickRoutes(
  app: FastifyInstance,
  database: Database,
  catalog: CatalogService,
) {
  app.post<{ Params: { id: string } }>(
    "/api/media/:id/plays",
    async (request, reply) => {
      const media = await canonicalMedia(database, request.params.id);
      if (!media?.available) {
        return sendError(
          reply,
          404,
          "media_not_found",
          "Available media not found",
          message("api.message.trackNotFound"),
        );
      }
      const event = await database.orm.MediaPlayEvent.create({
        userId: request.authenticatedUser!.id,
        mediaId: media.id,
      });
      const response: RecordMediaPlayResponse = {
        mediaId: event.mediaId,
        playedAt: event.playedAt.toISOString(),
      };
      return reply.code(201).send(response);
    },
  );

  app.get(
    "/api/quick-picks",
    async (request): Promise<QuickPickListResponse> => {
      const events = await database.orm.MediaPlayEvent.where({
        userId: request.authenticatedUser!.id,
      })
        .include("media")
        .all();
      const eventTrackIds = [...new Set(events.map((event) => event.mediaId))];
      let projectionRows = eventTrackIds.length
        ? await database.orm.CatalogMedia.where((track) =>
            track.id.in(eventTrackIds),
          ).all()
        : [];
      const projectedIds = new Set(projectionRows.map((track) => track.id));
      const missingProjectionIds = eventTrackIds.filter(
        (mediaId) => !projectedIds.has(mediaId),
      );
      for (const mediaId of missingProjectionIds) {
        await catalog.reindexMedia(mediaId, "source");
      }
      if (missingProjectionIds.length) {
        projectionRows = await database.orm.CatalogMedia.where((track) =>
          track.id.in(eventTrackIds),
        ).all();
      }
      const projectedTracks = new Map(
        projectionRows.map((track) => [track.id, track]),
      );
      const enrichedEvents = events.map((event) => {
        const projected = projectedTracks.get(event.mediaId);
        return {
          ...event,
          media: {
            ...event.media,
            album: projected?.album ?? event.media.album,
            albumArtist: projected?.albumArtist || null,
            albumId: projected?.albumId ?? null,
          },
        };
      });
      const ranked = rankQuickPicks(enrichedEvents, new Date());
      const mediaIds = ranked.flatMap((item) =>
        item.kind === "media" ? [item.mediaId] : [],
      );
      const tracks = new Map(
        (
          await catalog.resolveMedia(mediaIds, request.authenticatedUser!.id)
        ).items.map((track) => [track.id, track]),
      );
      const albumTrackIds = new Map(
        enrichedEvents.flatMap((event) =>
          event.media.albumId
            ? [[event.media.albumId, event.media.id] as const]
            : [],
        ),
      );
      const items: QuickPickItemResponse[] = [];
      for (const item of ranked) {
        if (item.kind === "media") {
          const media = tracks.get(item.mediaId);
          if (media) items.push({ ...item, media });
          continue;
        }
        const { albumId } = item;
        let album = await catalog.album(albumId, request.authenticatedUser!.id);
        const representativeTrackId = albumTrackIds.get(albumId);
        if (!album && representativeTrackId) {
          await catalog.reindexMedia(representativeTrackId, "source");
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
