import type {
  MessageDescriptor,
  MetadataCandidateResponse,
  MetadataProviderDefinitionResponse,
  MetadataProviderKind,
  TrackMetadataDetail,
} from "@peridot/contracts";
import { message } from "./messages.js";

export interface MetadataTrackInput {
  id: string;
  title: string;
  artist: string;
  album: string | null;
  discNumber: number | null;
  trackNumber: number | null;
  durationMs: number | null;
}

export interface MetadataProviderContext {
  id: string;
  kind: MetadataProviderKind;
  name: string;
  configuration: Record<string, string>;
  credential: string | null;
}

export type AutomaticMatchResult =
  | { status: "matched"; candidate: MetadataCandidateResponse }
  | { status: "ambiguous" }
  | { status: "unmatched" };

export interface MetadataResolver {
  readonly definition: MetadataProviderDefinitionResponse;

  normalizeConfiguration(value: unknown): Record<string, string>;

  validateCredential(
    provider: MetadataProviderContext,
    credential: string,
    signal?: AbortSignal,
  ): Promise<string>;

  findAlbumMatches(
    provider: MetadataProviderContext,
    targets: readonly MetadataTrackInput[],
    signal?: AbortSignal,
  ): Promise<Map<string, MetadataCandidateResponse[]>>;

  findCandidates(
    provider: MetadataProviderContext,
    track: MetadataTrackInput,
    query?: string,
    signal?: AbortSignal,
  ): Promise<MetadataCandidateResponse[]>;

  automaticMatch(
    track: MetadataTrackInput,
    candidates: readonly MetadataCandidateResponse[],
  ): AutomaticMatchResult;

  sourceUrl(externalTrackId: string, externalReleaseId: string | null): string;
}

export function metadataProviderName(kind: MetadataProviderKind): string {
  return kind === "musicbrainz" ? "MusicBrainz" : "Discogs";
}

export class MetadataResolverError extends Error {
  constructor(
    message: string,
    readonly statusCode = 502,
    readonly retryable = true,
    readonly messageDescriptor?: MessageDescriptor,
  ) {
    super(message);
    this.name = "MetadataResolverError";
  }
}

export class MetadataResolverRegistry {
  private readonly resolvers = new Map<
    MetadataProviderKind,
    MetadataResolver
  >();

  register(resolver: MetadataResolver): this {
    const kind = resolver.definition.kind;
    if (this.resolvers.has(kind)) {
      throw new Error(`Metadata resolver ${kind} is already registered.`);
    }
    this.resolvers.set(kind, resolver);
    return this;
  }

  get(kind: string): MetadataResolver | null {
    return this.resolvers.get(kind as MetadataProviderKind) ?? null;
  }

  require(kind: string): MetadataResolver {
    const resolver = this.get(kind);
    if (!resolver) {
      throw new MetadataResolverError(
        `Metadata provider "${kind}" is not supported.`,
        400,
        false,
        message("api.message.invalidMetadataProvider"),
      );
    }
    return resolver;
  }

  definitions(): MetadataProviderDefinitionResponse[] {
    return [...this.resolvers.values()].map((resolver) =>
      structuredClone(resolver.definition),
    );
  }
}

export function candidateIdentity(
  candidate: MetadataCandidateResponse,
): string {
  return [
    candidate.providerId,
    candidate.externalTrackId,
    candidate.externalReleaseId ?? "",
  ].join("\u0000");
}

export function candidateDetails(
  details: readonly TrackMetadataDetail[],
): TrackMetadataDetail[] {
  return details.map((detail) => ({ ...detail }));
}
