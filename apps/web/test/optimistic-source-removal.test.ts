import assert from "node:assert/strict";
import test from "node:test";
import type { SourceResponse } from "@peridot/contracts";
import { QueryClient } from "@tanstack/vue-query";
import { removeSourceFromQueryCache } from "../app/lib/optimistic-source-removal.ts";

function source(id: string): SourceResponse {
  return {
    id,
    kind: "path",
    name: id,
    path: `/music/${id}`,
    url: null,
    pluginId: null,
    configuration: null,
    fileCount: 0,
    lastSyncedAt: null,
  };
}

test("source removal updates the query cache immediately and can roll back", () => {
  const queryClient = new QueryClient();
  const queryKey = ["peridot", "source-removal"];
  queryClient.setQueryData(queryKey, {
    items: [source("first"), source("second"), source("third")],
  });

  const rollback = removeSourceFromQueryCache(queryClient, queryKey, "second");

  assert.ok(rollback);
  assert.deepEqual(
    queryClient
      .getQueryData<{ items: SourceResponse[] }>(queryKey)
      ?.items.map((item) => item.id),
    ["first", "third"],
  );

  rollback();
  assert.deepEqual(
    queryClient
      .getQueryData<{ items: SourceResponse[] }>(queryKey)
      ?.items.map((item) => item.id),
    ["first", "second", "third"],
  );
});

test("source removal does not duplicate a source already restored by a refetch", () => {
  const queryClient = new QueryClient();
  const queryKey = ["peridot", "source-removal-refetch"];
  queryClient.setQueryData(queryKey, {
    items: [source("first"), source("second")],
  });

  const rollback = removeSourceFromQueryCache(queryClient, queryKey, "second");
  assert.ok(rollback);

  queryClient.setQueryData(queryKey, {
    items: [source("first"), source("second")],
  });
  rollback();

  assert.deepEqual(
    queryClient
      .getQueryData<{ items: SourceResponse[] }>(queryKey)
      ?.items.map((item) => item.id),
    ["first", "second"],
  );
});
