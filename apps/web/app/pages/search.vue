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
import ArtistCard from "../components/ArtistCard.vue";
import AutoLoadMore from "../components/AutoLoadMore.vue";
import MediaCollectionCard from "../components/MediaCollectionCard.vue";
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

type ResultFilter =
  "all" | "artists" | "albums" | "tracks" | "audiobooks" | "podcasts";

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
  { debounce: 250 },
);

const searching = computed(() => debouncedQuery.value.length > 0);
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
  totalCount: albumTotalCount,
  load: loadAlbums,
  loadMore: loadMoreAlbums,
} = useCatalogAlbumQuery(() => ({
  query: searchTerm.value,
  sort: "title",
}));
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
  sort: trackSort.value.field === "number" ? "track" : trackSort.value.field,
  direction: trackSort.value.direction,
}));

const resultsLoading = computed(
  () =>
    artistsLoading.value ||
    albumsLoading.value ||
    tracksLoading.value ||
    audiobooksLoading.value ||
    podcastsLoading.value,
);
const resultsError = computed(
  () =>
    artistsError.value ||
    albumsError.value ||
    tracksError.value ||
    audiobooksError.value ||
    podcastsError.value,
);
const hasResults = computed(() =>
  Boolean(
    artistResults.value.length ||
    albumResults.value.length ||
    trackResults.value.length ||
    audiobookResults.value.length ||
    podcastResults.value.length,
  ),
);
const showArtists = computed(
  () => resultFilter.value === "all" || resultFilter.value === "artists",
);
const showAlbums = computed(
  () => resultFilter.value === "all" || resultFilter.value === "albums",
);
const showTracks = computed(
  () => resultFilter.value === "all" || resultFilter.value === "tracks",
);
const showAudiobooks = computed(
  () => resultFilter.value === "all" || resultFilter.value === "audiobooks",
);
const showPodcasts = computed(
  () => resultFilter.value === "all" || resultFilter.value === "podcasts",
);
const resultFilters: { value: ResultFilter; labelKey: string }[] = [
  { value: "all", labelKey: "page.search.all" },
  { value: "artists", labelKey: "page.search.artists" },
  { value: "albums", labelKey: "page.search.albums" },
  { value: "tracks", labelKey: "page.search.tracks" },
  { value: "audiobooks", labelKey: "page.search.audiobooks" },
  { value: "podcasts", labelKey: "page.search.podcasts" },
];

function openAlbum(album: AlbumSummaryResponse) {
  remember({ albumId: album.id, title: album.title, artist: album.artist });
}

function setTrackSort(next: TrackSort | null) {
  trackSort.value = next ?? { field: "title", direction: "asc" };
}

function retrySearch() {
  void Promise.all([
    loadArtists(true),
    loadAlbums(true),
    loadTracks(true),
    loadAudiobooks(true),
    loadPodcasts(true),
  ]);
}

watch(searching, (active) => {
  if (!active) resultFilter.value = "all";
});
onMounted(() => {
  debouncedQuery.value = query.value.trim();
  void loadArtists();
  void loadAlbums();
  void loadTracks();
  void loadAudiobooks();
  void loadPodcasts();
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
        v-if="showArtists"
        aria-labelledby="local-artists-heading"
        class="space-y-4"
      >
        <div class="flex flex-wrap items-center gap-2">
          <h2 id="local-artists-heading" class="text-lg font-semibold">
            {{ t("page.search.localArtists") }}
          </h2>
          <Badge variant="secondary">
            {{
              t("count.artist", { count: artistTotalCount }, artistTotalCount)
            }}
          </Badge>
        </div>
        <VirtualCardGrid
          v-if="artistResults.length"
          :items="artistResults"
          layout="standard"
          :item-key="(artist) => artist.id"
          :estimate-row-height="92"
        >
          <template #default="{ item }">
            <ArtistCard :artist="item" />
          </template>
          <template #footer>
            <AutoLoadMore
              :enabled="hasMoreArtists"
              :loading="artistsLoadingMore"
              :item-count="artistResults.length"
              :label="t('page.search.loadingMoreArtists')"
              @load="loadMoreArtists"
            />
          </template>
        </VirtualCardGrid>
        <p
          v-else
          role="status"
          class="rounded-lg border p-6 text-sm text-muted-foreground"
        >
          {{ t("page.search.noArtists") }}
        </p>
      </section>

      <section
        v-if="showAlbums"
        aria-labelledby="local-albums-heading"
        class="space-y-4"
      >
        <div class="flex flex-wrap items-center gap-2">
          <h2 id="local-albums-heading" class="text-lg font-semibold">
            {{ t("page.search.localAlbums") }}
          </h2>
          <Badge variant="secondary">
            {{ t("count.album", { count: albumTotalCount }, albumTotalCount) }}
          </Badge>
        </div>
        <VirtualCardGrid
          v-if="albumResults.length"
          :items="albumResults"
          layout="compact"
          :item-key="(album) => album.id"
          :estimate-row-height="150"
        >
          <template #default="{ item }">
            <AlbumCard :album="item" compact @open="openAlbum(item)" />
          </template>
          <template #footer>
            <AutoLoadMore
              :enabled="hasMoreAlbums"
              :loading="albumsLoadingMore"
              :item-count="albumResults.length"
              :label="t('page.search.loadingMoreAlbums')"
              @load="loadMoreAlbums"
            />
          </template>
        </VirtualCardGrid>
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
        <div class="flex flex-wrap items-center gap-2">
          <h2 id="local-tracks-heading" class="text-lg font-semibold">
            {{ t("page.search.localTracks") }}
          </h2>
          <Badge variant="secondary">
            {{ t("count.track", { count: trackTotalCount }, trackTotalCount) }}
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

      <section
        v-if="showAudiobooks"
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
          v-if="audiobookResults.length"
          :items="audiobookResults"
          layout="standard"
          :item-key="(audiobook) => audiobook.id"
          :estimate-row-height="340"
        >
          <template #default="{ item }">
            <MediaCollectionCard :collection="item" />
          </template>
          <template #footer>
            <AutoLoadMore
              :enabled="hasMoreAudiobooks"
              :loading="audiobooksLoadingMore"
              :item-count="audiobookResults.length"
              :label="t('page.search.loadingMoreAudiobooks')"
              @load="loadMoreAudiobooks"
            />
          </template>
        </VirtualCardGrid>
        <p
          v-else
          role="status"
          class="rounded-lg border p-6 text-sm text-muted-foreground"
        >
          {{ t("page.search.noAudiobooks") }}
        </p>
      </section>

      <section
        v-if="showPodcasts"
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
          v-if="podcastResults.length"
          :items="podcastResults"
          layout="standard"
          :item-key="(podcast) => podcast.id"
          :estimate-row-height="340"
        >
          <template #default="{ item }">
            <MediaCollectionCard :collection="item" />
          </template>
          <template #footer>
            <AutoLoadMore
              :enabled="hasMorePodcasts"
              :loading="podcastsLoadingMore"
              :item-count="podcastResults.length"
              :label="t('page.search.loadingMorePodcasts')"
              @load="loadMorePodcasts"
            />
          </template>
        </VirtualCardGrid>
        <p
          v-else
          role="status"
          class="rounded-lg border p-6 text-sm text-muted-foreground"
        >
          {{ t("page.search.noPodcasts") }}
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
