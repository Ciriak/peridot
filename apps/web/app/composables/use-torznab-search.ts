import { useI18n } from "#imports";
import type { TorznabImportStatus, TorznabRelease } from "@peridot/contracts";
import { useQuery } from "@tanstack/vue-query";
import { computed, ref, toValue, watch, type MaybeRefOrGetter } from "vue";
import { torznabClient } from "../lib/peridot-client";
import { notifyReleaseDownloadFailed } from "../lib/toasts";
import { useQueryScope } from "./use-query-scope";
import { useServer } from "./use-server";
import { useSession } from "./use-session";

function errorMessage(reason: unknown): string | null {
  return reason instanceof Error ? reason.message : null;
}

export function useTorznabSearch(query: MaybeRefOrGetter<string>) {
  const { t } = useI18n();
  const { address } = useServer();
  const { token } = useSession();
  const { scope } = useQueryScope();
  const client = computed(() => torznabClient(address.value!, token.value!));
  const searchTerm = computed(() => toValue(query).trim());
  const activeImportId = ref("");
  const activeImportTitle = ref("");
  const importBusy = ref(false);
  let notifiedFailureId = "";

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

  const status = useQuery({
    queryKey: computed(() => [
      "torznab-import",
      scope.value,
      activeImportId.value,
    ]),
    queryFn: () => client.value.status(activeImportId.value),
    enabled: computed(() => Boolean(activeImportId.value)),
    refetchInterval: (query) =>
      query.state.data?.trackIds.length ? false : 5000,
    retry: false,
  });

  const releases = computed<TorznabRelease[]>(() => results.data.value ?? []);
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
    return results.data.value.length;
  });
  const searchError = computed(() => errorMessage(results.error.value));
  const importStatus = computed<TorznabImportStatus | null>(
    () => status.data.value ?? null,
  );
  const importFailed = computed(
    () =>
      Boolean(status.error.value) ||
      importStatus.value?.state === "error" ||
      importStatus.value?.state === "missingFiles",
  );

  function notifyImportFailure(detailMessage: string) {
    const importId = activeImportId.value;
    if (!importId || notifiedFailureId === importId) return;
    notifiedFailureId = importId;
    notifyReleaseDownloadFailed(
      activeImportTitle.value || t("torznab.failed"),
      detailMessage,
    );
  }

  watch(searchTerm, () => {
    activeImportId.value = "";
    activeImportTitle.value = "";
    notifiedFailureId = "";
  });
  watch(scope, () => {
    activeImportId.value = "";
    activeImportTitle.value = "";
    notifiedFailureId = "";
  });
  watch(
    () => status.error.value,
    (reason) => {
      if (reason) {
        notifyImportFailure(errorMessage(reason) ?? t("torznab.failed"));
      }
    },
  );
  watch(importFailed, (failed) => {
    if (failed) notifyImportFailure(t("torznab.failed"));
  });

  async function addToLibrary(release: TorznabRelease) {
    importBusy.value = true;
    notifiedFailureId = "";
    try {
      await client.value.add(release.id);
      activeImportTitle.value = release.title;
      activeImportId.value = release.id;
    } catch (reason) {
      notifyReleaseDownloadFailed(
        release.title,
        errorMessage(reason) ?? t("torznab.failed"),
      );
    } finally {
      importBusy.value = false;
    }
  }

  return {
    activeImportId,
    addToLibrary,
    enabled,
    importFailed,
    importBusy,
    importStatus,
    loading,
    releases,
    resultCount,
    searchError,
  };
}
