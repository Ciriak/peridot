import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test, { mock } from "node:test";
import {
  isPeridotServerReachable,
  serverConnectionRestored,
  topbarStatus,
} from "../app/lib/server-connection.ts";
import {
  reportServerReachability,
  resetServerReachability,
  SERVER_OFFLINE_COOLDOWN_MS,
  serverReachability,
} from "../app/lib/server-connectivity.ts";
import { offlineSaveSuccessToast } from "../app/lib/offline-toast.ts";
import { sourceMutationToast } from "../app/lib/source-toast.ts";
import { TOAST_VIEWPORT_CLASS } from "../app/lib/toast-position.ts";

test("source mutations map to concise success toasts", () => {
  assert.deepEqual(sourceMutationToast("added", " D:\\Music "), {
    titleMessage: { key: "toast.sourceAddedTitle" },
    descriptionMessage: {
      key: "toast.sourceAdded",
      params: { source: "D:\\Music" },
    },
    status: "success",
    kind: "success",
    duration: 5000,
  });
  assert.deepEqual(sourceMutationToast("removed", "https://music.test"), {
    titleMessage: { key: "toast.sourceRemovedTitle" },
    descriptionMessage: {
      key: "toast.sourceRemoved",
      params: { source: "https://music.test" },
    },
    status: "success",
    kind: "success",
    duration: 5000,
  });
});

test("offline saves map tracks and albums to success toasts", () => {
  assert.deepEqual(offlineSaveSuccessToast("track", " Night Drive "), {
    titleMessage: { key: "toast.offlineSavedTitle" },
    descriptionMessage: {
      key: "toast.offlineSaved",
      params: { track: "Night Drive" },
    },
    status: "success",
    kind: "success",
    duration: 5000,
  });
  assert.deepEqual(offlineSaveSuccessToast("album", "Blue Hours"), {
    titleMessage: { key: "toast.albumOfflineSavedTitle" },
    descriptionMessage: {
      key: "toast.albumOfflineSaved",
      params: { album: "Blue Hours" },
    },
    status: "success",
    kind: "success",
    duration: 5000,
  });
});

test("toasts sit below the topbar at the top-right", () => {
  assert.match(TOAST_VIEWPORT_CLASS, /\btop-20\b/);
  assert.match(TOAST_VIEWPORT_CLASS, /\bmd:right-6\b/);
  assert.doesNotMatch(TOAST_VIEWPORT_CLASS, /\bbottom-/);
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

test("a lost server connection replaces task progress in the topbar", () => {
  assert.equal(topbarStatus("lost", false), "connection-lost");
  assert.equal(topbarStatus("lost", true), "connection-lost");
  assert.equal(topbarStatus("connected", true), "task-progress");
  assert.equal(topbarStatus("connected", false), "idle");
  assert.equal(topbarStatus("unknown", false), "idle");
});

test("only a lost connection becoming healthy is treated as back online", () => {
  assert.equal(serverConnectionRestored("lost", "connected"), true);
  assert.equal(serverConnectionRestored("unknown", "connected"), false);
  assert.equal(serverConnectionRestored("connected", "connected"), false);
  assert.equal(serverConnectionRestored("lost", "unknown"), false);
  assert.equal(serverConnectionRestored(undefined, "connected"), false);
});

test("brief connection loss is hidden until the offline cooldown expires", () => {
  mock.timers.enable({ apis: ["setTimeout"], now: 0 });
  try {
    resetServerReachability();
    reportServerReachability(true);
    reportServerReachability(false);

    assert.equal(serverReachability.value, true);
    mock.timers.tick(SERVER_OFFLINE_COOLDOWN_MS - 1);
    assert.equal(serverReachability.value, true);

    reportServerReachability(true);
    mock.timers.tick(1);
    assert.equal(serverReachability.value, true);

    reportServerReachability(false);
    mock.timers.tick(SERVER_OFFLINE_COOLDOWN_MS);
    assert.equal(serverReachability.value, false);
  } finally {
    resetServerReachability();
    mock.timers.reset();
  }
});

test("task and log updates use the shared realtime subscription", async () => {
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
  const toasts = await readFile(
    new URL("../app/lib/toasts.ts", import.meta.url),
    "utf8",
  );
  const notifications = await readFile(
    new URL("../app/components/AppNotifications.vue", import.meta.url),
    "utf8",
  );
  const connection = await readFile(
    new URL("../app/composables/use-server-connection.ts", import.meta.url),
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
  const serverSettings = await readFile(
    new URL("../app/pages/settings/server.vue", import.meta.url),
    "utf8",
  );

  assert.match(app, /<AppToaster \/>/);
  assert.match(app, /<AppNotifications \/>/);
  assert.match(toaster, /<ToastProvider/);
  assert.match(toaster, /toast-manager/);
  assert.match(list, /<ToastViewport/);
  assert.match(list, /TOAST_VIEWPORT_CLASS/);
  assert.match(list, /<ToastRoot/);
  assert.match(notifications, /useRealtime/);
  assert.match(notifications, /useServerConnection/);
  assert.match(notifications, /serverConnectionRestored\(previous, next\)/);
  assert.match(notifications, /notifyServerOnline\(\)/);
  assert.match(
    notifications,
    /route\.path === "\/onboarding" \|\| !address\.value \|\| !token\.value/,
  );
  assert.match(notifications, /subscribe\(\["tasks", "catalog"\]/);
  assert.doesNotMatch(
    notifications,
    /appToastManager|notifyServerConnectionLost|clearServerConnectionLost|SERVER_CONNECTION_TOAST_ID/,
  );
  assert.doesNotMatch(
    notifications,
    /notifyTasks|notifyTaskStatusFailure|clearTaskToast|task-toast/,
  );
  assert.doesNotMatch(
    toasts,
    /TaskResponse|taskToast|notifyTasks|notifyTaskStatusFailure|clearTaskToast|TASK_TOAST_ID|SERVER_CONNECTION_TOAST_ID|notifyServerConnectionLost|clearServerConnectionLost/,
  );
  assert.match(toasts, /export function notifyServerOnline/);
  assert.match(toasts, /message\("toast\.serverOnlineTitle"\)/);
  assert.match(toasts, /message\("toast\.serverOnline"\)/);
  assert.doesNotMatch(
    list,
    /Work in progress|PeridotSpinner|kind === 'progress'/,
  );
  assert.doesNotMatch(notifications, /setTimeout|setInterval/);
  assert.match(serverSettings, /subscribe\(\["logs"\]/);
  assert.doesNotMatch(serverSettings, /setInterval/);
  assert.match(connection, /serverReachability/);
  assert.match(connection, /reportServerReachability/);
  assert.match(sources, /useTasks/);
  assert.match(sources, /queueLibraryScan/);
  assert.match(sources, /queueSourceScan/);
  assert.match(metadata, /queueMetadataRefresh/);
  assert.match(metadata, /hasActiveTasks/);
  assert.doesNotMatch(serverSettings, /useTasks/);
});
