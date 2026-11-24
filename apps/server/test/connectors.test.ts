import assert from "node:assert/strict";
import test from "node:test";
import {
  createConnectorRegistry,
  pathLibrarySourceConnectorDefinition,
  qBittorrentConnectorDefinition,
  torznabConnectorDefinition,
  type ConnectorRuntimeDefinition,
} from "../src/connectors.js";
import { CredentialStore } from "../src/credential-store.js";
import { createMemberSession, createTestContext } from "./helpers.js";

test("connectors register once and resolve by their declared role", () => {
  const registry = createConnectorRegistry([
    pathLibrarySourceConnectorDefinition(),
    torznabConnectorDefinition(),
    qBittorrentConnectorDefinition(),
  ]);

  assert.equal(
    registry.require("path", "library-source").librarySource.kind,
    "path",
  );
  assert.equal(
    registry.require("torznab", "release-indexer").releaseSearch.kind,
    "torznab",
  );
  assert.equal(
    registry.require("qbittorrent", "download-client").downloadTransfer.kind,
    "qbittorrent",
  );
  assert.equal(registry.releaseSearchConnectors().length, 1);
  assert.deepEqual(
    registry.descriptors().map(({ kind, role }) => [kind, role]),
    [
      ["path", "library-source"],
      ["torznab", "release-indexer"],
      ["qbittorrent", "download-client"],
    ],
  );
});

test("connector registration rejects duplicates and missing role capabilities", () => {
  const registry = createConnectorRegistry([torznabConnectorDefinition()]);
  assert.throws(
    () => registry.register(torznabConnectorDefinition()),
    /Duplicate connector/,
  );
  assert.throws(
    () =>
      createConnectorRegistry([
        {
          kind: "unimplemented",
          role: "playlist-account",
          name: "Unimplemented",
          capabilities: ["playlist-read"],
        } as ConnectorRuntimeDefinition,
      ]),
    /does not implement the playlist-account capability/,
  );
  assert.throws(
    () => registry.require("torznab", "playlist-account"),
    /not registered as playlist-account/,
  );
});

test("connector credentials remain isolated by role", () => {
  const store = new CredentialStore(Buffer.alloc(32, 7).toString("base64"));
  const encrypted = store.encrypt("private-feed-key", "release-indexer");

  assert.equal(store.decrypt(encrypted, "release-indexer"), "private-feed-key");
  assert.throws(
    () => store.decrypt(encrypted, "library-source"),
    /could not be decrypted/,
  );
});

test("the admin connector endpoint exposes safe role descriptors", async () => {
  const context = await createTestContext();
  try {
    const response = await context.app.inject({
      method: "GET",
      url: "/api/admin/connectors",
      headers: context.authorization,
    });
    assert.equal(response.statusCode, 200, response.body);
    const items = response.json<{
      items: Array<{ kind: string; role: string; capabilities: string[] }>;
    }>().items;
    assert.deepEqual(
      items.map(({ kind, role }) => [kind, role]),
      [
        ["path", "library-source"],
        ["jellyfin", "library-source"],
        ["torznab", "release-indexer"],
        ["qbittorrent", "download-client"],
        ["musicbrainz", "metadata-provider"],
        ["discogs", "metadata-provider"],
      ],
    );
    assert.ok(
      items
        .find(({ kind }) => kind === "jellyfin")
        ?.capabilities.includes("instance-discovery"),
    );
    assert.doesNotMatch(response.body, /credential|apiKey|password/i);
  } finally {
    await context.close();
  }
});

test("administrators can discover verified connector instances without credentials", async () => {
  const requested: Array<{ url: string; headers: Headers }> = [];
  const context = await createTestContext({
    jellyfinFetch: async (input, init) => {
      requested.push({
        url: String(input),
        headers: new Headers(init?.headers),
      });
      return Response.json({
        ProductName: "Jellyfin Server",
        ServerName: "Living room",
        Version: "10.10.0",
        Id: "jellyfin-server-id",
      });
    },
  });
  try {
    const response = await context.app.inject({
      method: "POST",
      url: "/api/admin/connectors/jellyfin/discover-instances",
      headers: context.authorization,
      payload: { address: "192.168.1.5" },
    });

    assert.equal(response.statusCode, 200, response.body);
    assert.deepEqual(response.json(), {
      items: [
        {
          kind: "jellyfin",
          id: "jellyfin-server-id",
          label: "Living room",
          url: "https://192.168.1.5:8096",
          version: "10.10.0",
        },
      ],
      scannedSubnets: [],
    });
    assert.deepEqual(requested.map(({ url }) => url).sort(), [
      "http://192.168.1.5:8096/System/Info/Public",
      "https://192.168.1.5:8096/System/Info/Public",
    ]);
    assert.ok(requested.every(({ headers }) => !headers.has("authorization")));

    const unsupported = await context.app.inject({
      method: "POST",
      url: "/api/admin/connectors/torznab/discover-instances",
      headers: context.authorization,
      payload: {},
    });
    assert.equal(unsupported.statusCode, 404);
    assert.equal(
      unsupported.json<{ error: { code: string } }>().error.code,
      "connector_discovery_unsupported",
    );

    const member = await createMemberSession(context);
    const forbidden = await context.app.inject({
      method: "POST",
      url: "/api/admin/connectors/jellyfin/discover-instances",
      headers: { authorization: member.authorization },
      payload: {},
    });
    assert.equal(forbidden.statusCode, 403);
  } finally {
    await context.close();
  }
});

test("administrators can discover qBittorrent Web UI instances", async () => {
  const requested: string[] = [];
  const context = await createTestContext({
    qbittorrentFetch: async (input) => {
      requested.push(String(input));
      return new Response(
        '<meta name="description" content="qBittorrent WebUI">',
        {
          headers: { "content-type": "text/html; charset=UTF-8" },
        },
      );
    },
  });
  try {
    const response = await context.app.inject({
      method: "POST",
      url: "/api/admin/connectors/qbittorrent/discover-instances",
      headers: context.authorization,
      payload: { address: "192.168.1.8" },
    });

    assert.equal(response.statusCode, 200, response.body);
    assert.deepEqual(response.json(), {
      items: [
        {
          kind: "qbittorrent",
          id: "192.168.1.8:8080/",
          label: "qBittorrent",
          url: "https://192.168.1.8:8080",
          version: null,
        },
      ],
      scannedSubnets: [],
    });
    assert.deepEqual(requested.sort(), [
      "http://192.168.1.8:8080/",
      "https://192.168.1.8:8080/",
    ]);
  } finally {
    await context.close();
  }
});
