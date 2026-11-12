import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { realtimeReconnectDelay } from "../app/lib/realtime.ts";

test("realtime reconnect delays back off with bounded jitter", () => {
  const minimum = Array.from({ length: 8 }, (_, attempt) =>
    realtimeReconnectDelay(attempt, 0),
  );
  const maximum = Array.from({ length: 8 }, (_, attempt) =>
    realtimeReconnectDelay(attempt, 1),
  );
  assert.deepEqual(minimum.slice(0, 6), [850, 1700, 3400, 6800, 12750, 25500]);
  assert.deepEqual(minimum.slice(6), [25500, 25500]);
  assert.deepEqual(maximum.slice(0, 6), [1150, 2300, 4600, 9200, 17250, 34500]);
  for (const delay of maximum.slice(6)) {
    assert.equal(delay, 34500);
  }
});

test("one realtime connection replaces task and log polling", async () => {
  const [notifications, serverSettings, realtime, catalog] = await Promise.all(
    [
      "../app/components/AppNotifications.vue",
      "../app/pages/settings/server.vue",
      "../app/composables/use-realtime.ts",
      "../app/composables/use-catalog-query.ts",
    ].map((path) => readFile(new URL(path, import.meta.url), "utf8")),
  );

  assert.match(notifications, /subscribe\(\["tasks", "catalog"\]/);
  assert.doesNotMatch(notifications, /setTimeout|setInterval/);
  assert.match(serverSettings, /subscribe\(\["logs"\]/);
  assert.doesNotMatch(serverSettings, /setInterval/);
  assert.match(realtime, /new WebSocket/);
  assert.match(realtime, /createRealtimeTicket/);
  assert.match(realtime, /resync\.required/);
  assert.match(realtime, /visibility|online/i);
  assert.match(catalog, /catalogRevision/);
  assert.match(catalog, /nextCursor/);
  assert.doesNotMatch(catalog, /useLibraryTracks/);
});
