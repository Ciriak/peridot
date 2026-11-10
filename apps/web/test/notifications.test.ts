import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import type { LibraryScanResponse } from "@peridot/contracts";
import {
  isLibraryScanActive,
  isLibraryScanWorkActive,
  libraryScanToast,
} from "../app/lib/library-scan-toast.ts";
import { isPeridotServerReachable } from "../app/lib/server-connection.ts";
import { sourceMutationToast } from "../app/lib/source-toast.ts";
import { toastViewportClass } from "../app/lib/toast-position.ts";

function scan(
  overrides: Partial<LibraryScanResponse> = {},
): LibraryScanResponse {
  return {
    id: "scan-1",
    status: "running",
    sourceId: null,
    sourceName: "All sources",
    discoveredCount: 0,
    createdCount: 0,
    updatedCount: 0,
    unchangedCount: 0,
    errorCount: 0,
    unavailableCount: 0,
    metadataStatus: "skipped",
    metadataTotalCount: 0,
    metadataProcessedCount: 0,
    metadataMatchedCount: 0,
    metadataUnmatchedCount: 0,
    metadataErrorCount: 0,
    metadataFailureSummary: null,
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

test("post-scan metadata work keeps the progress toast and polling active", () => {
  const enriching = scan({
    status: "completed",
    completedAt: "2026-11-10T10:01:00.000Z",
    sourceName: "Albums",
    metadataStatus: "running",
    metadataTotalCount: 20,
    metadataProcessedCount: 8,
    metadataMatchedCount: 7,
  });
  assert.equal(isLibraryScanActive(enriching.status), false);
  assert.equal(isLibraryScanWorkActive(enriching), true);
  assert.deepEqual(libraryScanToast(enriching), {
    title: "Albums metadata matching",
    description: "Matched 7 of 8 processed tracks (20 total).",
    status: "loading",
    kind: "progress",
    duration: 0,
  });

  const completed = libraryScanToast(
    scan({
      status: "completed",
      metadataStatus: "completed",
      metadataMatchedCount: 7,
      metadataUnmatchedCount: 1,
      metadataErrorCount: 0,
    }),
  );
  assert.equal(completed.status, "success");
  assert.match(completed.description, /7 metadata matches, 1 unmatched/);
  assert.equal(
    isLibraryScanWorkActive({ ...enriching, metadataStatus: "completed" }),
    false,
  );
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

test("toast placement clears the player only when the active layout renders one", () => {
  for (const layout of [undefined, "default"]) {
    const className = toastViewportClass(layout);
    assert.match(className, /\bbottom-52\b/);
    assert.match(className, /\bmd:bottom-32\b/);
  }

  for (const layout of ["settings", false, "custom-fullscreen"]) {
    const className = toastViewportClass(layout);
    assert.match(className, /\bbottom-6\b/);
    assert.match(className, /\bmd:bottom-6\b/);
    assert.doesNotMatch(className, /\bbottom-52\b|\bmd:bottom-32\b/);
  }
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
  const sources = await readFile(
    new URL("../app/pages/settings/sources.vue", import.meta.url),
    "utf8",
  );
  const metadata = await readFile(
    new URL("../app/pages/settings/metadata.vue", import.meta.url),
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
  assert.match(list, /toastViewportClass\(route\.meta\.layout\)/);
  assert.match(list, /<ToastViewport :class="viewportClass">/);
  assert.match(list, /<ToastRoot/);
  assert.match(notifications, /isPeridotServerReachable/);
  assert.match(notifications, /notifyServerConnectionLost/);
  assert.match(notifications, /notifyLibraryScan/);
  assert.match(sources, /useLibraryScan/);
  assert.match(sources, /notifySourceMutation\("added"/);
  assert.match(sources, /notifySourceMutation\("updated"\)/);
  assert.match(sources, /notifySourceMutation\("removed"/);
  assert.match(metadata, /notifyMetadataProviderMutation\("added"/);
  assert.match(metadata, /notifyMetadataProviderMutation\("updated"\)/);
  assert.match(metadata, /notifyMetadataProviderMutation\("removed"/);
  assert.match(metadata, /notifyMetadataReset/);
  assert.doesNotMatch(administration, /useLibraryScan/);
  assert.doesNotMatch(administration, /getLibraryScan/);
  assert.doesNotMatch(administration, /setTimeout/);
});
