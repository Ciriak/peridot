import { useI18n } from "#imports";
import type { ReleaseResult } from "@peridot/contracts";
import { queryOptions, useQueries, useQuery } from "@tanstack/vue-query";
import { computed, ref, toValue, watch, type MaybeRefOrGetter } from "vue";
import { PeridotApiError, torznabClient } from "../lib/peridot-client";
import {
  torznabImportShouldPoll,
  torznabTerminalImportState,
  type TorznabImportRowState,
} from "../lib/torznab-import-status";
import { notifyReleaseDownloadFailed } from "../lib/toasts";
import { useQueryScope } from "./use-query-scope";
import { useServer } from "./use-server";
import { useSession } from "./use-session";
import { useTasks } from "./use-tasks";

function errorMessage(reason: unknown): string | null {
  return reason instanceof Error ? reason.message : null;
}

interface ImportAttempt {
  title: string;
  startedAt: number;
  state:
    | { kind: "adding" }
    | { kind: "tracking"; taskId: string }
    | { kind: "already-added" }
    | { kind: "failed"; retryable: true };
}

export function useTorznabSearch(query: MaybeRefOrGetter<string>) {
  const { t } = useI18n();
  const { address } = useServer();
  const { token } = useSession();
  const { scope } = useQueryScope();
  const { track: trackTask } = useTasks();
  const client = computed(() => torznabClient(address.value!, token.value!));
  const searchTerm = computed(() => toValue(query).trim());
  const attempts = ref<Record<string, ImportAttempt>>({});
  const notifiedStatusFailures = new Set<string>();

  const config = useQuery({
    queryKey: computed(() => ["torznab", scope.value]),
    queryFn: () => client.value.config(),
    refetchOnMount: "always",
    enabled: computed(() => Boolean(address.value && token.value)),
    retry: false,
  });

  const enabled = computed(() => config.data.value?.enabled === true);
  const results = useQuery({
    queryKey: computed(() => [
      "torznab-results",
      scope.value,
      searchTerm.value,
    ]),
    queryFn: () => client.value.search(searchTerm.value),
    enabled: computed(() =>
      Boolean(
        enabled.value && searchTerm.value && address.value && token.value,
      ),
    ),
    staleTime: 0,
    retry: false,
  });

  const trackingIds = computed(() =>
    Object.entries(attempts.value).flatMap(([, attempt]) =>
      attempt.state.kind === "tracking" ? [attempt.state.taskId] : [],
    ),
  );
  const statusQueries = useQueries({
    queries: () =>
      trackingIds.value.map((id) =>
        queryOptions({
          queryKey: ["torznab-import", scope.value, id],
          queryFn: () => client.value.status(id),
          enabled: Boolean(address.value && token.value),
          refetchInterval: (query) => {
            const status = query.state.data;
            return query.state.error || !torznabImportShouldPoll(status)
              ? false
              : 5000;
          },
          retry: false,
        }),
      ),
  });

  const releases = computed<ReleaseResult[]>(
    () =>
      results.data.value?.items.flatMap((item) =>
        item.type === "release" ? [item] : [],
      ) ?? [],
  );
  const loading = computed(
    () =>
      config.isFetching.value ||
      Boolean(enabled.value && searchTerm.value && results.isFetching.value),
  );
  const resultCount = computed<number | undefined>(() => {
    if (
      !enabled.value ||
      results.isFetching.value ||
      results.error.value ||
      results.data.value === undefined
    ) {
      return undefined;
    }
    return results.data.value.items.length;
  });
  const searchError = computed(() => {
    const providerError = results.data.value?.providers.find(
      (provider) => !provider.ok,
    );
    return (
      errorMessage(results.error.value) ??
      (providerError?.errorMessage
        ? t(
            providerError.errorMessage.key,
            providerError.errorMessage.params ?? {},
          )
        : null)
    );
  });
  const importStates = computed<Record<string, TorznabImportRowState>>(() => {
    const states: Record<string, TorznabImportRowState> = {};
    const queries = statusQueries.value;
    for (const [id, attempt] of Object.entries(attempts.value)) {
      if (attempt.state.kind !== "tracking") {
        states[id] = attempt.state;
        continue;
      }
      const query = queries[trackingIds.value.indexOf(attempt.state.taskId)];
      const status = query?.data;
      if (query?.error) {
        states[id] = { kind: "failed", retryable: false };
      } else if (status?.mediaIds.length) {
        states[id] = { kind: "ready", mediaIds: status.mediaIds };
      } else if (torznabTerminalImportState(status?.state)) {
        states[id] = {
          kind: "failed",
          retryable: false,
          ...(status ? { status } : {}),
        };
      } else if (status) {
        states[id] = { kind: "tracking", status };
      } else {
        states[id] = { kind: "adding" };
      }
    }
    return states;
  });
  const playableTrackIds = computed<readonly string[]>(() => {
    const ready = Object.entries(importStates.value)
      .flatMap(([id, state]) =>
        state.kind === "ready"
          ? [
              {
                mediaIds: state.mediaIds,
                startedAt: attempts.value[id]?.startedAt ?? 0,
              },
            ]
          : [],
      )
      .sort((left, right) => left.startedAt - right.startedAt);
    return ready.at(-1)?.mediaIds ?? [];
  });

  function updateAttempt(id: string, attempt: ImportAttempt) {
    attempts.value = { ...attempts.value, [id]: attempt };
  }

  watch(
    statusQueries,
    (queries) => {
      for (const [index, taskId] of trackingIds.value.entries()) {
        const statusQuery = queries[index];
        const releaseEntry = Object.entries(attempts.value).find(
          ([, attempt]) =>
            attempt.state.kind === "tracking" &&
            attempt.state.taskId === taskId,
        );
        const releaseId = releaseEntry?.[0];
        if (
          !releaseId ||
          !statusQuery ||
          notifiedStatusFailures.has(releaseId) ||
          (!statusQuery.error &&
            !torznabTerminalImportState(statusQuery.data?.state))
        ) {
          continue;
        }
        notifiedStatusFailures.add(releaseId);
        notifyReleaseDownloadFailed(
          attempts.value[releaseId]?.title ?? t("torznab.failed"),
          statusQuery.error
            ? (errorMessage(statusQuery.error) ?? t("torznab.failed"))
            : t("torznab.transferFailed"),
        );
      }
    },
    { deep: true, immediate: true },
  );

  watch(scope, () => {
    attempts.value = {};
    notifiedStatusFailures.clear();
  });

  async function addToLibrary(release: ReleaseResult) {
    const existing = importStates.value[release.id];
    if (existing && !(existing.kind === "failed" && existing.retryable)) {
      return;
    }
    notifiedStatusFailures.delete(release.id);
    const startedAt = Date.now();
    updateAttempt(release.id, {
      title: release.title,
      startedAt,
      state: { kind: "adding" },
    });
    try {
      const response = await client.value.add(release.indexerId, release.id);
      trackTask(response.task);
      updateAttempt(release.id, {
        title: release.title,
        startedAt,
        state: { kind: "tracking", taskId: response.taskId },
      });
    } catch (reason) {
      if (
        reason instanceof PeridotApiError &&
        reason.code === "release_already_added"
      ) {
        updateAttempt(release.id, {
          title: release.title,
          startedAt,
          state: { kind: "already-added" },
        });
        notifyReleaseDownloadFailed(
          release.title,
          t("torznab.alreadyAddedError"),
        );
        return;
      }
      updateAttempt(release.id, {
        title: release.title,
        startedAt,
        state: { kind: "failed", retryable: true },
      });
      notifyReleaseDownloadFailed(
        release.title,
        errorMessage(reason) ?? t("torznab.failed"),
      );
    }
  }

  return {
    addToLibrary,
    enabled,
    importStates,
    loading,
    playableTrackIds,
    releases,
    resultCount,
    searchError,
  };
}
