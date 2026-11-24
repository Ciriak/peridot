<script setup lang="ts">
import { useHead, useI18n, useRoute, useRouter, useState } from "#imports";
import type { AlbumSummaryResponse } from "@peridot/contracts";
import { Badge } from "@peridot/ui/components/ui/badge";
import { Button } from "@peridot/ui/components/ui/button";
import { PeridotSpinner } from "@peridot/ui/components/ui/spinner";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@peridot/ui/components/ui/tabs";
import { useQuery } from "@tanstack/vue-query";
import { watchDebounced } from "@vueuse/core";
import { computed, onMounted, ref, watch } from "vue";
import ArtistCard from "../components/ArtistCard.vue";
import AutoLoadMore from "../components/AutoLoadMore.vue";
import CatalogCard from "../components/CatalogCard.vue";
import MediaCollectionCard from "../components/MediaCollectionCard.vue";
import ExternalResults from "../components/ExternalResults.vue";
import TrackTable from "../components/TrackTable.vue";
import VirtualCardGrid from "../components/VirtualCardGrid.vue";
import {
  useCatalogAlbumQuery,
  useCatalogArtistQuery,
  useCatalogAudiobookQuery,
  useCatalogPodcastQuery,
  useCatalogTrackQuery,
} from "../composables/use-catalog-query";
import { useLikes } from "../composables/use-likes";
import { useLibraryPlayer } from "../composables/use-library-player";
import { usePlaylistList } from "../composables/use-playlists";
import { useSearchRecents } from "../composables/use-search-recents";
import { useQueryScope } from "../composables/use-query-scope";
import { useServer } from "../composables/use-server";
import { useSession } from "../composables/use-session";
import { useTorznabSearch } from "../composables/use-torznab-search";
import { albumCatalogCard, playlistCatalogCard } from "../lib/catalog-cards";
import { listAlbums } from "../lib/peridot-client";
import { queryKeys } from "../lib/query-keys";
import {
  buildSearchTabHistoryLocation,
  normalizeSearchTab,
  SEARCH_HISTORY_DEBOUNCE_MS,
  SEARCH_TAB_QUERY_PARAM,
  type SearchTab,
} from "../lib/search-history";
import {
  filterReleaseResults,
  type ExternalResultFilter,
} from "../lib/torznab-filters";

const { t } = useI18n();
useHead({ title: t("page.search.title") });

type ResultFilter =
  | "all"
  | "artists"
  | "albums"
  | "playlists"
  | "tracks"
  | "audiobooks"
  | "podcasts";
const query = useState("search-query", () => "");
const route = useRoute();
const router = useRouter();
const debouncedQuery = ref("");
const resultFilter = ref<ResultFilter>("all");
const externalResultFilter = ref<ExternalResultFilter>("all");
const { address } = useServer();
const { token } = useSession();
const { scope } = useQueryScope();
const { load: loadLikes } = useLikes();
const { playCollection } = useLibraryPlayer();
const { recents, remember } = useSearchRecents();
const {
  addToLibrary: addExternalRelease,
  enabled: externalSearchEnabled,
  importStates: externalImportStates,
  loading: externalSearchLoading,
  playableTrackIds: externalPlayableTrackIds,
  releases: externalReleases,
  resultCount: externalResultCount,
  searchError: externalSearchError,
} = useTorznabSearch(debouncedQuery);
const recentAlbumsQuery = useQuery({
  queryKey: computed(() =>
    scope.value
      ? queryKeys.albums(scope.value, {
          query: `__peridot_recent_albums__:${recents.value
            .map((album) => album.albumId)
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
      const match = page.items.find((album) => album.id === recent.albumId);
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
  { debounce: SEARCH_HISTORY_DEBOUNCE_MS },
);

const searching = computed(() => debouncedQuery.value.length > 0);
const showSearchTabs = computed(
  () => searching.value && externalSearchEnabled.value,
);
const requestedSearchTab = computed(() =>
  normalizeSearchTab(route.query[SEARCH_TAB_QUERY_PARAM]),
);
const activeSearchTab = computed<SearchTab>({
  get: () =>
    requestedSearchTab.value === "external" && showSearchTabs.value
      ? "external"
      : "library",
  set: (tab) => {
    if (tab === activeSearchTab.value) return;
    void router.push(buildSearchTabHistoryLocation(route.query, tab));
  },
});
const searchTerm = computed(() =>
  searching.value ? debouncedQuery.value : "__peridot_no_search__",
);
const {
  items: artistResults,
  loading: artistsLoading,
  loadingMore: artistsLoadingMore,
  error: artistsError,
  hasMore: hasMoreArtists,
  totalCount: artistTotalCount,
  load: loadArtists,
  loadMore: loadMoreArtists,
} = useCatalogArtistQuery(() => ({
  query: searchTerm.value,
  sort: "name",
}));
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
  items: playlistResults,
  loading: playlistsLoading,
  loadingMore: playlistsLoadingMore,
  error: playlistsError,
  hasMore: hasMorePlaylists,
  load: loadPlaylists,
  loadMore: loadMorePlaylists,
} = usePlaylistList({
  query: searchTerm,
});
const {
  items: audiobookResults,
  loading: audiobooksLoading,
  loadingMore: audiobooksLoadingMore,
  error: audiobooksError,
  hasMore: hasMoreAudiobooks,
  totalCount: audiobookTotalCount,
  load: loadAudiobooks,
  loadMore: loadMoreAudiobooks,
} = useCatalogAudiobookQuery(() => ({
  query: searchTerm.value,
  sort: "title",
}));
const {
  items: podcastResults,
  loading: podcastsLoading,
  loadingMore: podcastsLoadingMore,
  error: podcastsError,
  hasMore: hasMorePodcasts,
  totalCount: podcastTotalCount,
  load: loadPodcasts,
  loadMore: loadMorePodcasts,
} = useCatalogPodcastQuery(() => ({
  query: searchTerm.value,
  sort: "title",
}));
const {
  tracks: trackResults,
  loading: tracksLoading,
  loadingMore: tracksLoadingMore,
  error: tracksError,
  hasMore: hasMoreTracks,
  totalCount: trackTotalCount,
  load: loadTracks,
  loadMore: loadMoreTracks,
} = useCatalogTrackQuery(() => ({
  query: searchTerm.value,
  mediaType: "all",
  sort: "title",
  direction: "asc",
}));

const resultsLoading = computed(
  () =>
    artistsLoading.value ||
    albumsLoading.value ||
    playlistsLoading.value ||
    tracksLoading.value ||
    audiobooksLoading.value ||
    podcastsLoading.value,
);
const resultsError = computed(
  () =>
    artistsError.value ||
    albumsError.value ||
    playlistsError.value ||
    tracksError.value ||
    audiobooksError.value ||
    podcastsError.value,
);
const hasResults = computed(() =>
  Boolean(
    artistResults.value.length ||
    albumResults.value.length ||
    playlistResults.value.length ||
    trackResults.value.length ||
    audiobookResults.value.length ||
    podcastResults.value.length,
  ),
);
const hasVisibleResults = computed(() => {
  if (resultFilter.value === "artists") return artistResults.value.length > 0;
  if (resultFilter.value === "albums") return albumResults.value.length > 0;
  if (resultFilter.value === "playlists")
    return playlistResults.value.length > 0;
  if (resultFilter.value === "tracks") return trackResults.value.length > 0;
  if (resultFilter.value === "audiobooks")
    return audiobookResults.value.length > 0;
  if (resultFilter.value === "podcasts") return podcastResults.value.length > 0;
  return Boolean(
    trackResults.value.length ||
    albumResults.value.length ||
    playlistResults.value.length,
  );
});
const showCatalogList = computed(() =>
  ["all", "albums", "playlists", "tracks"].includes(resultFilter.value),
);
const showArtists = computed(() => resultFilter.value === "artists");
const showAlbums = computed(
  () => resultFilter.value === "all" || resultFilter.value === "albums",
);
const showPlaylists = computed(
  () => resultFilter.value === "all" || resultFilter.value === "playlists",
);
const showTracks = computed(
  () => resultFilter.value === "all" || resultFilter.value === "tracks",
);
const showAudiobooks = computed(() => resultFilter.value === "audiobooks");
const showPodcasts = computed(() => resultFilter.value === "podcasts");
const resultFilters: { value: ResultFilter; labelKey: string }[] = [
  { value: "all", labelKey: "page.search.all" },
  { value: "artists", labelKey: "page.search.artists" },
  { value: "albums", labelKey: "page.search.albums" },
  { value: "playlists", labelKey: "page.search.playlists" },
  { value: "tracks", labelKey: "page.search.tracks" },
  { value: "audiobooks", labelKey: "page.search.audiobooks" },
  { value: "podcasts", labelKey: "page.search.podcasts" },
];
const externalResultFilters: {
  value: ExternalResultFilter;
  labelKey: string;
}[] = [
  { value: "all", labelKey: "page.search.all" },
  { value: "music", labelKey: "page.search.music" },
  { value: "audiobook", labelKey: "page.search.audiobooks" },
];
const activeResultFilter = computed<string>({
  get: () =>
    activeSearchTab.value === "external"
      ? externalResultFilter.value
      : resultFilter.value,
  set: (value) => {
    if (
      activeSearchTab.value === "external" &&
      ["all", "music", "audiobook"].includes(value)
    ) {
      externalResultFilter.value = value as ExternalResultFilter;
      return;
    }
    resultFilter.value = value as ResultFilter;
  },
});
const visibleResultFilters = computed(() =>
  activeSearchTab.value === "external" ? externalResultFilters : resultFilters,
);
const filteredExternalReleases = computed(() =>
  filterReleaseResults(externalReleases.value, externalResultFilter.value),
);
const externalEmptyMessage = computed(() => {
  if (externalResultFilter.value === "music") return t("torznab.emptyMusic");
  if (externalResultFilter.value === "audiobook") {
    return t("torznab.emptyAudiobook");
  }
  return t("torznab.empty");
});

function openAlbum(album: AlbumSummaryResponse) {
  remember({ albumId: album.id, title: album.title, artist: album.artist });
}

function retrySearch() {
  void Promise.all([
    loadArtists(true),
    loadAlbums(true),
    loadPlaylists(true),
    loadTracks(true),
    loadAudiobooks(true),
    loadPodcasts(true),
  ]);
}

function playExternalImport() {
  if (externalPlayableTrackIds.value.length) {
    playCollection(externalPlayableTrackIds.value);
  }
}

watch(searching, (active) => {
  if (!active) {
    resultFilter.value = "all";
    externalResultFilter.value = "all";
    if (requestedSearchTab.value !== "library") {
      void router.replace(
        buildSearchTabHistoryLocation(route.query, "library"),
      );
    }
  }
});
watch(externalSearchEnabled, (enabled) => {
  if (!enabled) {
    externalResultFilter.value = "all";
    if (requestedSearchTab.value !== "library") {
      void router.replace(
        buildSearchTabHistoryLocation(route.query, "library"),
      );
    }
  }
});
onMounted(() => {
  debouncedQuery.value = query.value.trim();
  void loadArtists();
  void loadAlbums();
  void loadPlaylists();
  void loadTracks();
  void loadAudiobooks();
  void loadPodcasts();
  void loadLikes();
});
</script>

<template>
  <div class="min-h-full">
    <Tabs v-model="activeSearchTab" class="space-y-8">
      <section
        :aria-label="t('page.search.results')"
        class="sticky -top-4 z-20 -mx-4 -mt-4 border-b bg-background px-4 py-3 md:-top-6 md:-mx-6 md:-mt-6 md:px-6"
      >
        <div class="space-y-3">
          <TabsList
            v-if="showSearchTabs"
            :aria-label="t('page.search.resultTabs')"
            class="w-full sm:w-auto"
          >
            <TabsTrigger value="library">
              {{ t("page.search.libraryTab") }}
            </TabsTrigger>
            <TabsTrigger
              value="external"
              :aria-label="
                externalResultCount === undefined
                  ? t('page.search.discover')
                  : t(
                      'page.search.discoverTabCount',
                      {
                        count: externalResultCount,
                      },
                      externalResultCount,
                    )
              "
            >
              {{ t("page.search.discover") }}
              <Badge
                v-if="externalResultCount !== undefined"
                variant="secondary"
                aria-hidden="true"
              >
                {{ externalResultCount }}
              </Badge>
            </TabsTrigger>
          </TabsList>

          <div
            data-sidebar-swipe-ignore
            role="group"
            :aria-label="t('page.search.filters')"
            class="scrollbar-hide flex flex-nowrap touch-pan-x items-center gap-2 overflow-x-auto overscroll-x-contain"
          >
            <Button
              v-for="filter in visibleResultFilters"
              :key="filter.value"
              :variant="
                activeResultFilter === filter.value ? 'default' : 'outline'
              "
              size="sm"
              class="rounded-full"
              :aria-pressed="activeResultFilter === filter.value"
              :disabled="!searching"
              @click="activeResultFilter = filter.value"
            >
              {{ t(filter.labelKey) }}
            </Button>
          </div>
        </div>
      </section>

      <TabsContent value="library" class="mt-0 space-y-8">
        <div
          v-if="resultsLoading && searching && !hasResults"
          role="status"
          class="flex items-center gap-3 rounded-lg border p-6 text-sm text-muted-foreground"
        >
          <PeridotSpinner :label="t('page.search.loading')" />
          {{ t("page.search.searching") }}
        </div>
        <div
          v-else-if="resultsError"
          role="alert"
          class="space-y-3 rounded-lg border p-6 text-sm"
        >
          <p>{{ resultsError }}</p>
          <Button variant="outline" @click="retrySearch">
            {{ t("common.tryAgain") }}
          </Button>
        </div>

        <section
          v-else-if="!searching"
          aria-labelledby="recent-searches-heading"
          class="space-y-4"
        >
          <div class="flex flex-wrap items-center gap-2">
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
            role="list"
            class="divide-y overflow-hidden rounded-lg border"
          >
            <CatalogCard
              v-for="album in recentAlbums"
              :key="album.id"
              :item="albumCatalogCard(album)"
              layout="row"
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
          <p
            v-if="!hasVisibleResults"
            role="status"
            class="rounded-lg border p-6 text-sm text-muted-foreground"
          >
            {{ t("page.search.noResults") }}
          </p>

          <section
            v-else-if="showCatalogList"
            :aria-label="t('page.search.results')"
            class="overflow-hidden rounded-lg border"
          >
            <TrackTable
              v-if="showTracks && trackResults.length"
              :tracks="trackResults"
              variant="search"
              :has-more="hasMoreTracks"
              :loading-more="tracksLoadingMore"
              :total-count="trackTotalCount"
              @load-more="loadMoreTracks"
            />

            <div
              v-if="showAlbums && albumResults.length"
              role="list"
              class="divide-y"
              :class="{
                'border-t': showTracks && trackResults.length,
              }"
            >
              <CatalogCard
                v-for="album in albumResults"
                :key="album.id"
                :item="albumCatalogCard(album)"
                layout="row"
                @open="openAlbum(album)"
              />
              <AutoLoadMore
                :enabled="hasMoreAlbums"
                :loading="albumsLoadingMore"
                :item-count="albumResults.length"
                :label="t('page.search.loadingMoreAlbums')"
                @load="loadMoreAlbums"
              />
            </div>

            <div
              v-if="showPlaylists && playlistResults.length"
              role="list"
              class="divide-y"
              :class="{
                'border-t':
                  (showTracks && trackResults.length) ||
                  (showAlbums && albumResults.length),
              }"
            >
              <CatalogCard
                v-for="playlist in playlistResults"
                :key="playlist.id"
                :item="playlistCatalogCard(playlist)"
                layout="row"
              />
              <AutoLoadMore
                :enabled="hasMorePlaylists"
                :loading="playlistsLoadingMore"
                :item-count="playlistResults.length"
                :label="t('page.search.loadingMorePlaylists')"
                @load="loadMorePlaylists"
              />
            </div>
          </section>

          <section
            v-if="showArtists && artistResults.length"
            aria-labelledby="local-artists-heading"
            class="space-y-4"
          >
            <div class="flex flex-wrap items-center gap-2">
              <h2 id="local-artists-heading" class="text-lg font-semibold">
                {{ t("page.search.localArtists") }}
              </h2>
              <Badge variant="secondary">
                {{
                  t(
                    "count.artist",
                    { count: artistTotalCount },
                    artistTotalCount,
                  )
                }}
              </Badge>
            </div>
            <VirtualCardGrid
              :items="artistResults"
              layout="standard"
              :item-key="(artist) => artist.id"
              :estimate-row-height="92"
              :total-count="artistTotalCount"
              :has-more="hasMoreArtists"
              :loading-more="artistsLoadingMore"
              @load-more="loadMoreArtists"
            >
              <template #default="{ item }">
                <ArtistCard :artist="item" />
              </template>
            </VirtualCardGrid>
          </section>

          <section
            v-if="showAudiobooks && audiobookResults.length"
            aria-labelledby="local-audiobooks-heading"
            class="space-y-4"
          >
            <div class="flex flex-wrap items-center gap-2">
              <h2 id="local-audiobooks-heading" class="text-lg font-semibold">
                {{ t("page.search.localAudiobooks") }}
              </h2>
              <Badge variant="secondary">
                {{
                  t(
                    "count.audiobook",
                    { count: audiobookTotalCount },
                    audiobookTotalCount,
                  )
                }}
              </Badge>
            </div>
            <VirtualCardGrid
              :items="audiobookResults"
              layout="standard"
              :item-key="(audiobook) => audiobook.id"
              :estimate-row-height="340"
              :total-count="audiobookTotalCount"
              :has-more="hasMoreAudiobooks"
              :loading-more="audiobooksLoadingMore"
              @load-more="loadMoreAudiobooks"
            >
              <template #default="{ item }">
                <MediaCollectionCard :collection="item" />
              </template>
            </VirtualCardGrid>
          </section>

          <section
            v-if="showPodcasts && podcastResults.length"
            aria-labelledby="local-podcasts-heading"
            class="space-y-4"
          >
            <div class="flex flex-wrap items-center gap-2">
              <h2 id="local-podcasts-heading" class="text-lg font-semibold">
                {{ t("page.search.localPodcasts") }}
              </h2>
              <Badge variant="secondary">
                {{
                  t(
                    "count.podcast",
                    { count: podcastTotalCount },
                    podcastTotalCount,
                  )
                }}
              </Badge>
            </div>
            <VirtualCardGrid
              :items="podcastResults"
              layout="standard"
              :item-key="(podcast) => podcast.id"
              :estimate-row-height="340"
              :total-count="podcastTotalCount"
              :has-more="hasMorePodcasts"
              :loading-more="podcastsLoadingMore"
              @load-more="loadMorePodcasts"
            >
              <template #default="{ item }">
                <MediaCollectionCard :collection="item" />
              </template>
            </VirtualCardGrid>
          </section>
        </template>
      </TabsContent>

      <TabsContent v-if="showSearchTabs" value="external" class="mt-0">
        <ExternalResults
          :import-states="externalImportStates"
          :loading="externalSearchLoading"
          :playable-track-ids="externalPlayableTrackIds"
          :empty-message="externalEmptyMessage"
          :releases="filteredExternalReleases"
          :search-error="externalSearchError"
          @add="addExternalRelease"
          @play="playExternalImport"
        />
      </TabsContent>
    </Tabs>
  </div>
</template>
