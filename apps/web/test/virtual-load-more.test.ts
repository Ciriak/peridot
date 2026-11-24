import assert from "node:assert/strict";
import test from "node:test";
import {
  shouldLoadMoreForVirtualRange,
  virtualLoadTriggerRow,
} from "../app/composables/use-virtual-load-more.ts";

const idleState = {
  highestVirtualIndex: 91,
  loadedItemCount: 100,
  totalItemCount: 1_000,
  itemsPerRow: 1,
  prefetchRows: 8,
  enabled: true,
  loading: false,
  lastRequestedItemCount: null,
};

test("virtual lists request pages before the loaded range ends", () => {
  assert.equal(
    virtualLoadTriggerRow({
      loadedItemCount: 100,
      itemsPerRow: 1,
      prefetchRows: 8,
    }),
    91,
  );
  assert.equal(
    virtualLoadTriggerRow({
      loadedItemCount: 50,
      itemsPerRow: 3,
      prefetchRows: 4,
    }),
    12,
  );
  assert.equal(
    shouldLoadMoreForVirtualRange({
      ...idleState,
      highestVirtualIndex: 90,
    }),
    false,
  );
  assert.equal(shouldLoadMoreForVirtualRange(idleState), true);
});

test("virtual pagination waits for another page or a new request", () => {
  assert.equal(
    shouldLoadMoreForVirtualRange({ ...idleState, loading: true }),
    false,
  );
  assert.equal(
    shouldLoadMoreForVirtualRange({ ...idleState, enabled: false }),
    false,
  );
  assert.equal(
    shouldLoadMoreForVirtualRange({
      ...idleState,
      loadedItemCount: idleState.totalItemCount,
    }),
    false,
  );
  assert.equal(
    shouldLoadMoreForVirtualRange({
      ...idleState,
      lastRequestedItemCount: idleState.loadedItemCount,
    }),
    false,
  );
  assert.equal(
    shouldLoadMoreForVirtualRange({
      ...idleState,
      highestVirtualIndex: 191,
      loadedItemCount: 200,
      lastRequestedItemCount: 100,
    }),
    true,
  );
});
