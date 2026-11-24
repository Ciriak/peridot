import type {
  AlbumSummaryResponse,
  MediaType,
  MessageDescriptor,
  PlaylistDetailResponse,
  MediaResponse,
} from "@peridot/contracts";
import { useI18n, useState } from "#imports";
import { computed, watch } from "vue";
import { loadCollectionTracks } from "../lib/catalog-collections";
import {
  clearDownloadTasks,
  createDownloadTask,
  deleteDownloadTask,
  downloadTaskProgressPercent,
  isActiveDownloadTask,
  pruneDownloadTasks,
  readDownloadTasks,
  reconcileDownloadTasks,
  sameDownloadTaskTarget,
  writeDownloadTask,
  type DownloadTask,
  type DownloadTaskRequest,
} from "../lib/download-tasks";
import { loadAllLikedAlbums, loadAllLikedTracks } from "../lib/liked-offline";
import {
  fetchPlaylist,
  isAuthenticationRedirectError,
  isPeridotNetworkError,
  listAlbums,
  listTracks,
  resolveTracks,
} from "../lib/peridot-client";
import { message } from "../lib/messages";
import { notifyDownloadTaskEnded } from "../lib/toasts";
import { useLocalizedMessage } from "./use-localized-message";
import { useQueryScope } from "./use-query-scope";
import { useServerConnection } from "./use-server-connection";
import { useSession } from "./use-session";

const MAX_ITEM_ATTEMPTS = 3;
let refreshPromise: Promise<void> | null = null;
let refreshKey: string | null = null;

interface DownloadTaskAdapter {
  isSaved: (mediaId: string) => boolean;
  save: (
    track: MediaResponse,
    onProgress?: (progress: number | null) => void,
  ) => Promise<void>;
}

interface TaskRunResult {
  completed: number;
  failed: number;
  total: number;
  failureMessage: string | null;
}

function sameScope(
  left: { serverAddress: string; userId: string } | null,
  right: { serverAddress: string; userId: string },
): boolean {
  return (
    left?.serverAddress === right.serverAddress && left.userId === right.userId
  );
}

function trackTitleMessage(kind: string, title: string): MessageDescriptor {
  return message(`downloadTasks.title.${kind}`, { item: title });
}

export function useOfflineDownloadTasks() {
  const { t } = useI18n();
  const { errorMessage } = useLocalizedMessage();
  const { scope } = useQueryScope();
  const { token } = useSession();
  const { status } = useServerConnection();
  const tasks = useState<DownloadTask[]>("offline-download-tasks", () => []);
  const loaded = useState("offline-download-tasks-loaded", () => false);
  const running = useState("offline-download-tasks-running", () => false);
  const empty = computed(() => tasks.value.length === 0);
  const activeTasks = computed(() => tasks.value.filter(isActiveDownloadTask));
  const hasActiveTasks = computed(() => activeTasks.value.length > 0);
  const activeProgress = computed(() => {
    if (!activeTasks.value.length) return null;
    const values = activeTasks.value
      .map(downloadTaskProgressPercent)
      .filter((value): value is number => value !== null);
    if (values.length !== activeTasks.value.length) return null;
    return values.reduce((total, value) => total + value, 0) / values.length;
  });
  let adapter: DownloadTaskAdapter | null = null;
  let workerScheduled = false;
  let workerStarted = false;

  function orderedTasks(): DownloadTask[] {
    const rank = (task: DownloadTask) => {
      if (task.status === "running") return 0;
      if (task.status === "queued") return 1;
      if (task.status === "paused") return 2;
      return 3;
    };
    return [...tasks.value].sort((left, right) => {
      const statusDifference = rank(left) - rank(right);
      if (statusDifference !== 0) return statusDifference;
      return (
        new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime()
      );
    });
  }

  async function updateTask(
    taskId: string,
    patch: Partial<DownloadTask>,
    persistChange = true,
  ) {
    const index = tasks.value.findIndex((task) => task.id === taskId);
    if (index < 0) return null;
    const next: DownloadTask = {
      ...tasks.value[index]!,
      ...patch,
      updatedAt: new Date().toISOString(),
    };
    tasks.value = [
      ...tasks.value.slice(0, index),
      next,
      ...tasks.value.slice(index + 1),
    ];
    if (persistChange) await writeDownloadTask(next);
    return next;
  }

  async function refresh() {
    const currentScope = scope.value;
    if (!currentScope) {
      tasks.value = [];
      loaded.value = true;
      return;
    }
    const key = `${currentScope.serverAddress}\u0000${currentScope.userId}`;
    if (refreshKey === key && loaded.value) return;
    if (refreshPromise && refreshKey === key) return refreshPromise;
    refreshKey = key;
    refreshPromise = (async () => {
      const stored = await readDownloadTasks(currentScope);
      const reconciled = reconcileDownloadTasks(stored, currentScope);
      tasks.value = reconciled;
      await clearDownloadTasks(currentScope);
      await Promise.all(reconciled.map(writeDownloadTask));
      loaded.value = true;
      kick();
    })();
    try {
      await refreshPromise;
    } finally {
      refreshPromise = null;
    }
  }

  function currentTask(taskId: string): DownloadTask | null {
    return tasks.value.find((task) => task.id === taskId) ?? null;
  }

  async function enqueue(
    request: DownloadTaskRequest,
    title: string,
    titleMessage: MessageDescriptor,
    notifyOnCompletion: boolean,
  ): Promise<DownloadTask | null> {
    const currentScope = scope.value;
    if (!currentScope) return null;
    await refresh();
    const duplicate = tasks.value.find(
      (task) =>
        isActiveDownloadTask(task) && sameDownloadTaskTarget(task, request),
    );
    if (duplicate) return duplicate;
    const task = createDownloadTask(currentScope, {
      request,
      title,
      titleMessage,
      notifyOnCompletion,
    });
    tasks.value = [...tasks.value, task];
    await writeDownloadTask(task);
    kick();
    return task;
  }

  function enqueueTrack(track: MediaResponse, notify = true) {
    return enqueue(
      { kind: "media", track },
      track.title,
      trackTitleMessage("track", track.title),
      notify,
    );
  }

  function enqueueAlbum(album: AlbumSummaryResponse) {
    return enqueue(
      { kind: "album", album },
      album.title,
      trackTitleMessage("album", album.title),
      true,
    );
  }

  function enqueueCollection(
    collectionId: string,
    mediaType: Exclude<MediaType, "music">,
    title: string,
  ) {
    return enqueue(
      { kind: "collection", collectionId, mediaType, title },
      title,
      trackTitleMessage("collection", title),
      true,
    );
  }

  function enqueuePlaylist(playlistId: string, title: string) {
    return enqueue(
      { kind: "playlist", playlistId, title },
      title,
      trackTitleMessage("playlist", title),
      true,
    );
  }

  function enqueueLikedTitles() {
    return enqueue(
      { kind: "liked_titles" },
      t("downloadTasks.likedTitles"),
      message("downloadTasks.title.likedTitles"),
      false,
    );
  }

  async function cancel(taskId: string, removeQueued = true) {
    const task = currentTask(taskId);
    if (!task) return null;
    if (
      removeQueued &&
      (task.status === "queued" || task.status === "paused")
    ) {
      tasks.value = tasks.value.filter((candidate) => candidate.id !== taskId);
      await deleteDownloadTask(task);
      return null;
    }
    if (task.status === "running") {
      return updateTask(taskId, {
        status: "cancelled",
        completedAt: new Date().toISOString(),
        progress: {
          ...task.progress,
          currentTrackPercent: null,
        },
      });
    }
    return task;
  }

  async function cancelLikedTitles() {
    const liked = tasks.value.find(
      (task) =>
        task.request.kind === "liked_titles" && isActiveDownloadTask(task),
    );
    if (liked) await cancel(liked.id);
  }

  async function retry(taskId: string) {
    const task = currentTask(taskId);
    if (!task || !["completed_with_errors", "failed"].includes(task.status)) {
      return null;
    }
    const retried = await updateTask(taskId, {
      status: "queued",
      progress: {
        completed: 0,
        total: null,
        currentTrackPercent: null,
      },
      retryCount: 0,
      failedItemCount: 0,
      failureMessage: null,
      startedAt: null,
      completedAt: null,
    });
    kick();
    return retried;
  }

  async function loadTaskTracks(task: DownloadTask): Promise<MediaResponse[]> {
    const currentScope = scope.value;
    const currentToken = token.value;
    if (!currentScope || !currentToken) {
      throw new Error("Peridot query scope is unavailable.");
    }
    const address = currentScope.serverAddress;

    if (task.request.kind === "media") {
      const resolved = await resolveTracks(address, currentToken, [
        task.request.track.id,
      ]);
      return resolved.items;
    }
    if (task.request.kind === "album") {
      return loadCollectionTracks(address, currentToken, {
        albumId: task.request.album.id,
      });
    }
    if (task.request.kind === "collection") {
      return loadCollectionTracks(address, currentToken, {
        collectionId: task.request.collectionId,
        mediaType: task.request.mediaType,
      });
    }
    if (task.request.kind === "playlist") {
      const playlist: PlaylistDetailResponse = await fetchPlaylist(
        address,
        currentToken,
        task.request.playlistId,
      );
      return playlist.entries.flatMap((entry) =>
        entry.media ? [entry.media] : [],
      );
    }

    const [likedTracks, likedAlbums] = await Promise.all([
      loadAllLikedTracks((cursor) =>
        listTracks(address, currentToken, {
          cursor,
          limit: 100,
          liked: true,
        }),
      ),
      loadAllLikedAlbums((cursor) =>
        listAlbums(address, currentToken, {
          cursor,
          limit: 100,
          liked: true,
        }),
      ),
    ]);
    const albumTracks: MediaResponse[] = [];
    for (const album of likedAlbums) {
      albumTracks.push(
        ...(await loadCollectionTracks(address, currentToken, {
          albumId: album.id,
        })),
      );
    }
    return [...likedTracks, ...albumTracks];
  }

  function stillRunnable(task: DownloadTask): boolean {
    return (
      currentTask(task.id)?.status === "running" &&
      sameScope(scope.value, task.scope) &&
      status.value === "connected" &&
      Boolean(token.value)
    );
  }

  async function loadTaskTracksWithRetry(
    task: DownloadTask,
  ): Promise<MediaResponse[]> {
    let lastFailure: unknown;
    for (let attempt = 1; attempt <= MAX_ITEM_ATTEMPTS; attempt += 1) {
      if (!stillRunnable(task)) {
        throw new Error("The download task is no longer running.");
      }
      try {
        return await loadTaskTracks(task);
      } catch (reason) {
        lastFailure = reason;
        if (
          isAuthenticationRedirectError(reason) ||
          isPeridotNetworkError(reason)
        ) {
          throw reason;
        }
        await updateTask(task.id, { retryCount: attempt - 1 }, false);
      }
    }
    throw lastFailure;
  }

  async function saveItem(
    task: DownloadTask,
    track: MediaResponse,
    currentAdapter: DownloadTaskAdapter,
  ): Promise<"saved" | "failed" | "paused"> {
    let lastFailure: unknown;
    for (let attempt = 1; attempt <= MAX_ITEM_ATTEMPTS; attempt += 1) {
      if (!stillRunnable(task)) return "paused";
      await updateTask(task.id, { retryCount: attempt - 1 }, false);
      try {
        await currentAdapter.save(track, (currentTrackPercent) => {
          const current = currentTask(task.id);
          if (!current || current.status !== "running") return;
          void updateTask(
            task.id,
            {
              progress: {
                ...current.progress,
                currentTrackPercent,
              },
            },
            false,
          );
        });
        return "saved";
      } catch (reason) {
        lastFailure = reason;
        if (isAuthenticationRedirectError(reason)) return "paused";
        if (isPeridotNetworkError(reason) || status.value !== "connected") {
          await updateTask(task.id, {
            status: "paused",
            progress: {
              ...(currentTask(task.id)?.progress ?? {
                completed: 0,
                total: null,
                currentTrackPercent: null,
              }),
              currentTrackPercent: null,
            },
            failureMessage: null,
          });
          return "paused";
        }
      }
    }
    throw lastFailure;
  }

  async function execute(
    task: DownloadTask,
    currentAdapter: DownloadTaskAdapter,
  ) {
    await updateTask(task.id, {
      status: "running",
      startedAt: new Date().toISOString(),
      completedAt: null,
      failureMessage: null,
    });
    try {
      const resolvedTracks = await loadTaskTracksWithRetry(task);
      if (
        task.request.kind === "media" &&
        (!resolvedTracks[0] || !resolvedTracks[0].available)
      ) {
        throw new Error("The track is no longer available.");
      }
      const tracks = resolvedTracks
        .filter((track) => track.available && !currentAdapter.isSaved(track.id))
        .filter(
          (track, index, all) =>
            all.findIndex((candidate) => candidate.id === track.id) === index,
        );
      const total = tracks.length;
      await updateTask(task.id, {
        progress: {
          completed: 0,
          total,
          currentTrackPercent: null,
        },
      });
      let completed = 0;
      let failed = 0;
      let failureMessage: string | null = null;
      for (const track of tracks) {
        if (!stillRunnable(task)) return;
        try {
          const result = await saveItem(task, track, currentAdapter);
          if (result === "paused") return;
          completed += 1;
        } catch (reason) {
          failed += 1;
          failureMessage ??= errorMessage(reason, "error.offlineSave");
        }
        const current = currentTask(task.id);
        if (!current || current.status !== "running") return;
        await updateTask(task.id, {
          progress: {
            completed,
            total,
            currentTrackPercent: null,
          },
          failedItemCount: failed,
          failureMessage,
        });
      }
      const current = currentTask(task.id);
      if (!current || current.status !== "running") return;
      const ended: TaskRunResult = {
        completed,
        failed,
        total,
        failureMessage,
      };
      const status =
        failed > 0 && completed === 0
          ? "failed"
          : failed > 0
            ? "completed_with_errors"
            : "completed";
      await finishTask(task, status, ended);
    } catch (reason) {
      const current = currentTask(task.id);
      if (!current || current.status !== "running") return;
      if (isAuthenticationRedirectError(reason)) {
        await updateTask(task.id, { status: "paused" });
        return;
      }
      if (isPeridotNetworkError(reason) || status.value !== "connected") {
        await updateTask(task.id, { status: "paused" });
        return;
      }
      await finishTask(task, "failed", {
        completed: 0,
        failed: 1,
        total: 0,
        failureMessage: errorMessage(reason, "error.offlineSave"),
      });
    }
  }

  async function finishTask(
    task: DownloadTask,
    status: "completed" | "completed_with_errors" | "failed",
    result: TaskRunResult,
  ) {
    const completed = await updateTask(task.id, {
      status,
      completedAt: new Date().toISOString(),
      progress: {
        completed: result.completed,
        total: result.total,
        currentTrackPercent: null,
      },
      failedItemCount: result.failed,
      failureMessage: result.failureMessage,
    });
    if (completed?.notifyOnCompletion && status !== "failed") {
      notifyDownloadTaskEnded(
        completed.title,
        status === "completed_with_errors",
      );
    }
  }

  async function runQueue() {
    if (
      running.value ||
      !loaded.value ||
      !adapter ||
      !scope.value ||
      !token.value ||
      status.value !== "connected"
    ) {
      return;
    }
    const next = tasks.value.find((task) => task.status === "queued");
    if (!next) return;
    running.value = true;
    try {
      await execute(next, adapter);
    } finally {
      const current = currentTask(next.id);
      if (
        current?.status === "running" &&
        (status.value !== "connected" || !token.value)
      ) {
        await updateTask(next.id, { status: "paused" });
      }
      running.value = false;
      kick();
    }
  }

  function kick() {
    if (workerScheduled) return;
    workerScheduled = true;
    queueMicrotask(() => {
      workerScheduled = false;
      void runQueue();
    });
  }

  watch(
    scope,
    async () => {
      await refresh();
    },
    { immediate: true },
  );
  watch(
    [status, loaded],
    ([next, isLoaded]) => {
      if (next === "connected" && isLoaded) {
        const paused = tasks.value.filter((task) => task.status === "paused");
        if (paused.length) {
          for (const task of paused) {
            void updateTask(task.id, { status: "queued" });
          }
        }
        kick();
      }
    },
    { immediate: true },
  );
  watch(tasks, () => kick());

  function start(currentAdapter: DownloadTaskAdapter) {
    adapter = currentAdapter;
    workerStarted = true;
    kick();
  }

  async function clear(currentScope = scope.value) {
    tasks.value = [];
    if (currentScope) {
      await clearDownloadTasks(currentScope);
    }
  }

  return {
    tasks,
    orderedTasks,
    activeTasks,
    activeProgress,
    hasActiveTasks,
    empty,
    loaded,
    workerStarted,
    start,
    refresh,
    enqueueTrack,
    enqueueAlbum,
    enqueueCollection,
    enqueuePlaylist,
    enqueueLikedTitles,
    cancel,
    cancelLikedTitles,
    retry,
    clear,
    progressForTask: downloadTaskProgressPercent,
    isActive: isActiveDownloadTask,
    prune: pruneDownloadTasks,
  };
}
