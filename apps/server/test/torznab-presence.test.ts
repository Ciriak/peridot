import assert from "node:assert/strict";
import { test } from "node:test";
import {
  magnetInfoHash,
  normalizeInfoHash,
  releaseInfoHash,
  TorrentPresenceIndex,
} from "../src/torznab-presence.js";

const ZERO_HASH = "0".repeat(40);

test("torznab infohashes normalize from attributes, magnets, and base32", () => {
  assert.equal(normalizeInfoHash(ZERO_HASH.toUpperCase()), ZERO_HASH);
  assert.equal(normalizeInfoHash("F".repeat(64)), "f".repeat(64));
  assert.equal(normalizeInfoHash("A".repeat(32)), ZERO_HASH);
  assert.equal(normalizeInfoHash("not-a-hash"), null);
  assert.equal(
    magnetInfoHash(`magnet:?xt=urn:btih:${ZERO_HASH}&dn=Release`),
    ZERO_HASH,
  );
  assert.equal(
    releaseInfoHash(
      "https://indexer.test/download/1",
      ZERO_HASH,
      "magnet:?xt=urn:btih:ffffffffffffffffffffffffffffffffffffffff",
    ),
    ZERO_HASH,
  );
  assert.equal(
    releaseInfoHash(
      "magnet:?xt=urn:btih:ffffffffffffffffffffffffffffffffffffffff",
      null,
      null,
    ),
    "f".repeat(40),
  );
});

test("torrent presence lookup batches and caches hashes by client", async (t) => {
  const requests: string[][] = [];
  t.mock.method(globalThis, "fetch", async (input: URL) => {
    const hashes = input.searchParams.get("hashes")?.split("|") ?? [];
    requests.push(hashes);
    return Response.json(
      hashes.map((hash) => ({
        hash,
        state: "downloading",
        progress: 0.5,
        tags: "peridot-release",
      })),
    );
  });
  const presence = new TorrentPresenceIndex();
  const hashes = Array.from({ length: 120 }, (_, index) =>
    index.toString(16).padStart(40, "0"),
  );
  const connection = {
    client: "http://qbit.test/",
    clientApiKey: "secret",
  };

  const first = await presence.lookup("client", connection, [
    ...hashes,
    ...hashes.slice(0, 10),
  ]);
  assert.equal(first.size, 120);
  assert.deepEqual(
    requests.map((request) => request.length),
    [50, 50, 20],
  );
  assert.equal(first.get(hashes[0]!)?.state, "downloading");

  await presence.lookup("client", connection, hashes);
  assert.equal(requests.length, 3, "cached hashes are not queried again");
});

test("torrent presence lookup fails open", async (t) => {
  t.mock.method(globalThis, "fetch", async () => {
    throw new Error("connection refused");
  });
  let reported = false;
  const result = await new TorrentPresenceIndex().lookup(
    "client",
    { client: "http://qbit.test/", clientApiKey: "secret" },
    [ZERO_HASH],
    () => {
      reported = true;
    },
  );
  assert.equal(result.size, 0);
  assert.equal(reported, true);
});
