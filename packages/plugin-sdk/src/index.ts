import type {
  MediaType,
  MessageDescriptor,
  PluginCapability,
  PluginContributionKind,
  PluginInstallSource,
  PluginSourceDiscoveryDefinition,
  PluginSourceFieldDefinition,
  PluginSourceOptionResponse,
  TrackMediaTypeOrigin,
} from "@peridot/contracts";

export type {
  PluginCapability,
  PluginContributionKind,
  PluginInstallSource,
} from "@peridot/contracts";

export interface PluginManifest {
  id: string;
  name: string;
  descriptionMessage: MessageDescriptor;
  version: string;
  sdkVersion: string;
  capabilities: readonly PluginCapability[];
  permissions: readonly string[];
  contributionKinds: readonly PluginContributionKind[];
  installSource: PluginInstallSource;
  installSourceLocator: string;
  icon: string | null;
}

export interface PluginSourceContribution {
  kind: "source";
  configurationFields: readonly PluginSourceFieldDefinition[];
  discovery: PluginSourceDiscoveryDefinition | null;
}

export interface PluginCapabilityContribution {
  kind: Exclude<PluginContributionKind, "source">;
}

export type PluginContribution =
  PluginSourceContribution | PluginCapabilityContribution;

export interface PluginDefinition {
  manifest: PluginManifest;
  contributions: readonly PluginContribution[];
  source?: PluginSourceAdapter;
}

export interface PluginInstallation {
  pluginId: string;
  installed: boolean;
  installedAt: Date | null;
  installSource: PluginInstallSource;
  installSourceLocator: string;
  version: string;
}

export interface PluginSourceConfiguration {
  [key: string]: string;
}

export interface PluginSourceHandle {
  id: string;
  name: string | null;
  configuration: PluginSourceConfiguration;
  credentials: PluginSourceConfiguration;
}

export interface PluginValidatedSource {
  identity: string;
  name: string;
  configuration: PluginSourceConfiguration;
  credentials: PluginSourceConfiguration;
}

export interface PluginSourceDiscoveryInput {
  configuration: PluginSourceConfiguration;
  signal?: AbortSignal;
}

export interface PluginSourceValidationInput {
  configuration: PluginSourceConfiguration;
  signal?: AbortSignal;
}

export interface PluginTrackRecord {
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

export interface PluginScanPage {
  items: readonly PluginTrackRecord[];
  unsupportedCount: number;
  processedCount: number;
  totalCount: number | null;
}

export interface PluginScanInput {
  source: PluginSourceHandle;
  signal: AbortSignal;
  onPage(page: PluginScanPage): Promise<void> | void;
}

export interface PluginArtworkReference {
  itemId: string;
  tag: string | null;
}

export interface PluginArtwork {
  data: Uint8Array;
  mimeType: string;
}

export interface PluginArtworkInput {
  source: PluginSourceHandle;
  reference: PluginArtworkReference;
  signal: AbortSignal;
}

export interface PluginPlaybackInput {
  source: PluginSourceHandle;
  externalId: string;
  container: string | null;
  range: string | undefined;
  method: "GET" | "HEAD";
  signal: AbortSignal;
}

export type PluginErrorCode =
  | "invalid_configuration"
  | "invalid_credentials"
  | "unavailable"
  | "invalid_response"
  | "not_installed"
  | "confirmation_required";

export class PluginError extends Error {
  constructor(
    message: string,
    readonly code: PluginErrorCode,
    readonly statusCode = 400,
    readonly messageDescriptor?: MessageDescriptor,
  ) {
    super(message);
    this.name = "PluginError";
  }
}

export interface PluginSourceAdapter {
  contribution: PluginSourceContribution;
  discover(
    input: PluginSourceDiscoveryInput,
  ): Promise<PluginSourceOptionResponse[]>;
  validateSource(
    input: PluginSourceValidationInput,
  ): Promise<PluginValidatedSource>;
  scan(input: PluginScanInput): Promise<void>;
  artwork(input: PluginArtworkInput): Promise<PluginArtwork | null>;
  openAudio(input: PluginPlaybackInput): Promise<Response>;
}
