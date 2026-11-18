import assert from "node:assert/strict";
import test from "node:test";
import type { PersistedQuery } from "@tanstack/query-persist-client-core";
import {
  boundPersistedCatalogQuery,
  serializePersistedQuery,
} from "../app/lib/query-persister.ts";

function persistedQuery(
  queryKey: PersistedQuery["queryKey"],
  pageCount = 3,
): PersistedQuery {
  return {
    buster: "peridot-query-v1",
    queryHash: JSON.stringify(queryKey),
    queryKey,
    state: {
      data: {
        pages: Array.from({ length: pageCount }, (_, index) => ({
          page: index + 1,
        })),
        pageParams: Array.from({ length: pageCount }, (_, index) => index),
      },
    },
  } as PersistedQuery;
}

test("restored catalog queries keep only the first persisted page", () => {
  const bounded = boundPersistedCatalogQuery(
    persistedQuery([
      "peridot",
      "http://localhost:17430",
      "user",
      "catalog",
      "artists",
    ]),
  );
  const data = bounded.state.data as {
    pages: Array<{ page: number }>;
    pageParams: number[];
  };

  assert.deepEqual(data.pages, [{ page: 1 }]);
  assert.deepEqual(data.pageParams, [0]);
});

test("persisted non-catalog query pages remain unchanged", () => {
  const original = persistedQuery([
    "peridot",
    "http://localhost:17430",
    "user",
    "playlists",
  ]);

  assert.equal(boundPersistedCatalogQuery(original), original);
});

test("catalog queries are bounded before they are written to storage", () => {
  const serialized = serializePersistedQuery(
    persistedQuery([
      "peridot",
      "http://localhost:17430",
      "user",
      "catalog",
      "albums",
    ]),
  );
  const persisted = JSON.parse(serialized) as PersistedQuery;
  const data = persisted.state.data as {
    pages: Array<{ page: number }>;
    pageParams: number[];
  };

  assert.deepEqual(data.pages, [{ page: 1 }]);
  assert.deepEqual(data.pageParams, [0]);
});
