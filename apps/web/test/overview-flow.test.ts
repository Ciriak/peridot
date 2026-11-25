import assert from "node:assert/strict";
import test from "node:test";
import { Position } from "@xyflow/vue";
import type {
  OverviewDownloadClientResponse,
  OverviewLibrarySourceResponse,
  OverviewMetadataProviderResponse,
} from "@peridot/contracts";
import {
  overviewConnectionPositions,
  overviewEdges,
  overviewNodeSettingsPath,
  overviewNodes,
  overviewSubflowHeight,
  safeOverviewHost,
} from "../app/lib/overview-flow.ts";

const sources: OverviewLibrarySourceResponse[] = [
  {
    id: "folder",
    kind: "path",
    name: "Music",
    address: "Local folder",
    fileCount: 12,
    status: "online",
  },
  {
    id: "jellyfin",
    kind: "jellyfin",
    name: "Living room",
    address: "jellyfin.local:8096",
    fileCount: 8,
    status: "offline",
  },
];
const providers: OverviewMetadataProviderResponse[] = [
  {
    id: "musicbrainz",
    kind: "musicbrainz",
    name: "MusicBrainz",
    status: "online",
  },
  {
    id: "discogs",
    kind: "discogs",
    name: "Discogs",
    status: "disabled",
  },
];
const clients: OverviewDownloadClientResponse[] = [
  {
    id: "downloads",
    kind: "qbittorrent",
    name: "Downloads",
    address: "qbit.local:8080",
    status: "unknown",
  },
];
const serviceCounts = {
  albums: 4,
  playlists: 3,
  podcasts: 2,
  audiobooks: 1,
};

test("library sources use a stable left-side subflow layout", () => {
  assert.equal(overviewSubflowHeight(1), 200);
  assert.equal(overviewSubflowHeight(3), 416);

  const nodes = overviewNodes(
    sources,
    [],
    [],
    serviceCounts,
    "peridot.example:17430",
    "online",
  );
  assert.equal(nodes[1]?.id, "library-source-subflow");
  assert.equal(nodes[1]?.type, "subflow");
  assert.deepEqual(nodes[1]?.position, { x: -480, y: 0 });
  assert.deepEqual(nodes[2]?.position, { x: -480, y: -54 });
  assert.deepEqual(nodes[3]?.position, { x: -480, y: 54 });
});

test("overview edges connect through the side facing Peridot", () => {
  assert.deepEqual(overviewConnectionPositions({ x: 380, y: 0 }), {
    sourcePosition: Position.Left,
    targetPosition: Position.Right,
    sourceHandle: "source",
    targetHandle: "peridot-right",
  });
  assert.deepEqual(overviewConnectionPositions({ x: -480, y: 0 }), {
    sourcePosition: Position.Right,
    targetPosition: Position.Left,
    sourceHandle: "source",
    targetHandle: "peridot-left",
  });
  assert.deepEqual(overviewConnectionPositions({ x: 0, y: -260 }), {
    sourcePosition: Position.Bottom,
    targetPosition: Position.Top,
    sourceHandle: "source",
    targetHandle: "peridot-top",
  });
});

test("overview flow includes Peridot, source cards, counts, and bezier edges", () => {
  const nodes = overviewNodes(
    sources,
    [],
    [],
    serviceCounts,
    "peridot.example:17430",
    "online",
  );
  const edges = overviewEdges(sources, [], [], true);

  assert.equal(nodes[0]?.id, "peridot");
  assert.equal(nodes[0]?.data.fileCount, 20);
  assert.deepEqual(nodes[0]?.data.serviceCounts, serviceCounts);
  assert.deepEqual(nodes[0]?.data.targetHandles, ["peridot-left"]);
  assert.equal(nodes[2]?.data.name, "Music");
  assert.equal(nodes[2]?.data.status, "online");
  assert.equal(nodes[3]?.data.name, "Living room");
  assert.equal(nodes[3]?.data.status, "offline");
  assert.equal(edges.length, 2);
  assert.equal(
    edges.every((edge) => edge.type === "animation"),
    true,
  );
  assert.equal(
    edges.every((edge) => edge.target === "peridot"),
    true,
  );
  assert.equal(
    edges.every((edge) => edge.animated === true),
    true,
  );
  assert.equal(
    edges.every((edge) => edge.targetHandle === "peridot-left"),
    true,
  );
});

test("overview keeps every metadata provider individually linked on the right", () => {
  const nodes = overviewNodes(
    sources,
    providers,
    [],
    serviceCounts,
    "peridot.example:17430",
    "online",
  );
  const edges = overviewEdges(sources, providers, [], true);

  assert.equal(nodes.length, 7);
  assert.equal(nodes[0]?.data.fileCount, 20);
  assert.equal(nodes[5]?.data.view, "metadata-provider");
  assert.equal(nodes[5]?.data.name, "MusicBrainz");
  assert.equal(nodes[6]?.data.status, "disabled");
  assert.equal(nodes[1]?.id, "library-source-subflow");
  assert.equal(nodes[2]?.id, "metadata-provider-subflow");
  assert.deepEqual(nodes[2]?.position, { x: 480, y: 0 });
  assert.deepEqual(nodes[5]?.position, { x: 480, y: -54 });
  assert.equal(edges.length, 4);
  assert.equal(
    edges.some((edge) => edge.source === "provider-musicbrainz"),
    true,
  );
  assert.equal(
    edges
      .filter((edge) => edge.source?.startsWith("provider-"))
      .every((edge) => edge.targetHandle === "peridot-right"),
    true,
  );
});

test("download clients sit below Peridot and receive outbound edges", () => {
  const nodes = overviewNodes(
    sources,
    providers,
    clients,
    serviceCounts,
    "peridot.example:17430",
    "online",
  );
  const edges = overviewEdges(sources, providers, clients, true);

  assert.equal(nodes.length, 9);
  assert.deepEqual(nodes[0]?.data.sourceHandles, ["peridot-download-client"]);
  const downloadClientGroup = nodes.find(
    (node) => node.id === "download-client-subflow",
  );
  assert.equal(downloadClientGroup?.type, "subflow");
  assert.equal(downloadClientGroup?.position.y, 260);
  const downloadClient = nodes.find(
    (node) => node.id === "download-client-downloads",
  );
  assert.equal(downloadClient?.data.view, "download-client");
  assert.equal(downloadClient?.data.fileCount, null);
  const outboundEdge = edges.find(
    (edge) => edge.id === "peridot-download-client-downloads",
  );
  assert.equal(outboundEdge?.source, "peridot");
  assert.equal(outboundEdge?.sourceHandle, "peridot-download-client");
  assert.equal(outboundEdge?.target, "download-client-downloads");
  assert.equal(outboundEdge?.targetHandle, "download-client");
});

test("overview exposes only a safe server host", () => {
  assert.equal(
    safeOverviewHost("http://192.168.1.5:17430/library"),
    "192.168.1.5:17430",
  );
  assert.equal(safeOverviewHost(null), "Peridot server");
});

test("overview cards open their matching settings pages", () => {
  const nodes = overviewNodes(
    sources,
    providers,
    clients,
    serviceCounts,
    "peridot.example:17430",
    "online",
  );
  const pathFor = (id: string) => {
    const node = nodes.find((candidate) => candidate.id === id);
    assert.ok(node);
    return overviewNodeSettingsPath(node);
  };

  assert.equal(pathFor("peridot"), "/settings/server");
  assert.equal(
    pathFor("source-folder"),
    "/settings/connectors/library-sources",
  );
  assert.equal(
    pathFor("provider-musicbrainz"),
    "/settings/connectors/metadata-providers",
  );
  assert.equal(
    pathFor("download-client-downloads"),
    "/settings/connectors/download-clients",
  );
  assert.equal(pathFor("library-source-subflow"), null);
});
