import type {
  ConnectorDescriptorResponse,
  ConnectorRole,
  LibrarySourceKind,
  MediaType,
  MetadataProviderKind,
} from "@peridot/contracts";
import type { ConnectorInstanceDiscoveryCapability } from "./connector-instance-discovery.js";
import type { MetadataResolver } from "./metadata-resolver.js";
import { createQbittorrentInstanceDiscovery } from "./qbittorrent-discovery.js";
import type { LibrarySourceConnectorDefinition } from "./source-integrations.js";

export interface ConnectorDefinition {
  kind: string;
  role: ConnectorRole;
  name: string;
  capabilities: readonly string[];
}

export interface ReleaseSearchCapability {
  readonly kind: string;
}

export interface DownloadTransferCapability {
  readonly kind: string;
}

export interface PlaylistReferenceCapability {
  readonly kind: string;
  listPlaylists(
    account: PlaylistAccountHandle,
    signal?: AbortSignal,
  ): Promise<Array<{ id: string; title: string; itemCount: number | null }>>;
  readPlaylist(
    account: PlaylistAccountHandle,
    id: string,
    signal?: AbortSignal,
  ): Promise<{
    title?: string | null;
    version?: string | null;
    items: Array<{
      externalTrackId: string;
      title: string;
      artist: string;
      album: string | null;
      durationMs: number | null;
      isrc: string | null;
    }>;
  }>;
}

export interface PlaylistAccountHandle {
  id: string;
  kind: string;
  name: string;
  configuration: Record<string, string>;
  credentials: Record<string, string>;
}

export interface MetadataProviderCapability {
  readonly kind: MetadataProviderKind;
  readonly resolver: MetadataResolver;
}

export interface PathLibrarySourceCapability {
  readonly kind: "path";
  readonly pathBased: true;
}

export interface ConnectorRuntimeDefinition extends ConnectorDefinition {
  instanceDiscovery?: ConnectorInstanceDiscoveryCapability;
  librarySource?:
    LibrarySourceConnectorDefinition | PathLibrarySourceCapability;
  releaseSearch?: ReleaseSearchCapability;
  downloadTransfer?: DownloadTransferCapability;
  playlistReference?: PlaylistReferenceCapability;
  metadataProvider?: MetadataProviderCapability;
}

type CapabilityForRole<Role extends ConnectorRole> =
  Role extends "library-source"
    ? "librarySource"
    : Role extends "release-indexer"
      ? "releaseSearch"
      : Role extends "download-client"
        ? "downloadTransfer"
        : Role extends "metadata-provider"
          ? "metadataProvider"
          : Role extends "playlist-account"
            ? "playlistReference"
            : never;

export type RoleConnector<Role extends ConnectorRole> =
  ConnectorRuntimeDefinition & {
    role: Role;
  } & Required<Pick<ConnectorRuntimeDefinition, CapabilityForRole<Role>>>;

function hasRoleCapability(definition: ConnectorRuntimeDefinition): boolean {
  switch (definition.role) {
    case "library-source":
      return definition.librarySource !== undefined;
    case "release-indexer":
      return definition.releaseSearch !== undefined;
    case "download-client":
      return definition.downloadTransfer !== undefined;
    case "metadata-provider":
      return definition.metadataProvider !== undefined;
    case "playlist-account":
      return definition.playlistReference !== undefined;
  }
}

export class ConnectorRegistry {
  private readonly definitions = new Map<string, ConnectorRuntimeDefinition>();

  register(definition: ConnectorRuntimeDefinition): this {
    if (this.definitions.has(definition.kind)) {
      throw new Error(`Duplicate connector: ${definition.kind}`);
    }
    if (!definition.kind.trim() || !definition.name.trim()) {
      throw new Error("Connector kind and name are required.");
    }
    if (!hasRoleCapability(definition)) {
      throw new Error(
        `Connector "${definition.kind}" does not implement the ${definition.role} capability.`,
      );
    }
    if (!definition.capabilities.length) {
      throw new Error(
        `Connector "${definition.kind}" must declare at least one capability.`,
      );
    }
    this.definitions.set(definition.kind, definition);
    return this;
  }

  get(kind: string): ConnectorRuntimeDefinition | null {
    return this.definitions.get(kind) ?? null;
  }

  getForRole<Role extends ConnectorRole>(
    kind: string,
    role: Role,
  ): RoleConnector<Role> | null {
    const definition = this.get(kind);
    return definition?.role === role
      ? (definition as RoleConnector<Role>)
      : null;
  }

  require<Role extends ConnectorRole>(
    kind: string,
    role: Role,
  ): RoleConnector<Role> {
    const definition = this.getForRole(kind, role);
    if (!definition) {
      throw new Error(`Connector "${kind}" is not registered as ${role}.`);
    }
    return definition;
  }

  forRole<Role extends ConnectorRole>(role: Role): RoleConnector<Role>[] {
    return [...this.definitions.values()].filter(
      (definition): definition is RoleConnector<Role> =>
        definition.role === role,
    );
  }

  descriptors(): ConnectorDescriptorResponse[] {
    return [...this.definitions.values()].map((definition) => ({
      kind: definition.kind,
      role: definition.role,
      name: definition.name,
      capabilities: [...definition.capabilities],
    }));
  }

  releaseSearchConnectors(): Array<RoleConnector<"release-indexer">> {
    return this.forRole("release-indexer");
  }

  librarySourceConnectors(): Array<RoleConnector<"library-source">> {
    return this.forRole("library-source");
  }

  downloadClientConnectors(): Array<RoleConnector<"download-client">> {
    return this.forRole("download-client");
  }

  metadataProviderConnectors(): Array<RoleConnector<"metadata-provider">> {
    return this.forRole("metadata-provider");
  }

  playlistAccountConnectors(): Array<RoleConnector<"playlist-account">> {
    return this.forRole("playlist-account");
  }
}

export function librarySourceConnectorDefinition(
  definition: LibrarySourceConnectorDefinition,
): ConnectorRuntimeDefinition {
  const capabilities = [
    "scan",
    "artwork",
    "playback",
    ...(definition.instanceDiscovery ? ["instance-discovery"] : []),
  ];
  return {
    kind: definition.kind,
    role: "library-source",
    name:
      definition.kind === "jellyfin"
        ? "Jellyfin"
        : definition.kind === "path"
          ? "Folder"
          : definition.kind,
    capabilities,
    ...(definition.instanceDiscovery
      ? { instanceDiscovery: definition.instanceDiscovery }
      : {}),
    librarySource: definition,
  };
}

export const SUPPORTED_MEDIA_TYPES: readonly MediaType[] = [
  "music",
  "audiobook",
  "podcast",
];

export const SUPPORTED_LIBRARY_SOURCE_KINDS: readonly LibrarySourceKind[] = [
  "path",
  "jellyfin",
];

export function pathLibrarySourceConnectorDefinition(): ConnectorRuntimeDefinition {
  return {
    kind: "path",
    role: "library-source",
    name: "Folder",
    capabilities: ["scan", "playback"],
    librarySource: { kind: "path", pathBased: true },
  };
}

export function createConnectorRegistry(
  connectors: readonly ConnectorRuntimeDefinition[],
): ConnectorRegistry {
  const registry = new ConnectorRegistry();
  for (const connector of connectors) registry.register(connector);
  return registry;
}

export function metadataProviderConnectorDefinition(
  resolver: MetadataResolver,
): ConnectorRuntimeDefinition {
  return {
    kind: resolver.definition.kind,
    role: "metadata-provider",
    name:
      resolver.definition.kind === "musicbrainz" ? "MusicBrainz" : "Discogs",
    capabilities: ["metadata"],
    metadataProvider: {
      kind: resolver.definition.kind,
      resolver,
    },
  };
}

export function torznabConnectorDefinition(): ConnectorRuntimeDefinition {
  return {
    kind: "torznab",
    role: "release-indexer",
    name: "Torznab",
    capabilities: ["release-search"],
    releaseSearch: { kind: "torznab" },
  };
}

export function qBittorrentConnectorDefinition(
  options: { fetch?: typeof fetch } = {},
): ConnectorRuntimeDefinition {
  const instanceDiscovery = createQbittorrentInstanceDiscovery(
    options.fetch ?? fetch,
  );
  return {
    kind: "qbittorrent",
    role: "download-client",
    name: "qBittorrent",
    capabilities: ["transfer", "instance-discovery"],
    instanceDiscovery,
    downloadTransfer: { kind: "qbittorrent" },
  };
}
