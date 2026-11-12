<script setup lang="ts">
import { useHead, useI18n, useState } from "#imports";
import { Icon } from "@iconify/vue/offline";
import type { AlbumSummaryResponse } from "@peridot/contracts";
import { Badge } from "@peridot/ui/components/ui/badge";
import { Button } from "@peridot/ui/components/ui/button";
import { PeridotSpinner } from "@peridot/ui/components/ui/spinner";
import { useQuery } from "@tanstack/vue-query";
import { watchDebounced } from "@vueuse/core";
import { computed, onMounted, ref, watch } from "vue";
import AlbumCard from "../components/AlbumCard.vue";
import TrackTable from "../components/TrackTable.vue";
import {
  useCatalogAlbumQuery,
  useCatalogTrackQuery,
} from "../composables/use-catalog-query";
import { useLikes } from "../composables/use-likes";
import { useSearchRecents } from "../composables/use-search-recents";
import { useQueryScope } from "../composables/use-query-scope";
import { useServer } from "../composables/use-server";
import { useSession } from "../composables/use-session";
import { icons } from "../lib/icons";
import { listAlbums } from "../lib/peridot-client";
import { queryKeys } from "../lib/query-keys";
import type { TrackSort } from "../lib/library";

const { t } = useI18n();
useHead({ title: t("page.search.title") });

type ResultFilter = "all" | "albums" | "tracks";

const query = useState("search-query", () => "");
const debouncedQuery = ref("");
const resultFilter = ref<ResultFilter>("all");
const trackSort = ref<TrackSort>({ field: "title", direction: "asc" });
const { address } = useServer();
const { token } = useSession();
const { scope } = useQueryScope();
const { load: loadLikes } = useLikes();
const { recents, remember } = useSearchRecents();
const recentAlbumsQuery = useQuery({
  queryKey: computed(() =>
    scope.value
      ? queryKeys.albums(scope.value, {
          query: `__peridot_recent_albums__:${recents.value
            .map((album) => `${album.artist}\u0000${album.title}`)
            .join("|")}`,
        })
      : ["peridot", "unscoped", "recent-albums"],
  ),
  queryFn: async () => {
    if (!address.value || !token.value) return [];
    const items: AlbumSummaryResponse[] = [];
    for (const recent of recents.value) {
      const page = await listAlbums(address.value, token.value, {
        query: `${recent.title} ${recent.artist}`,
        limit: 20,
      });
      const match = page.items.find(
        (album) =>
          album.title.toLowerCase() === recent.title.toLowerCase() &&
          album.artist.toLowerCase() === recent.artist.toLowerCase(),
      );
      if (match) items.push(match);
    }
    return items;
  },
  enabled: computed(() =>
    Boolean(address.value && token.value && recents.value.length),
  ),
  meta: { persist: true },
});
const recentAlbums = computed(() => recentAlbumsQuery.data.value ?? []);

watchDebounced(
  query,
  (value) => {
    debouncedQuery.value = value.trim();
  },
  { debounce: 250 },
);

const searching = computed(() => debouncedQuery.value.length > 0);
const searchTerm = computed(() =>
  searching.value ? debouncedQuery.value : "__peridot_no_search__",
);
const {
  items: albumResults,
  loading: albumsLoading,
  loadingMore: albumsLoadingMore,
  error: albumsError,
  hasMore: hasMoreAlbums,
  load: loadAlbums,
  loadMore: loadMoreAlbums,
} = useCatalogAlbumQuery(() => ({
  query: searchTerm.value,
  sort: "title",
}));
const {
  tracks: trackResults,
  loading: tracksLoading,
  loadingMore: tracksLoadingMore,
  error: tracksError,
  hasMore: hasMoreTracks,
  load: loadTracks,
  loadMore: loadMoreTracks,
} = useCatalogTrackQuery(() => ({
  query: searchTerm.value,
  sort: trackSort.value.field === "number" ? "track" : trackSort.value.field,
  direction: trackSort.value.direction,
}));

const showAlbums = computed(() => resultFilter.value !== "tracks");
const showTracks = computed(() => resultFilter.value !== "albums");
const resultFilters: { value: ResultFilter; labelKey: string }[] = [
  { value: "all", labelKey: "page.search.all" },
  { value: "albums", labelKey: "page.search.albums" },
  { value: "tracks", labelKey: "page.search.tracks" },
];

function openAlbum(album: AlbumSummaryResponse) {
  remember({ title: album.title, artist: album.artist });
}

function setTrackSort(next: TrackSort | null) {
  trackSort.value = next ?? { field: "title", direction: "asc" };
}

watch(searching, (active) => {
  if (!active) resultFilter.value = "all";
});
onMounted(() => {
  debouncedQuery.value = query.value.trim();
  void loadAlbums();
  void loadTracks();
  void loadLikes();
});
</script>

<template>
  <div class="min-h-full space-y-8">
    <section :aria-label="t('page.search.results')" class="space-y-4">
      <div
        role="group"
        :aria-label="t('page.search.filters')"
        class="flex flex-wrap items-center gap-2"
      >
        <span class="mr-1 text-xs font-medium text-muted-foreground">
          {{ t("page.search.filters") }}
        </span>
        <Button
          v-for="filter in resultFilters"
          :key="filter.value"
          :variant="resultFilter === filter.value ? 'default' : 'outline'"
          size="sm"
          :aria-pressed="resultFilter === filter.value"
          :disabled="!searching"
          @click="resultFilter = filter.value"
        >
          {{ t(filter.labelKey) }}
        </Button>
      </div>
    </section>

    <div
      v-if="
        (albumsLoading || tracksLoading) &&
        searching &&
        !albumResults.length &&
        !trackResults.length
      "
      role="status"
      class="flex items-center gap-3 rounded-lg border p-6 text-sm text-muted-foreground"
    >
      <PeridotSpinner :label="t('page.search.loading')" />
      {{ t("page.search.searching") }}
    </div>
    <div
      v-else-if="albumsError || tracksError"
      role="alert"
      class="space-y-3 rounded-lg border p-6 text-sm"
    >
      <p>{{ albumsError || tracksError }}</p>
      <Button
        variant="outline"
        @click="
          loadAlbums(true);
          loadTracks(true);
        "
      >
        {{ t("common.tryAgain") }}
      </Button>
    </div>

    <section
      v-else-if="!searching"
      aria-labelledby="recent-searches-heading"
      class="space-y-4"
    >
      <div class="flex items-center justify-between gap-4">
        <h2 id="recent-searches-heading" class="text-lg font-semibold">
          {{ t("page.search.recent") }}
        </h2>
        <Badge variant="secondary">
          {{
            t(
              "count.album",
              { count: recentAlbums.length },
              recentAlbums.length,
            )
          }}
        </Badge>
      </div>
      <div
        v-if="recentAlbums.length"
        class="grid grid-cols-3 gap-1.5 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 xl:grid-cols-10"
      >
        <AlbumCard
          v-for="album in recentAlbums"
          :key="album.id"
          :album="album"
          compact
          @open="openAlbum(album)"
        />
      </div>
      <p
        v-else
        role="status"
        class="rounded-lg border p-6 text-sm text-muted-foreground"
      >
        {{ t("page.search.noRecents") }}
      </p>
    </section>

    <template v-else>
      <section
        v-if="showAlbums"
        aria-labelledby="local-albums-heading"
        class="space-y-4"
      >
        <div class="flex items-center justify-between gap-4">
          <h2 id="local-albums-heading" class="text-lg font-semibold">
            {{ t("page.search.localAlbums") }}
          </h2>
          <Badge variant="secondary">
            {{
              `${t(
                "count.album",
                { count: albumResults.length },
                albumResults.length,
              )}${hasMoreAlbums ? "+" : ""}`
            }}
          </Badge>
        </div>
        <div
          v-if="albumResults.length"
          class="grid grid-cols-3 gap-1.5 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 xl:grid-cols-10"
        >
          <AlbumCard
            v-for="album in albumResults"
            :key="album.id"
            :album="album"
            compact
            @open="openAlbum(album)"
          />
          <div v-if="hasMoreAlbums" class="col-span-full flex justify-center">
            <Button
              type="button"
              variant="outline"
              :disabled="albumsLoadingMore"
              @click="loadMoreAlbums"
            >
              {{
                albumsLoadingMore
                  ? t("page.search.loadingMoreAlbums")
                  : t("page.search.loadMoreAlbums")
              }}
            </Button>
          </div>
        </div>
        <p
          v-else
          role="status"
          class="rounded-lg border p-6 text-sm text-muted-foreground"
        >
          {{ t("page.search.noAlbums") }}
        </p>
      </section>

      <section
        v-if="showTracks"
        aria-labelledby="local-tracks-heading"
        class="space-y-4"
      >
        <div class="flex items-center justify-between gap-4">
          <h2 id="local-tracks-heading" class="text-lg font-semibold">
            {{ t("page.search.localTracks") }}
          </h2>
          <Badge variant="secondary">
            {{
              `${t(
                "count.track",
                { count: trackResults.length },
                trackResults.length,
              )}${hasMoreTracks ? "+" : ""}`
            }}
          </Badge>
        </div>
        <TrackTable
          v-if="trackResults.length"
          :tracks="trackResults"
          variant="library"
          :sort="trackSort"
          :has-more="hasMoreTracks"
          :loading-more="tracksLoadingMore"
          @sort-change="setTrackSort"
          @load-more="loadMoreTracks"
        />
        <p
          v-else
          role="status"
          class="rounded-lg border p-6 text-sm text-muted-foreground"
        >
          {{ t("page.search.noTracks") }}
        </p>
      </section>

      <section aria-labelledby="external-sources-heading">
        <h2 id="external-sources-heading" class="text-lg font-semibold">
          {{ t("page.search.externalSources") }}
        </h2>
        <div
          class="mt-4 flex items-start gap-3 rounded-lg border bg-muted/30 p-6 text-sm text-muted-foreground"
        >
          <Icon
            :icon="icons.cloudOff"
            aria-hidden="true"
            class="mt-0.5 size-5 shrink-0"
          />
          <div class="space-y-1">
            <p class="font-medium text-foreground">
              {{ t("page.search.externalTitle") }}
            </p>
            <p>
              {{ t("page.search.externalDescription") }}
            </p>
          </div>
        </div>
      </section>
    </template>
  </div>
</template>
