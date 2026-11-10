<script setup lang="ts">
import { useHead, useState } from "#imports";
import { Badge } from "@peridot/ui/components/ui/badge";
import { Button } from "@peridot/ui/components/ui/button";
import { Spinner } from "@peridot/ui/components/ui/spinner";
import { computed, onMounted } from "vue";
import ArtistCard from "../../components/ArtistCard.vue";
import { useLikes } from "../../composables/use-likes";
import { useLibraryTracks } from "../../composables/use-library-tracks";
import { filterArtists, groupArtists } from "../../lib/library";

useHead({ title: "Artists — Peridot" });

const search = useState("library-search", () => "");
const { tracks, loading, error, load } = useLibraryTracks();
const { load: loadLikes } = useLikes();
const artists = computed(() => groupArtists(tracks.value));
const visibleArtists = computed(() =>
  filterArtists(artists.value, search.value),
);

onMounted(() => {
  void load();
  void loadLikes();
});
</script>

<template>
  <div class="space-y-2">
    <h1 class="text-2xl font-semibold tracking-tight">
      {{ search ? "Artist search results" : "Artists" }}
    </h1>
    <p class="text-sm text-muted-foreground">
      Artists assembled from the performers tagged in your music library.
    </p>
  </div>
  <section aria-labelledby="artists-heading" class="space-y-4">
    <div class="flex items-center justify-between gap-4">
      <h2 id="artists-heading" class="text-lg font-semibold">
        {{ search ? "Matching artists" : "All artists" }}
      </h2>
      <Badge variant="secondary">
        {{ loading ? "Loading" : `${visibleArtists.length} artists` }}
      </Badge>
    </div>
    <div
      v-if="loading && !tracks.length"
      role="status"
      class="flex items-center gap-3 rounded-lg border p-6 text-sm text-muted-foreground"
    >
      <Spinner label="Loading artists" />
      Loading your artists…
    </div>
    <div
      v-else-if="error"
      role="alert"
      class="space-y-3 rounded-lg border p-6 text-sm"
    >
      <p>{{ error }}</p>
      <Button variant="outline" @click="load(true)">Try again</Button>
    </div>
    <div
      v-else-if="visibleArtists.length"
      class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5"
      :aria-busy="loading"
    >
      <ArtistCard
        v-for="artist in visibleArtists"
        :key="artist.key"
        :artist="artist"
      />
    </div>
    <p
      v-else
      role="status"
      class="rounded-lg border p-6 text-sm text-muted-foreground"
    >
      <template v-if="search">No artists match your search.</template>
      <template v-else-if="tracks.length">
        No artists found in your current library.
      </template>
      <template v-else>
        No tracks in your library yet. Add a music source and run a scan from
        Settings → Sources.
      </template>
    </p>
  </section>
</template>
