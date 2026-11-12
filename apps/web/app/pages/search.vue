<script setup lang="ts">
import { useHead, useState } from "#imports";
import { Icon } from "@iconify/vue/offline";
import type { AlbumSummaryResponse } from "@peridot/contracts";
import { Badge } from "@peridot/ui/components/ui/badge";
import { Button } from "@peridot/ui/components/ui/button";
import { PeridotSpinner } from "@peridot/ui/components/ui/spinner";
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
import { useServer } from "../composables/use-server";
import { useSession } from "../composables/use-session";
import { icons } from "../lib/icons";
import { listAlbums } from "../lib/peridot-client";
import type { TrackSort } from "../lib/library";

useHead({ title: "Search — Peridot" });

type ResultFilter = "all" | "albums" | "tracks";

const query = useState("search-query", () => "");
const debouncedQuery = ref("");
const resultFilter = ref<ResultFilter>("all");
const trackSort = ref<TrackSort>({ field: "title", direction: "asc" });
const { address } = useServer();
const { token } = useSession();
const { load: loadLikes } = useLikes();
const { recents, remember } = useSearchRecents();
const recentAlbums = ref<AlbumSummaryResponse[]>([]);

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
const resultFilters: { value: ResultFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "albums", label: "Albums" },
  { value: "tracks", label: "Tracks" },
];

function openAlbum(album: AlbumSummaryResponse) {
  remember({ title: album.title, artist: album.artist });
}

function setTrackSort(next: TrackSort | null) {
  trackSort.value = next ?? { field: "title", direction: "asc" };
}

async function loadRecentAlbums() {
  if (!address.value || !token.value || !recents.value.length) {
    recentAlbums.value = [];
    return;
  }
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
  recentAlbums.value = items;
}

watch(searching, (active) => {
  if (!active) resultFilter.value = "all";
});
watch([recents, address, token], () => void loadRecentAlbums(), {
  deep: true,
});

onMounted(() => {
  debouncedQuery.value = query.value.trim();
  void loadAlbums();
  void loadTracks();
  void loadLikes();
  void loadRecentAlbums();
});
</script>

<template>
  <div class="min-h-full space-y-8">
    <section aria-label="Search results" class="space-y-4">
      <div
        role="group"
        aria-label="Quick filters"
        class="flex flex-wrap items-center gap-2"
      >
        <span class="mr-1 text-xs font-medium text-muted-foreground">
          Quick filters
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
          {{ filter.label }}
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
      <PeridotSpinner label="Loading search results" />
      Searching your library…
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
        Try again
      </Button>
    </div>

    <section
      v-else-if="!searching"
      aria-labelledby="recent-searches-heading"
      class="space-y-4"
    >
      <div class="flex items-center justify-between gap-4">
        <h2 id="recent-searches-heading" class="text-lg font-semibold">
          Recently searched
        </h2>
        <Badge variant="secondary">
          {{ recentAlbums.length }}
          {{ recentAlbums.length === 1 ? "album" : "albums" }}
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
        Albums you open from search will appear here.
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
            Local albums
          </h2>
          <Badge variant="secondary">
            {{ albumResults.length }}{{ hasMoreAlbums ? "+" : "" }}
            {{
              albumResults.length === 1 && !hasMoreAlbums ? "album" : "albums"
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
                  ? "Loading matching albums…"
                  : "Load more matching albums"
              }}
            </Button>
          </div>
        </div>
        <p
          v-else
          role="status"
          class="rounded-lg border p-6 text-sm text-muted-foreground"
        >
          No local albums match your search.
        </p>
      </section>

      <section
        v-if="showTracks"
        aria-labelledby="local-tracks-heading"
        class="space-y-4"
      >
        <div class="flex items-center justify-between gap-4">
          <h2 id="local-tracks-heading" class="text-lg font-semibold">
            Local tracks
          </h2>
          <Badge variant="secondary">
            {{ trackResults.length }}{{ hasMoreTracks ? "+" : "" }}
            {{
              trackResults.length === 1 && !hasMoreTracks ? "track" : "tracks"
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
          No local tracks match your search.
        </p>
      </section>

      <section aria-labelledby="external-sources-heading">
        <h2 id="external-sources-heading" class="text-lg font-semibold">
          External sources
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
              External sources are not connected yet.
            </p>
            <p>
              When a provider is available, its albums will appear here and can
              be downloaded and played.
            </p>
          </div>
        </div>
      </section>
    </template>
  </div>
</template>
