import assert from "node:assert/strict";
import test from "node:test";
import { formatTimeAgo } from "../app/lib/relative-time.ts";

const now = new Date("2026-11-13T12:00:00.000Z");

test("time-ago labels always include a numeric elapsed unit", () => {
  assert.equal(
    formatTimeAgo("2026-11-13T11:59:30.000Z", now, "en-US"),
    "30 seconds ago",
  );
  assert.equal(
    formatTimeAgo("2026-11-13T11:45:00.000Z", now, "en-US"),
    "15 minutes ago",
  );
  assert.equal(
    formatTimeAgo("2026-11-13T09:00:00.000Z", now, "en-US"),
    "3 hours ago",
  );
  assert.equal(
    formatTimeAgo("2026-11-11T12:00:00.000Z", now, "en-US"),
    "2 days ago",
  );
});

test("time-ago labels use longer elapsed units and the requested locale", () => {
  assert.equal(
    formatTimeAgo("2026-10-30T12:00:00.000Z", now, "en-US"),
    "2 weeks ago",
  );
  assert.equal(
    formatTimeAgo("2026-09-13T12:00:00.000Z", now, "en-US"),
    "2 months ago",
  );
  assert.equal(
    formatTimeAgo("2025-11-13T12:00:00.000Z", now, "en-US"),
    "1 year ago",
  );
  assert.equal(
    formatTimeAgo("2026-11-13T11:45:00.000Z", now, "fr-FR"),
    "il y a 15 minutes",
  );
});
