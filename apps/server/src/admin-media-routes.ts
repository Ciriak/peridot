import type {
  AdminMediaAvailabilityFilter,
  AdminMediaCopyCountFilter,
  AdminMediaFilter,
  AdminMediaListQuery,
  AdminMediaLosslessFilter,
  AdminMediaManualFilter,
  AdminMediaMissingFilter,
  AdminMediaMetadataFilter,
  AdminMediaSortField,
  CreateAdminMediaCopyRequest,
  CreateAdminMediaRequest,
  UpdateAdminMediaCopyRequest,
  UpdateAdminMediaRequest,
} from "@peridot/contracts";
import type { FastifyInstance, FastifyReply } from "fastify";
import {
  AdminMediaError,
  createAdminMedia,
  createAdminMediaCopy,
  deleteAdminMedia,
  deleteAdminMediaCopy,
  listAdminMedia,
  resetAdminMediaCopyField,
  resetAdminMediaField,
  updateAdminMedia,
  updateAdminMediaCopy,
} from "./admin-media.js";
import type { CatalogService } from "./catalog.js";
import type { Database } from "./database.js";
import { sendError } from "./http.js";
import { message } from "./messages.js";

type QueryValue = string | undefined;

interface AdminMediaQueryString {
  page?: QueryValue;
  pageSize?: QueryValue;
  query?: QueryValue;
  mediaType?: QueryValue;
  availability?: QueryValue;
  sourceId?: QueryValue;
  metadataState?: QueryValue;
  providerId?: QueryValue;
  copyCount?: QueryValue;
  lossless?: QueryValue;
  mimeType?: QueryValue;
  minBitrate?: QueryValue;
  maxBitrate?: QueryValue;
  minFileSizeBytes?: QueryValue;
  maxFileSizeBytes?: QueryValue;
  missing?: QueryValue;
  manual?: QueryValue;
  publishedFrom?: QueryValue;
  publishedTo?: QueryValue;
  fileModifiedFrom?: QueryValue;
  fileModifiedTo?: QueryValue;
  sort?: QueryValue;
  direction?: QueryValue;
}

function numberQuery(value: QueryValue, label: string): number | undefined {
  if (value === undefined || value === "") return undefined;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    throw new AdminMediaError(`${label} must be a number.`);
  }
  return parsed;
}

function integerQuery(value: QueryValue, label: string): number | undefined {
  const parsed = numberQuery(value, label);
  if (parsed !== undefined && !Number.isSafeInteger(parsed)) {
    throw new AdminMediaError(`${label} must be a whole number.`);
  }
  return parsed;
}

function enumQuery<T extends string>(
  value: QueryValue,
  allowed: readonly T[],
  fallback: T,
): T {
  return allowed.includes(value as T) ? (value as T) : fallback;
}

const MEDIA_FILTERS: readonly AdminMediaFilter[] = [
  "all",
  "music",
  "audiobook",
  "podcast",
];
const AVAILABILITY_FILTERS: readonly AdminMediaAvailabilityFilter[] = [
  "all",
  "available",
  "unavailable",
];
const METADATA_FILTERS: readonly AdminMediaMetadataFilter[] = [
  "all",
  "matched",
  "unmatched",
  "manual",
  "file",
];
const COPY_COUNT_FILTERS: readonly AdminMediaCopyCountFilter[] = [
  "any",
  "zero",
  "one",
  "multiple",
];
const LOSSLESS_FILTERS: readonly AdminMediaLosslessFilter[] = [
  "any",
  "true",
  "false",
];
const MISSING_FILTERS: readonly AdminMediaMissingFilter[] = [
  "none",
  "album",
  "genres",
  "duration",
  "publishedAt",
  "cover",
  "metadata",
  "copy",
];
const MANUAL_FILTERS: readonly AdminMediaManualFilter[] = [
  "any",
  "none",
  "media",
  "copy",
];
const SORT_FIELDS: readonly AdminMediaSortField[] = [
  "title",
  "artist",
  "album",
  "mediaType",
  "available",
  "duration",
  "published",
  "copyCount",
  "createdAt",
  "updatedAt",
];

function listQuery(input: AdminMediaQueryString): AdminMediaListQuery {
  const pageSize = integerQuery(input.pageSize, "Page size");
  const values: Record<string, unknown> = {
    page: integerQuery(input.page, "Page"),
    pageSize:
      pageSize === 25 || pageSize === 50 || pageSize === 100 ? pageSize : 25,
    query: input.query?.trim().slice(0, 200) || undefined,
    mediaType: enumQuery(input.mediaType, MEDIA_FILTERS, "all"),
    availability: enumQuery(input.availability, AVAILABILITY_FILTERS, "all"),
    sourceId: input.sourceId?.trim() || undefined,
    metadataState: enumQuery(input.metadataState, METADATA_FILTERS, "all"),
    providerId: input.providerId?.trim() || undefined,
    copyCount: enumQuery(input.copyCount, COPY_COUNT_FILTERS, "any"),
    lossless: enumQuery(input.lossless, LOSSLESS_FILTERS, "any"),
    mimeType: input.mimeType?.trim() || undefined,
    minBitrate: integerQuery(input.minBitrate, "Minimum bitrate"),
    maxBitrate: integerQuery(input.maxBitrate, "Maximum bitrate"),
    minFileSizeBytes: input.minFileSizeBytes?.trim() || undefined,
    maxFileSizeBytes: input.maxFileSizeBytes?.trim() || undefined,
    missing: enumQuery(input.missing, MISSING_FILTERS, "none"),
    manual: enumQuery(input.manual, MANUAL_FILTERS, "any"),
    publishedFrom: input.publishedFrom?.trim() || undefined,
    publishedTo: input.publishedTo?.trim() || undefined,
    fileModifiedFrom: input.fileModifiedFrom?.trim() || undefined,
    fileModifiedTo: input.fileModifiedTo?.trim() || undefined,
    sort: enumQuery(input.sort, SORT_FIELDS, "updatedAt"),
    direction: input.direction === "asc" ? "asc" : "desc",
  };
  return Object.fromEntries(
    Object.entries(values).filter(([, value]) => value !== undefined),
  ) as unknown as AdminMediaListQuery;
}

function handleError(reply: FastifyReply, error: unknown) {
  if (error instanceof AdminMediaError) {
    return sendError(
      reply,
      error.statusCode,
      error.code,
      error.message,
      message("error.requestRejected"),
    );
  }
  throw error;
}

export async function registerAdminMediaRoutes(
  app: FastifyInstance,
  database: Database,
  catalog: CatalogService,
) {
  app.get<{ Querystring: AdminMediaQueryString }>(
    "/api/admin/medias",
    async (request, reply) => {
      try {
        return await listAdminMedia(database, listQuery(request.query));
      } catch (error) {
        return handleError(reply, error);
      }
    },
  );

  app.post<{ Body: CreateAdminMediaRequest }>(
    "/api/admin/medias",
    async (request, reply) => {
      try {
        return reply
          .code(201)
          .send(await createAdminMedia(database, catalog, request.body));
      } catch (error) {
        return handleError(reply, error);
      }
    },
  );

  app.patch<{
    Params: { mediaId: string };
    Body: UpdateAdminMediaRequest;
  }>("/api/admin/medias/:mediaId", async (request, reply) => {
    try {
      return await updateAdminMedia(
        database,
        catalog,
        request.params.mediaId,
        request.body?.field,
        request.body?.value,
        request.body?.expectedUpdatedAt,
      );
    } catch (error) {
      return handleError(reply, error);
    }
  });

  app.delete<{
    Params: { mediaId: string };
  }>("/api/admin/medias/:mediaId", async (request, reply) => {
    try {
      await deleteAdminMedia(database, catalog, request.params.mediaId);
      return reply.code(204).send();
    } catch (error) {
      return handleError(reply, error);
    }
  });

  app.delete<{
    Params: { mediaId: string; field: string };
    Querystring: { expectedUpdatedAt?: string };
  }>("/api/admin/medias/:mediaId/overrides/:field", async (request, reply) => {
    try {
      return await resetAdminMediaField(
        database,
        catalog,
        request.params.mediaId,
        request.params.field,
        request.query.expectedUpdatedAt ?? "",
      );
    } catch (error) {
      return handleError(reply, error);
    }
  });

  app.post<{
    Params: { mediaId: string };
    Body: CreateAdminMediaCopyRequest;
  }>("/api/admin/medias/:mediaId/copies", async (request, reply) => {
    try {
      return reply
        .code(201)
        .send(
          await createAdminMediaCopy(
            database,
            catalog,
            request.params.mediaId,
            request.body,
          ),
        );
    } catch (error) {
      return handleError(reply, error);
    }
  });

  app.patch<{
    Params: { mediaId: string; copyId: string };
    Body: UpdateAdminMediaCopyRequest;
  }>("/api/admin/medias/:mediaId/copies/:copyId", async (request, reply) => {
    try {
      return await updateAdminMediaCopy(
        database,
        catalog,
        request.params.mediaId,
        request.params.copyId,
        request.body?.field,
        request.body?.value,
        request.body?.expectedUpdatedAt,
      );
    } catch (error) {
      return handleError(reply, error);
    }
  });

  app.delete<{
    Params: { mediaId: string; copyId: string; field: string };
    Querystring: { expectedUpdatedAt?: string };
  }>(
    "/api/admin/medias/:mediaId/copies/:copyId/overrides/:field",
    async (request, reply) => {
      try {
        return await resetAdminMediaCopyField(
          database,
          catalog,
          request.params.mediaId,
          request.params.copyId,
          request.params.field,
          request.query.expectedUpdatedAt ?? "",
        );
      } catch (error) {
        return handleError(reply, error);
      }
    },
  );

  app.delete<{
    Params: { mediaId: string; copyId: string };
  }>("/api/admin/medias/:mediaId/copies/:copyId", async (request, reply) => {
    try {
      return await deleteAdminMediaCopy(
        database,
        catalog,
        request.params.mediaId,
        request.params.copyId,
      );
    } catch (error) {
      return handleError(reply, error);
    }
  });
}
