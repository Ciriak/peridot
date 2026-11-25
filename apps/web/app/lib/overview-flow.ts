import { Position, type Edge, type Node } from "@xyflow/vue";
import type {
  LibrarySourceKind,
  MetadataProviderKind,
  OverviewConnectionStatus,
  OverviewDownloadClientResponse,
  OverviewLibrarySourceResponse,
  OverviewMetadataProviderResponse,
  OverviewReleaseIndexerResponse,
  OverviewServiceCounts,
} from "@peridot/contracts";

export interface OverviewNodeData extends Record<string, unknown> {
  view:
    | "peridot"
    | "library-source"
    | "metadata-provider"
    | "release-indexer"
    | "download-client";
  name: string;
  address: string;
  fileCount: number | null;
  status: OverviewConnectionStatus | "checking";
  kind:
    LibrarySourceKind | MetadataProviderKind | "qbittorrent" | "torznab" | null;
  handleType: "source" | "target" | null;
  sourcePosition: Position | null;
  targetHandles: string[];
  sourceHandles: string[];
  serviceCounts: OverviewServiceCounts | null;
}

export interface OverviewSubflowNodeData extends Record<string, unknown> {
  view:
    | "library-source-subflow"
    | "metadata-provider-subflow"
    | "release-indexer-subflow"
    | "download-client-subflow";
}

export type OverviewFlowNode = Node<OverviewNodeData>;
export type OverviewSubflowNode = Node<OverviewSubflowNodeData>;
export type OverviewDiagramNode = OverviewFlowNode | OverviewSubflowNode;
export type OverviewFlowEdge = Edge;

export interface OverviewConnectionPositions {
  sourcePosition: Position;
  targetPosition: Position;
  sourceHandle: string;
  targetHandle: string;
}

const CONNECTION_COLUMN_X = 480;
const LIBRARY_SOURCE_GROUP_X = -CONNECTION_COLUMN_X;
const METADATA_PROVIDER_GROUP_X = CONNECTION_COLUMN_X;
const LIBRARY_SOURCE_GROUP_WIDTH = 304;
const CONNECTION_ROW_GAP = 108;
const GROUP_VERTICAL_PADDING = 100;
const DOWNLOAD_CLIENT_GROUP_TOP = 160;

function centeredRowY(index: number, count: number): number {
  return (index - (count - 1) / 2) * CONNECTION_ROW_GAP;
}

function destinationSourceMappings(
  sources: readonly OverviewLibrarySourceResponse[],
  clients: readonly OverviewDownloadClientResponse[],
) {
  const sourceById = new Map(sources.map((source) => [source.id, source]));
  return new Map(
    clients.flatMap((client) => {
      const source = client.destinationSourceId
        ? sourceById.get(client.destinationSourceId)
        : undefined;
      return source ? [[client.id, source.id] as const] : [];
    }),
  );
}

export function overviewSubflowHeight(sourceCount: number): number {
  return Math.max(
    200,
    (Math.max(sourceCount, 1) - 1) * CONNECTION_ROW_GAP +
      GROUP_VERTICAL_PADDING * 2,
  );
}

export function overviewConnectionPositions(position: {
  x: number;
  y: number;
}): OverviewConnectionPositions {
  if (Math.abs(position.x) >= Math.abs(position.y)) {
    const sourcePosition = position.x >= 0 ? Position.Left : Position.Right;
    const targetPosition = position.x >= 0 ? Position.Right : Position.Left;
    return {
      sourcePosition,
      targetPosition,
      sourceHandle: "source",
      targetHandle: `peridot-${targetPosition}`,
    };
  }
  const sourcePosition = position.y >= 0 ? Position.Top : Position.Bottom;
  const targetPosition = position.y >= 0 ? Position.Bottom : Position.Top;
  return {
    sourcePosition,
    targetPosition,
    sourceHandle: "source",
    targetHandle: `peridot-${targetPosition}`,
  };
}

export function overviewNodes(
  sources: readonly OverviewLibrarySourceResponse[],
  providers: readonly OverviewMetadataProviderResponse[],
  indexers: readonly OverviewReleaseIndexerResponse[],
  clients: readonly OverviewDownloadClientResponse[],
  serviceCounts: OverviewServiceCounts,
  peridotAddress: string,
  peridotStatus: OverviewConnectionStatus,
): OverviewDiagramNode[] {
  const clientsById = new Map(clients.map((client) => [client.id, client]));
  const destinationSourceByClient = destinationSourceMappings(sources, clients);
  const destinationSourceIds = new Set(destinationSourceByClient.values());
  const clientsWithIndexers = new Set(
    indexers.flatMap((indexer) =>
      indexer.downloadClientId && clientsById.has(indexer.downloadClientId)
        ? [indexer.downloadClientId]
        : [],
    ),
  );
  const fallbackClients = clients.filter(
    (client) => !destinationSourceByClient.has(client.id),
  );
  const fallbackIndexers = indexers.filter(
    (indexer) =>
      !indexer.downloadClientId || !clientsById.has(indexer.downloadClientId),
  );
  const nodes: OverviewDiagramNode[] = [
    {
      id: "peridot",
      type: "overview",
      position: { x: 0, y: 0 },
      data: {
        view: "peridot",
        name: "Peridot",
        address: peridotAddress,
        fileCount: sources.reduce(
          (total, source) => total + source.fileCount,
          0,
        ),
        status: peridotStatus,
        kind: null,
        handleType: null,
        sourcePosition: null,
        targetHandles: [
          ...(sources.length ? ["peridot-left"] : []),
          ...(providers.length || fallbackIndexers.length
            ? ["peridot-right"]
            : []),
        ],
        sourceHandles: fallbackClients.length
          ? ["peridot-download-client"]
          : [],
        serviceCounts,
      },
    },
  ];

  if (sources.length) {
    nodes.push({
      id: "library-source-subflow",
      type: "subflow",
      position: { x: LIBRARY_SOURCE_GROUP_X, y: 0 },
      width: LIBRARY_SOURCE_GROUP_WIDTH,
      height: overviewSubflowHeight(sources.length),
      draggable: false,
      selectable: false,
      zIndex: -1,
      data: {
        view: "library-source-subflow",
      },
    });
  }
  if (providers.length) {
    nodes.push({
      id: "metadata-provider-subflow",
      type: "subflow",
      position: { x: METADATA_PROVIDER_GROUP_X, y: 0 },
      width: LIBRARY_SOURCE_GROUP_WIDTH,
      height: overviewSubflowHeight(providers.length),
      draggable: false,
      selectable: false,
      zIndex: -1,
      data: {
        view: "metadata-provider-subflow",
      },
    });
  }
  const releaseIndexerGroupHeight = overviewSubflowHeight(indexers.length);
  const releaseIndexerGroupY =
    DOWNLOAD_CLIENT_GROUP_TOP + releaseIndexerGroupHeight / 2;
  if (indexers.length) {
    nodes.push({
      id: "release-indexer-subflow",
      type: "subflow",
      position: { x: METADATA_PROVIDER_GROUP_X, y: releaseIndexerGroupY },
      width: LIBRARY_SOURCE_GROUP_WIDTH,
      height: releaseIndexerGroupHeight,
      draggable: false,
      selectable: false,
      zIndex: -1,
      data: {
        view: "release-indexer-subflow",
      },
    });
  }
  const downloadClientGroupHeight = overviewSubflowHeight(clients.length);
  const downloadClientGroupY =
    DOWNLOAD_CLIENT_GROUP_TOP + downloadClientGroupHeight / 2;
  if (clients.length) {
    nodes.push({
      id: "download-client-subflow",
      type: "subflow",
      position: { x: 0, y: downloadClientGroupY },
      width: LIBRARY_SOURCE_GROUP_WIDTH,
      height: downloadClientGroupHeight,
      draggable: false,
      selectable: false,
      zIndex: -1,
      data: {
        view: "download-client-subflow",
      },
    });
  }

  for (const [index, source] of sources.entries()) {
    nodes.push({
      id: `source-${source.id}`,
      type: "overview",
      position: {
        x: LIBRARY_SOURCE_GROUP_X,
        y: centeredRowY(index, sources.length),
      },
      data: {
        view: "library-source",
        name: source.name,
        address: source.address,
        fileCount: source.fileCount,
        status: source.status,
        kind: source.kind as LibrarySourceKind | MetadataProviderKind,
        handleType: "source",
        sourcePosition: Position.Right,
        targetHandles: destinationSourceIds.has(source.id)
          ? ["download-destination"]
          : [],
        sourceHandles: [],
        serviceCounts: null,
      },
    });
  }
  for (const [index, provider] of providers.entries()) {
    nodes.push({
      id: `provider-${provider.id}`,
      type: "overview",
      position: {
        x: METADATA_PROVIDER_GROUP_X,
        y: centeredRowY(index, providers.length),
      },
      data: {
        view: "metadata-provider",
        name: provider.name,
        address: "",
        fileCount: null,
        status: provider.status,
        kind: provider.kind as LibrarySourceKind | MetadataProviderKind,
        handleType: "source",
        sourcePosition: Position.Left,
        targetHandles: [],
        sourceHandles: [],
        serviceCounts: null,
      },
    });
  }
  for (const [index, indexer] of indexers.entries()) {
    nodes.push({
      id: `release-indexer-${indexer.id}`,
      type: "overview",
      position: {
        x: METADATA_PROVIDER_GROUP_X,
        y: releaseIndexerGroupY + centeredRowY(index, indexers.length),
      },
      data: {
        view: "release-indexer",
        name: indexer.name,
        address: indexer.address,
        fileCount: null,
        status: indexer.status,
        kind: "torznab",
        handleType: "source",
        sourcePosition: Position.Left,
        targetHandles: [],
        sourceHandles: [],
        serviceCounts: null,
      },
    });
  }
  for (const [index, client] of clients.entries()) {
    nodes.push({
      id: `download-client-${client.id}`,
      type: "overview",
      position: {
        x: 0,
        y: downloadClientGroupY + centeredRowY(index, clients.length),
      },
      data: {
        view: "download-client",
        name: client.name,
        address: client.address,
        fileCount: null,
        status: client.status,
        kind: "qbittorrent",
        handleType: destinationSourceByClient.has(client.id) ? null : "target",
        sourcePosition: destinationSourceByClient.has(client.id)
          ? null
          : Position.Top,
        targetHandles: clientsWithIndexers.has(client.id)
          ? ["release-indexer"]
          : [],
        sourceHandles: destinationSourceByClient.has(client.id)
          ? ["download-destination"]
          : [],
        serviceCounts: null,
      },
    });
  }
  return nodes;
}

export function overviewEdges(
  sources: readonly OverviewLibrarySourceResponse[],
  providers: readonly OverviewMetadataProviderResponse[],
  indexers: readonly OverviewReleaseIndexerResponse[],
  clients: readonly OverviewDownloadClientResponse[],
  animated: boolean,
): OverviewFlowEdge[] {
  const clientsById = new Map(clients.map((client) => [client.id, client]));
  const clientDestination = destinationSourceMappings(sources, clients);
  return [
    ...sources.map((source) => ({
      id: `source-${source.id}-peridot`,
      source: `source-${source.id}`,
      target: "peridot",
      sourceHandle: "source",
      targetHandle: "peridot-left",
      type: "animation",
      animated,
      interactionWidth: 0,
      selectable: false,
      deletable: false,
      updatable: false,
    })),
    ...providers.map((provider) => ({
      id: `provider-${provider.id}-peridot`,
      source: `provider-${provider.id}`,
      target: "peridot",
      sourceHandle: "source",
      targetHandle: "peridot-right",
      type: "animation",
      animated,
      interactionWidth: 0,
      selectable: false,
      deletable: false,
      updatable: false,
    })),
    ...indexers.map((indexer) =>
      indexer.downloadClientId && clientsById.has(indexer.downloadClientId)
        ? {
            id: `release-indexer-${indexer.id}-download-client-${indexer.downloadClientId}`,
            source: `release-indexer-${indexer.id}`,
            target: `download-client-${indexer.downloadClientId}`,
            sourceHandle: "source",
            targetHandle: "release-indexer",
            type: "animation",
            animated,
            interactionWidth: 0,
            selectable: false,
            deletable: false,
            updatable: false,
          }
        : {
            id: `release-indexer-${indexer.id}-peridot`,
            source: `release-indexer-${indexer.id}`,
            target: "peridot",
            sourceHandle: "source",
            targetHandle: "peridot-right",
            type: "animation",
            animated,
            interactionWidth: 0,
            selectable: false,
            deletable: false,
            updatable: false,
          },
    ),
    ...clients.map((client) => {
      const destinationSourceId = clientDestination.get(client.id);
      return destinationSourceId
        ? {
            id: `download-client-${client.id}-source-${destinationSourceId}`,
            source: `download-client-${client.id}`,
            target: `source-${destinationSourceId}`,
            sourceHandle: "download-destination",
            targetHandle: "download-destination",
            type: "animation",
            animated,
            interactionWidth: 0,
            selectable: false,
            deletable: false,
            updatable: false,
          }
        : {
            id: `peridot-download-client-${client.id}`,
            source: "peridot",
            sourceHandle: "peridot-download-client",
            target: `download-client-${client.id}`,
            targetHandle: "download-client",
            type: "animation",
            animated,
            interactionWidth: 0,
            selectable: false,
            deletable: false,
            updatable: false,
          };
    }),
  ];
}

export function safeOverviewHost(value: string | null | undefined): string {
  if (!value) return "Peridot server";
  try {
    return new URL(value).host || "Peridot server";
  } catch {
    return value;
  }
}

export function overviewNodeSettingsPath(
  node: OverviewDiagramNode,
): string | null {
  if (node.type !== "overview") return null;
  const data = node.data as OverviewNodeData;
  switch (data.view) {
    case "peridot":
      return "/settings/server";
    case "library-source":
      return "/settings/connectors/library-sources";
    case "metadata-provider":
      return "/settings/connectors/metadata-providers";
    case "release-indexer":
      return "/settings/connectors/release-indexers";
    case "download-client":
      return "/settings/connectors/download-clients";
  }
}
