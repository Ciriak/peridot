import type {
  AlbumListResponse,
  ArtistListResponse,
  ResolveTracksRequest,
  ResolveTracksResponse,
  TrackListResponse,
} from "@peridot/contracts";
import type { FastifyInstance } from "fastify";
import { CatalogError, type CatalogService } from "./catalog.js";
import { sendError } from "./http.js";
import { message } from "./messages.js";

interface CursorQuery {
  cursor?: string;
  limit?: string;
  sort?: string;
  direction?: string;
  query?: string;
  availability?: string;
  albumId?: string;
  artistId?: string;
  liked?: string;
}

function limitNumber(value: string | undefined): number | undefined {
  if (value === undefined) return undefined;
  const limit = Number(value);
  return Number.isSafeInteger(limit) ? limit : NaN;
}

function handleCatalogError(
  reply: Parameters<typeof sendError>[0],
  error: unknown,
) {
  if (error instanceof CatalogError) {
    sendError(
      reply,
      error.code === "stale_catalog_cursor" ? 409 : 400,
      error.code,
      error.message,
      error.messageDescriptor,
    );
    return undefined;
  }
  throw error;
}

export async function registerCatalogRoutes(
  app: FastifyInstance,
  catalog: CatalogService,
) {
  app.get<{ Querystring: CursorQuery }>(
    "/api/tracks",
    async (request, reply): Promise<TrackListResponse | undefined> => {
      try {
        const { limit: rawLimit, ...query } = request.query;
        const limit = limitNumber(rawLimit);
        return await catalog.listTracks({
          userId: request.authenticatedUser!.id,
          ...query,
          ...(limit === undefined ? {} : { limit }),
        });
      } catch (error) {
        return handleCatalogError(reply, error);
      }
    },
  );

  app.post<{ Body: ResolveTracksRequest }>(
    "/api/tracks/resolve",
    async (request, reply): Promise<ResolveTracksResponse | undefined> => {
      const ids = request.body?.ids;
      if (
        !Array.isArray(ids) ||
        ids.some((id) => typeof id !== "string" || !id.trim()) ||
        ids.length > 500
      ) {
        return sendError(
          reply,
          400,
          "invalid_catalog_query",
          "ids must contain at most 500 non-empty track IDs",
          message("api.message.invalidTrackResolve"),
        );
      }
      try {
        return await catalog.resolveTracks(ids, request.authenticatedUser!.id);
      } catch (error) {
        return handleCatalogError(reply, error);
      }
    },
  );

  app.get<{ Querystring: CursorQuery }>(
    "/api/albums",
    async (request, reply): Promise<AlbumListResponse | undefined> => {
      try {
        const { limit: rawLimit, ...query } = request.query;
        const limit = limitNumber(rawLimit);
        return await catalog.listAlbums({
          userId: request.authenticatedUser!.id,
          ...query,
          ...(limit === undefined ? {} : { limit }),
        });
      } catch (error) {
        return handleCatalogError(reply, error);
      }
    },
  );

  app.get<{ Params: { id: string } }>(
    "/api/albums/:id",
    async (request, reply) => {
      const album = await catalog.album(
        request.params.id,
        request.authenticatedUser!.id,
      );
      if (!album) {
        return sendError(
          reply,
          404,
          "album_not_found",
          "Album not found",
          message("api.message.albumNotFound"),
        );
      }
      return album;
    },
  );

  app.get<{ Querystring: CursorQuery }>(
    "/api/artists",
    async (request, reply): Promise<ArtistListResponse | undefined> => {
      try {
        const { limit: rawLimit, ...query } = request.query;
        const limit = limitNumber(rawLimit);
        return await catalog.listArtists({
          userId: request.authenticatedUser!.id,
          ...query,
          ...(limit === undefined ? {} : { limit }),
        });
      } catch (error) {
        return handleCatalogError(reply, error);
      }
    },
  );

  app.get<{ Params: { id: string } }>(
    "/api/artists/:id",
    async (request, reply) => {
      const artist = await catalog.artist(
        request.params.id,
        request.authenticatedUser!.id,
      );
      if (!artist) {
        return sendError(
          reply,
          404,
          "artist_not_found",
          "Artist not found",
          message("api.message.artistNotFound"),
        );
      }
      return artist;
    },
  );

  const sendArtistImage = async (
    request: { params: { id: string } },
    reply: Parameters<typeof sendError>[0],
    head: boolean,
  ) => {
    const image = await catalog.artistImage(request.params.id);
    if (!image) {
      return sendError(
        reply,
        404,
        "artist_image_not_found",
        "Artist image not found",
        message("api.message.artistImageNotFound"),
      );
    }
    const data = Buffer.from(image.data);
    reply
      .header("Cache-Control", "private, max-age=14400")
      .header("Content-Length", data.byteLength)
      .header("Content-Type", image.mimeType);
    return head ? reply.send() : reply.send(data);
  };

  app.get<{ Params: { id: string } }>(
    "/api/artists/:id/image",
    { exposeHeadRoute: false },
    async (request, reply) => sendArtistImage(request, reply, false),
  );
  app.head<{ Params: { id: string } }>(
    "/api/artists/:id/image",
    async (request, reply) => sendArtistImage(request, reply, true),
  );
}
