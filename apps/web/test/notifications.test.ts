import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import type { LibraryScanResponse } from "@peridot/contracts";
import {
  isLibraryScanActive,
  libraryScanToast,
} from "../app/lib/library-scan-toast.ts";
import { isPeridotServerReachable } from "../app/lib/server-connection.ts";
import { sourceMutationToast } from "../app/lib/source-toast.ts";

function scan(
  overrides: Partial<LibraryScanResponse> = {},
): LibraryScanResponse {
  return {
    id: "scan-1",
    status: "running",
    discoveredCount: 0,
    createdCount: 0,
    updatedCount: 0,
    unchangedCount: 0,
    errorCount: 0,
    unavailableCount: 0,
    failureSummary: null,
    createdAt: "2026-11-10T10:00:00.000Z",
    startedAt: "2026-11-10T10:00:01.000Z",
    completedAt: null,
    ...overrides,
  };
}

test("library scans map to persistent progress and concise completion toasts", () => {
  assert.equal(isLibraryScanActive("queued"), true);
  assert.equal(isLibraryScanActive("running"), true);
  assert.equal(isLibraryScanActive("completed"), false);

  const running = libraryScanToast(
    scan({ discoveredCount: 12, createdCount: 8, updatedCount: 2 }),
  );
  assert.deepEqual(running, {
    title: "Library scan in progress",
    description: "Discovered 12 tracks: 8 added, 2 updated.",
    status: "loading",
    kind: "progress",
    duration: 0,
  });

  const completed = libraryScanToast(
    scan({
      status: "completed",
      createdCount: 8,
      updatedCount: 2,
      unchangedCount: 20,
      errorCount: 1,
      completedAt: "2026-11-10T10:01:00.000Z",
    }),
  );
  assert.equal(completed.status, "success");
  assert.equal(completed.duration, 5000);
  assert.match(completed.description, /8 added, 2 updated, 20 unchanged/);
  assert.match(completed.description, /1 files could not be read/);
});

test("failed library scans preserve the safe failure summary in an error toast", () => {
  const failed = libraryScanToast(
    scan({
      status: "failed",
      failureSummary: "The music source is unavailable.",
    }),
  );
  assert.equal(failed.title, "Library scan failed");
  assert.equal(failed.status, "error");
  assert.equal(failed.kind, "error");
  assert.equal(failed.description, "The music source is unavailable.");
});

test("source mutations map to concise success toasts", () => {
  assert.deepEqual(sourceMutationToast("added", " D:\\Music "), {
    title: "Source added",
    description: "D:\\Music is now available to the library.",
    status: "success",
    kind: "success",
    duration: 5000,
  });
  assert.deepEqual(sourceMutationToast("updated"), {
    title: "Source order updated",
    description: "The new source order was saved.",
    status: "success",
    kind: "success",
    duration: 5000,
  });
  assert.deepEqual(sourceMutationToast("removed", "https://music.test"), {
    title: "Source removed",
    description: "https://music.test was removed from the library sources.",
    status: "success",
    kind: "success",
    duration: 5000,
  });
});

test("server health checks require the exact Peridot health signature", async () => {
  const requests: string[] = [];
  const healthy = await isPeridotServerReachable("http://localhost:17430/", {
    fetcher: async (input) => {
      requests.push(String(input));
      return Response.json({ status: "ok", service: "peridot" });
    },
  });
  assert.equal(healthy, true);
  assert.deepEqual(requests, ["http://localhost:17430/api/health"]);

  assert.equal(
    await isPeridotServerReachable("http://localhost:17430", {
      fetcher: async () =>
        Response.json({ status: "ok", service: "another-server" }),
    }),
    false,
  );
  assert.equal(
    await isPeridotServerReachable("http://localhost:17430", {
      fetcher: async () => new Response(null, { status: 503 }),
    }),
    false,
  );
  assert.equal(
    await isPeridotServerReachable("http://localhost:17430", {
      fetcher: async () => {
        throw new Error("connection refused");
      },
    }),
    false,
  );
});

test("the app mounts one managed Reka toast region and global status monitor", async () => {
  const app = await readFile(
    new URL("../app/app.vue", import.meta.url),
    "utf8",
  );
  const toaster = await readFile(
    new URL("../app/components/AppToaster.vue", import.meta.url),
    "utf8",
  );
  const list = await readFile(
    new URL("../app/components/AppToastList.vue", import.meta.url),
    "utf8",
  );
  const notifications = await readFile(
    new URL("../app/components/AppNotifications.vue", import.meta.url),
    "utf8",
  );
  const administration = await readFile(
    new URL("../app/pages/settings/administration.vue", import.meta.url),
    "utf8",
  );

  assert.match(app, /<AppToaster \/>/);
  assert.match(app, /<AppNotifications \/>/);
  assert.match(toaster, /<ToastProvider/);
  assert.match(toaster, /toast-manager/);
  assert.match(list, /<ToastViewport/);
  assert.match(list, /bottom-44/);
  assert.match(list, /md:bottom-32/);
  assert.match(list, /md:right-6/);
  assert.match(list, /<ToastRoot/);
  assert.match(notifications, /isPeridotServerReachable/);
  assert.match(notifications, /notifyServerConnectionLost/);
  assert.match(notifications, /notifyLibraryScan/);
  assert.match(administration, /useLibraryScan/);
  assert.match(administration, /notifySourceMutation\("added"/);
  assert.match(administration, /notifySourceMutation\("updated"\)/);
  assert.match(administration, /notifySourceMutation\("removed"/);
  assert.doesNotMatch(administration, /getLibraryScan/);
  assert.doesNotMatch(administration, /setTimeout/);
});
