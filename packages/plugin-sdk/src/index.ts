import type {
  MediaType,
  MessageDescriptor,
  PluginCapability,
  PluginConfigurationFieldDefinition,
  PluginContributionKind,
  PluginInstallSource,
  PluginRecommendationCandidate,
  PluginRecommendationMethod,
  PluginSourceDiscoveryDefinition,
  PluginSourceOptionResponse,
  PluginTrackReference,
  TaskDetailResponse,
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
  configurationFields: readonly PluginConfigurationFieldDefinition[];
  discovery: PluginSourceDiscoveryDefinition | null;
}

export interface PluginDisplayContribution {
  kind: "display";
}

export interface PluginDataProcessorTaskContribution {
  id: string;
  titleMessage: MessageDescriptor;
}

export interface PluginDataProcessorContribution {
  kind: "data-processor";
  tasks: readonly PluginDataProcessorTaskContribution[];
}

export type PluginContribution =
  | PluginSourceContribution
  | PluginRecommendationContribution
  | PluginPlaylistGeneratorContribution
  | PluginDataProcessorContribution
  | PluginDisplayContribution;

export interface PluginDefinition {
  manifest: PluginManifest;
  contributions: readonly PluginContribution[];
  settingsFields?: readonly PluginConfigurationFieldDefinition[];
  source?: PluginSourceAdapter;
  recommendationProvider?: PluginRecommendationProvider;
  playlistGenerator?: PluginPlaylistGenerator;
  dataProcessor?: PluginDataProcessor;
}

export interface PluginInstallation {
  pluginId: string;
  installed: boolean;
  installedAt: Date | null;
  installSource: PluginInstallSource;
  installSourceLocator: string;
  version: string;
}

export interface PluginConfiguration {
  [key: string]: string;
}

export type PluginSourceConfiguration = PluginConfiguration;

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
  | "not_configured"
  | "invalid_credentials"
  | "unavailable"
  | "invalid_response"
  | "unsupported"
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

export interface PluginRecommendationContribution {
  kind: "recommendation-provider";
  methods: readonly PluginRecommendationMethod[];
}

export interface PluginPlaylistGeneratorContribution {
  kind: "playlist-generator";
  supportsPrompt: boolean;
  supportsSeed: boolean;
}

export interface PluginRuntimeContext {
  configuration: PluginConfiguration;
  credentials: PluginConfiguration;
  signal?: AbortSignal;
}

export interface PluginSimilarTracksInput extends PluginRuntimeContext {
  seed: PluginTrackReference;
  limit: number;
}

export interface PluginForYouTracksInput extends PluginRuntimeContext {
  recentTracks: readonly PluginTrackReference[];
  likedTracks: readonly PluginTrackReference[];
  limit: number;
}

export interface PluginGeneratePlaylistInput extends PluginRuntimeContext {
  name: string | null;
  prompt: string | null;
  seed: PluginTrackReference | null;
  recentTracks: readonly PluginTrackReference[];
  likedTracks: readonly PluginTrackReference[];
  limit: number;
}

export interface PluginGeneratedPlaylist {
  name: string | null;
  items: readonly PluginRecommendationCandidate[];
}

export interface PluginRecommendationProvider {
  contribution: PluginRecommendationContribution;
  similar?(
    input: PluginSimilarTracksInput,
  ): Promise<readonly PluginRecommendationCandidate[]>;
  forYou?(
    input: PluginForYouTracksInput,
  ): Promise<readonly PluginRecommendationCandidate[]>;
}

export interface PluginPlaylistGenerator {
  contribution: PluginPlaylistGeneratorContribution;
  generate(
    input: PluginGeneratePlaylistInput,
  ): Promise<PluginGeneratedPlaylist>;
}

export interface PluginTaskProgress {
  update(
    completed: number | null,
    total: number | null,
    details?: readonly TaskDetailResponse[],
  ): Promise<void>;
}

export interface PluginTaskRunInput extends PluginRuntimeContext {
  progress: PluginTaskProgress;
}

export interface PluginTaskResult {
  details?: readonly TaskDetailResponse[];
  failureSummary?: string | null;
}

export interface PluginDataProcessorTask {
  contribution: PluginDataProcessorTaskContribution;
  run(input: PluginTaskRunInput): Promise<PluginTaskResult | void>;
}

export interface PluginDataProcessor {
  contribution: PluginDataProcessorContribution;
  tasks: readonly PluginDataProcessorTask[];
}
