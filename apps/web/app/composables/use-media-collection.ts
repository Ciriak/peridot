import { useQuery } from "@tanstack/vue-query";
import type {
  AudiobookSummaryResponse,
  PodcastSummaryResponse,
} from "@peridot/contracts";
import { computed, toValue, type MaybeRefOrGetter } from "vue";
import {
  fetchAudiobook,
  fetchPodcast,
  isAuthenticationRedirectError,
  listAudiobooks,
  listPodcasts,
} from "../lib/peridot-client";
import { peridotScopeKey } from "../lib/query-keys";
import { useLocalizedMessage } from "./use-localized-message";
import { useOfflineCatalog } from "./use-offline-catalog";
import { useQueryScope } from "./use-query-scope";
import { useServerConnection } from "./use-server-connection";
import { useSession } from "./use-session";

export type MediaCollection = AudiobookSummaryResponse | PodcastSummaryResponse;

export function useMediaCollection(
  mediaType: MaybeRefOrGetter<"audiobook" | "podcast">,
  id: MaybeRefOrGetter<string>,
  title: MaybeRefOrGetter<string> = "",
) {
  const { scope } = useQueryScope();
  const { token } = useSession();
  const { status } = useServerConnection();
  const { snapshot } = useOfflineCatalog();
  const { errorMessage } = useLocalizedMessage();
  const kind = computed(() => toValue(mediaType));
  const collectionId = computed(() => toValue(id));
  const collectionTitle = computed(() => toValue(title));
  const query = useQuery({
    queryKey: computed(() =>
      scope.value
        ? [
            ...peridotScopeKey(scope.value),
            "catalog",
            kind.value,
            { detail: collectionId.value, title: collectionTitle.value },
          ]
        : ["peridot", "unscoped", "catalog", kind.value, "detail"],
    ),
    queryFn: async () => {
      if (!scope.value || !token.value) {
        throw new Error("Peridot query scope is unavailable.");
      }
      if (collectionId.value) {
        return kind.value === "audiobook"
          ? fetchAudiobook(
              scope.value.serverAddress,
              token.value,
              collectionId.value,
            )
          : fetchPodcast(
              scope.value.serverAddress,
              token.value,
              collectionId.value,
            );
      }
      const page =
        kind.value === "audiobook"
          ? await listAudiobooks(scope.value.serverAddress, token.value, {
              query: collectionTitle.value,
              limit: 20,
            })
          : await listPodcasts(scope.value.serverAddress, token.value, {
              query: collectionTitle.value,
              limit: 20,
            });
      return (
        page.items.find(
          (item) =>
            item.title.localeCompare(collectionTitle.value, undefined, {
              sensitivity: "base",
            }) === 0,
        ) ?? null
      );
    },
    enabled: computed(() =>
      Boolean(
        scope.value &&
        token.value &&
        (collectionId.value || collectionTitle.value),
      ),
    ),
    meta: { persist: true },
  });

  const offlineMatch = computed<MediaCollection | null>(() => {
    if (!snapshot.value) return null;
    if (kind.value === "audiobook") {
      return (
        snapshot.value.audiobooks.find(
          (item) =>
            item.id === collectionId.value ||
            item.title.localeCompare(collectionTitle.value, undefined, {
              sensitivity: "base",
            }) === 0,
        ) ?? null
      );
    }
    return (
      snapshot.value.podcasts.find(
        (item) =>
          item.id === collectionId.value ||
          item.title.localeCompare(collectionTitle.value, undefined, {
            sensitivity: "base",
          }) === 0,
      ) ?? null
    );
  });

  const collection = computed<MediaCollection | null>(() =>
    status.value === "lost" && offlineMatch.value
      ? offlineMatch.value
      : (query.data.value ?? null),
  );
  const loading = computed(
    () => status.value !== "lost" && query.isPending.value && !collection.value,
  );
  const error = computed(() => {
    const reason = query.error.value;
    if (!reason || isAuthenticationRedirectError(reason)) return null;
    return errorMessage(reason, "error.catalogLoad");
  });

  async function load(force = false) {
    if (!scope.value || !token.value || status.value === "lost") return;
    if (force || !query.data.value) await query.refetch();
  }

  return { collection, loading, error, load };
}
