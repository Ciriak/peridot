<script setup lang="ts">
import { useHead, useState } from "#imports";
import { Badge } from "@peridot/ui/components/ui/badge";
import { Button } from "@peridot/ui/components/ui/button";
import { Spinner } from "@peridot/ui/components/ui/spinner";
import { computed, onMounted } from "vue";
import AlbumCard from "../components/AlbumCard.vue";
import { useLikes } from "../composables/use-likes";
import { useLibraryTracks } from "../composables/use-library-tracks";
import { filterAlbums, groupAlbums } from "../lib/library";

useHead({ title: "Home — Peridot" });

const search = useState("library-search", () => "");
const { tracks, loading, error, load } = useLibraryTracks();
const { load: loadLikes } = useLikes();
const albums = computed(() => groupAlbums(tracks.value));
const suggestions = computed(() => filterAlbums(albums.value, search.value));

onMounted(() => {
  void load();
  void loadLikes();
});
</script>

<template>
  <div class="space-y-2">
    <h1 class="text-2xl font-semibold tracking-tight">
      {{ search ? "Suggestion search results" : "Suggestions" }}
    </h1>
    <p class="text-sm text-muted-foreground">
      Albums from your library to put back in rotation.
    </p>
  </div>
  <section aria-labelledby="suggestions-heading" class="space-y-4">
    <div class="flex items-center justify-between gap-4">
      <h2 id="suggestions-heading" class="text-lg font-semibold">
        {{ search ? "Matching suggestions" : "Made from your library" }}
      </h2>
      <Badge variant="secondary">
        {{ loading ? "Loading" : `${suggestions.length} suggestions` }}
      </Badge>
    </div>
    <div
      v-if="loading && !tracks.length"
      role="status"
      class="flex items-center gap-3 rounded-lg border p-6 text-sm text-muted-foreground"
    >
      <Spinner label="Loading suggestions" />
      Finding music for your home screen…
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
      v-else-if="suggestions.length"
      class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5"
      :aria-busy="loading"
    >
      <AlbumCard v-for="album in suggestions" :key="album.key" :album="album" />
    </div>
    <p
      v-else
      role="status"
      class="rounded-lg border p-6 text-sm text-muted-foreground"
    >
      <template v-if="search">No suggestions match your search.</template>
      <template v-else-if="tracks.length">
        No album suggestions found. Tracks need album tags before they can
        appear here.
      </template>
      <template v-else>
        No tracks in your library yet. Add a music source and run a scan from
        Settings → Sources.
      </template>
    </p>
  </section>
</template>
