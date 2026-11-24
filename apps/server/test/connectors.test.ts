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
import { createTestContext } from "./helpers.js";

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
    assert.doesNotMatch(response.body, /credential|apiKey|password/i);
  } finally {
    await context.close();
  }
});
