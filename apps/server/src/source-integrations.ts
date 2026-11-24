import type {
  MediaType,
  MessageDescriptor,
  LibrarySourceConnectorOptionResponse,
  LibrarySourceKind,
  MediaTypeOrigin,
} from "@peridot/contracts";
import type { CredentialStore } from "./credential-store.js";

export type LibrarySourceConnectorConfiguration = Record<string, string>;

export interface LibrarySourceConnectorHandle {
  id: string;
  kind: LibrarySourceKind;
  name: string | null;
  configuration: LibrarySourceConnectorConfiguration;
  credentials: LibrarySourceConnectorConfiguration;
}

export interface ValidatedIntegrationSource {
  identity: string;
  name: string;
  configuration: LibrarySourceConnectorConfiguration;
  credentials: LibrarySourceConnectorConfiguration;
}

export interface LibrarySourceConnectorDiscoveryInput {
  configuration: LibrarySourceConnectorConfiguration;
  credentials: LibrarySourceConnectorConfiguration;
  signal?: AbortSignal;
}

export interface LibrarySourceConnectorValidationInput {
  configuration: LibrarySourceConnectorConfiguration;
  credentials: LibrarySourceConnectorConfiguration;
  signal?: AbortSignal;
}

export interface LibrarySourceTrackRecord {
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
  mediaTypeOrigin: MediaTypeOrigin;
  discNumber: number | null;
  trackNumber: number | null;
  durationMs: number | null;
  publishedAt: Date | null;
  fileSizeBytes: bigint;
  fileModifiedAt: Date;
  mimeType: string;
  container: string;
  recordingIdentityKeys: readonly string[];
  audioLossless: boolean;
  audioBitrate: number | null;
  cover: {
    itemId: string;
    tag: string | null;
  } | null;
}

export interface LibrarySourceScanPage {
  items: readonly LibrarySourceTrackRecord[];
  unsupportedCount: number;
  processedCount: number;
  totalCount: number | null;
}

export interface LibrarySourceScanInput {
  source: LibrarySourceConnectorHandle;
  signal: AbortSignal;
  onPage(page: LibrarySourceScanPage): Promise<void> | void;
}

export interface LibrarySourceArtworkInput {
  source: LibrarySourceConnectorHandle;
  reference: {
    itemId: string;
    tag: string | null;
  };
  signal: AbortSignal;
}

export interface LibrarySourceArtwork {
  data: Uint8Array;
  mimeType: string;
}

export interface LibrarySourcePlaybackInput {
  source: LibrarySourceConnectorHandle;
  externalId: string;
  container: string | null;
  range: string | undefined;
  method: "GET" | "HEAD";
  signal: AbortSignal;
}

export type LibrarySourceConnectorErrorCode =
  | "invalid_configuration"
  | "invalid_credentials"
  | "unavailable"
  | "invalid_response"
  | "unsupported";

export class LibrarySourceConnectorError extends Error {
  constructor(
    message: string,
    readonly code: LibrarySourceConnectorErrorCode,
    readonly statusCode = 400,
    readonly messageDescriptor?: MessageDescriptor,
  ) {
    super(message);
    this.name = "LibrarySourceConnectorError";
  }
}

export interface LibrarySourceConnectorDefinition {
  kind: string;
  discover(
    input: LibrarySourceConnectorDiscoveryInput,
  ): Promise<LibrarySourceConnectorOptionResponse[]>;
  validateSource(
    input: LibrarySourceConnectorValidationInput,
  ): Promise<ValidatedIntegrationSource>;
  scan(input: LibrarySourceScanInput): Promise<void>;
  artwork(
    input: LibrarySourceArtworkInput,
  ): Promise<LibrarySourceArtwork | null>;
  openAudio(input: LibrarySourcePlaybackInput): Promise<Response>;
}

export class LibrarySourceConnectorRegistry {
  private readonly definitions = new Map<
    string,
    LibrarySourceConnectorDefinition
  >();

  constructor(definitions: readonly LibrarySourceConnectorDefinition[]) {
    for (const definition of definitions) {
      if (this.definitions.has(definition.kind)) {
        throw new Error(`Duplicate source integration: ${definition.kind}`);
      }
      this.definitions.set(definition.kind, definition);
    }
  }

  definition(kind: string): LibrarySourceConnectorDefinition {
    const definition = this.definitions.get(kind);
    if (!definition) {
      throw new LibrarySourceConnectorError(
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
): LibrarySourceConnectorConfiguration {
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

export class LibrarySourceConnectorService {
  constructor(
    readonly registry: LibrarySourceConnectorRegistry,
    private readonly credentials: CredentialStore,
  ) {}

  definition(kind: string): LibrarySourceConnectorDefinition {
    return this.registry.definition(kind);
  }

  discover(kind: string, input: LibrarySourceConnectorDiscoveryInput) {
    return this.definition(kind).discover(input);
  }

  validateSource(kind: string, input: LibrarySourceConnectorValidationInput) {
    return this.definition(kind).validateSource(input);
  }

  sourceHandle(source: {
    id: string;
    kind: string;
    name: string | null;
    configuration: string | null;
    credentialCiphertext: string | null;
  }): LibrarySourceConnectorHandle {
    return {
      id: source.id,
      kind: source.kind as LibrarySourceKind,
      name: source.name,
      configuration: configurationValue(source.configuration),
      credentials: source.credentialCiphertext
        ? configurationValue(
            this.credentials.decrypt(
              source.credentialCiphertext,
              "library-source",
            ),
          )
        : {},
    };
  }
}
