import type {
  MediaType,
  MessageDescriptor,
  SourceIntegrationKind,
  SourceIntegrationOptionResponse,
  TrackMediaTypeOrigin,
} from "@peridot/contracts";
import type { CredentialStore } from "./credential-store.js";

export type SourceIntegrationConfiguration = Record<string, string>;

export interface SourceIntegrationHandle {
  id: string;
  kind: SourceIntegrationKind;
  name: string | null;
  configuration: SourceIntegrationConfiguration;
  credentials: SourceIntegrationConfiguration;
}

export interface ValidatedIntegrationSource {
  identity: string;
  name: string;
  configuration: SourceIntegrationConfiguration;
  credentials: SourceIntegrationConfiguration;
}

export interface SourceIntegrationDiscoveryInput {
  configuration: SourceIntegrationConfiguration;
  credentials: SourceIntegrationConfiguration;
  signal?: AbortSignal;
}

export interface SourceIntegrationValidationInput {
  configuration: SourceIntegrationConfiguration;
  credentials: SourceIntegrationConfiguration;
  signal?: AbortSignal;
}

export interface SourceIntegrationTrackRecord {
  externalId: string;
  externalVersion: string;
  relativePath: string;
  title: string;
  artists: readonly string[];
  albumArtist: string | null;
  albumArtists: readonly string[];
  album: string | null;
  genres: readonly string[];
  mediaType: MediaType;
  mediaTypeOrigin: TrackMediaTypeOrigin;
  discNumber: number | null;
  trackNumber: number | null;
  durationMs: number | null;
  publishedAt: Date | null;
  fileSizeBytes: bigint;
  fileModifiedAt: Date;
  mimeType: string;
  container: string;
  cover: {
    itemId: string;
    tag: string | null;
  } | null;
}

export interface SourceIntegrationScanPage {
  items: readonly SourceIntegrationTrackRecord[];
  unsupportedCount: number;
  processedCount: number;
  totalCount: number | null;
}

export interface SourceIntegrationScanInput {
  source: SourceIntegrationHandle;
  signal: AbortSignal;
  onPage(page: SourceIntegrationScanPage): Promise<void> | void;
}

export interface SourceIntegrationArtworkInput {
  source: SourceIntegrationHandle;
  reference: {
    itemId: string;
    tag: string | null;
  };
  signal: AbortSignal;
}

export interface SourceIntegrationArtwork {
  data: Uint8Array;
  mimeType: string;
}

export interface SourceIntegrationPlaybackInput {
  source: SourceIntegrationHandle;
  externalId: string;
  container: string | null;
  range: string | undefined;
  method: "GET" | "HEAD";
  signal: AbortSignal;
}

export type SourceIntegrationErrorCode =
  | "invalid_configuration"
  | "invalid_credentials"
  | "unavailable"
  | "invalid_response"
  | "unsupported";

export class SourceIntegrationError extends Error {
  constructor(
    message: string,
    readonly code: SourceIntegrationErrorCode,
    readonly statusCode = 400,
    readonly messageDescriptor?: MessageDescriptor,
  ) {
    super(message);
    this.name = "SourceIntegrationError";
  }
}

export interface SourceIntegrationDefinition {
  kind: string;
  discover(
    input: SourceIntegrationDiscoveryInput,
  ): Promise<SourceIntegrationOptionResponse[]>;
  validateSource(
    input: SourceIntegrationValidationInput,
  ): Promise<ValidatedIntegrationSource>;
  scan(input: SourceIntegrationScanInput): Promise<void>;
  artwork(
    input: SourceIntegrationArtworkInput,
  ): Promise<SourceIntegrationArtwork | null>;
  openAudio(input: SourceIntegrationPlaybackInput): Promise<Response>;
}

export class SourceIntegrationRegistry {
  private readonly definitions = new Map<string, SourceIntegrationDefinition>();

  constructor(definitions: readonly SourceIntegrationDefinition[]) {
    for (const definition of definitions) {
      if (this.definitions.has(definition.kind)) {
        throw new Error(`Duplicate source integration: ${definition.kind}`);
      }
      this.definitions.set(definition.kind, definition);
    }
  }

  definition(kind: string): SourceIntegrationDefinition {
    const definition = this.definitions.get(kind);
    if (!definition) {
      throw new SourceIntegrationError(
        "Source integration not found.",
        "invalid_configuration",
        404,
      );
    }
    return definition;
  }

  has(kind: string): boolean {
    return this.definitions.has(kind);
  }
}

function configurationValue(
  value: string | null,
): SourceIntegrationConfiguration {
  if (!value) return {};
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return {};
    }
    return Object.fromEntries(
      Object.entries(parsed)
        .filter(
          (entry): entry is [string, string] => typeof entry[1] === "string",
        )
        .slice(0, 64),
    );
  } catch {
    return {};
  }
}

export class SourceIntegrationService {
  constructor(
    readonly registry: SourceIntegrationRegistry,
    private readonly credentials: CredentialStore,
  ) {}

  definition(kind: string): SourceIntegrationDefinition {
    return this.registry.definition(kind);
  }

  discover(kind: string, input: SourceIntegrationDiscoveryInput) {
    return this.definition(kind).discover(input);
  }

  validateSource(kind: string, input: SourceIntegrationValidationInput) {
    return this.definition(kind).validateSource(input);
  }

  sourceHandle(source: {
    id: string;
    kind: string;
    name: string | null;
    configuration: string | null;
    credentialCiphertext: string | null;
  }): SourceIntegrationHandle {
    return {
      id: source.id,
      kind: source.kind as SourceIntegrationKind,
      name: source.name,
      configuration: configurationValue(source.configuration),
      credentials: source.credentialCiphertext
        ? configurationValue(
            this.credentials.decrypt(source.credentialCiphertext, "source"),
          )
        : {},
    };
  }
}
