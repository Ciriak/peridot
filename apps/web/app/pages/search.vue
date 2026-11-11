<script setup lang="ts">
import { useHead, useState } from "#imports";
import { Icon } from "@iconify/vue/offline";
import { Badge } from "@peridot/ui/components/ui/badge";
import { Button } from "@peridot/ui/components/ui/button";
import { PeridotSpinner } from "@peridot/ui/components/ui/spinner";
import { computed, onMounted, ref, watch } from "vue";
import AlbumCard from "../components/AlbumCard.vue";
import TrackTable from "../components/TrackTable.vue";
import { useLikes } from "../composables/use-likes";
import { useLibraryTracks } from "../composables/use-library-tracks";
import { useProgressiveReveal } from "../composables/use-progressive-reveal";
import { useSearchRecents } from "../composables/use-search-recents";
import { icons } from "../lib/icons";
import {
  filterAlbums,
  filterTracks,
  groupAlbums,
  type AlbumGroup,
} from "../lib/library";
import { resolveRecentAlbums } from "../lib/search-recents";

useHead({ title: "Search — Peridot" });

type ResultFilter = "all" | "albums" | "tracks";

const query = useState("search-query", () => "");
const resultFilter = ref<ResultFilter>("all");
const { tracks, loading, error, load } = useLibraryTracks();
const { load: loadLikes } = useLikes();
const { recents, remember } = useSearchRecents();

const albums = computed(() => groupAlbums(tracks.value));
const searching = computed(() => query.value.trim().length > 0);
const albumResults = computed(() => filterAlbums(albums.value, query.value));
const trackResults = computed(() => filterTracks(tracks.value, query.value));
const albumResultsForFilter = computed(() =>
  resultFilter.value === "tracks" ? [] : albumResults.value,
);
const visibleTrackResults = computed(() =>
  resultFilter.value === "albums" ? [] : trackResults.value,
);
const recentAlbums = computed(() =>
  resolveRecentAlbums(recents.value, albums.value),
);
const {
  target: loadMoreTarget,
  hasMore: hasMoreAlbums,
  visibleItems: visibleAlbumResults,
  revealMore: revealMoreAlbums,
} = useProgressiveReveal(albumResultsForFilter);
const resultFilters: { value: ResultFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "albums", label: "Albums" },
  { value: "tracks", label: "Tracks" },
];

function openAlbum(album: AlbumGroup) {
  remember({ title: album.title, artist: album.artist });
}

watch(searching, (active) => {
  if (!active) resultFilter.value = "all";
});

onMounted(() => {
  void load();
  void loadLikes();
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
      v-if="loading && !tracks.length"
      role="status"
      class="flex items-center gap-3 rounded-lg border p-6 text-sm text-muted-foreground"
    >
      <PeridotSpinner label="Loading search results" />
      Loading your library…
    </div>
    <div
      v-else-if="error"
      role="alert"
      class="space-y-3 rounded-lg border p-6 text-sm"
    >
      <p>{{ error }}</p>
      <Button variant="outline" @click="load(true)">Try again</Button>
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
          :key="album.key"
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
        v-if="resultFilter !== 'tracks'"
        aria-labelledby="local-albums-heading"
        class="space-y-4"
      >
        <div class="flex items-center justify-between gap-4">
          <h2 id="local-albums-heading" class="text-lg font-semibold">
            Local albums
          </h2>
          <Badge variant="secondary">
            {{ albumResults.length }}
            {{ albumResults.length === 1 ? "album" : "albums" }}
          </Badge>
        </div>
        <div
          v-if="visibleAlbumResults.length"
          class="grid grid-cols-3 gap-1.5 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 xl:grid-cols-10"
        >
          <AlbumCard
            v-for="album in visibleAlbumResults"
            :key="album.key"
            :album="album"
            compact
            @open="openAlbum(album)"
          />
          <div
            v-if="hasMoreAlbums"
            ref="loadMoreTarget"
            class="col-span-full flex justify-center"
          >
            <Button type="button" variant="outline" @click="revealMoreAlbums">
              Load more matching albums
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
        v-if="resultFilter !== 'albums'"
        aria-labelledby="local-tracks-heading"
        class="space-y-4"
      >
        <div class="flex items-center justify-between gap-4">
          <h2 id="local-tracks-heading" class="text-lg font-semibold">
            Local tracks
          </h2>
          <Badge variant="secondary">
            {{ trackResults.length }}
            {{ trackResults.length === 1 ? "track" : "tracks" }}
          </Badge>
        </div>
        <TrackTable
          v-if="visibleTrackResults.length"
          :tracks="visibleTrackResults"
          variant="library"
        />
        <p
          v-else
          role="status"
          class="rounded-lg border p-6 text-sm text-muted-foreground"
        >
          No local tracks match your search.
        </p>
      </section>

      <section aria-labelledby="external-sources-heading" class="space-y-4">
        <h2 id="external-sources-heading" class="text-lg font-semibold">
          External sources
        </h2>
        <div
          class="flex items-start gap-3 rounded-lg border bg-muted/30 p-6 text-sm text-muted-foreground"
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
