<script setup lang="ts">
import { useHead } from "#imports";
import { Badge } from "@peridot/ui/components/ui/badge";
import { Button } from "@peridot/ui/components/ui/button";
import { Spinner } from "@peridot/ui/components/ui/spinner";
import { computed, onMounted } from "vue";
import AlbumCard from "../../components/AlbumCard.vue";
import { useLikes } from "../../composables/use-likes";
import { useLibraryTracks } from "../../composables/use-library-tracks";
import { groupAlbums } from "../../lib/library";

useHead({ title: "Albums — Peridot" });

const { tracks, loading, error, load } = useLibraryTracks();
const { load: loadLikes } = useLikes();
const albums = computed(() => groupAlbums(tracks.value));

onMounted(() => {
  void load();
  void loadLikes();
});
</script>

<template>
  <div class="space-y-2">
    <h1 class="text-2xl font-semibold tracking-tight">Albums</h1>
    <p class="text-sm text-muted-foreground">
      Albums assembled from the tags in your music library.
    </p>
  </div>
  <section aria-labelledby="albums-heading" class="space-y-4">
    <div class="flex items-center justify-between gap-4">
      <h2 id="albums-heading" class="text-lg font-semibold">All albums</h2>
      <Badge variant="secondary">
        {{ loading ? "Loading" : `${albums.length} albums` }}
      </Badge>
    </div>
    <div
      v-if="loading && !tracks.length"
      role="status"
      class="flex items-center gap-3 rounded-lg border p-6 text-sm text-muted-foreground"
    >
      <Spinner label="Loading albums" />
      Loading your albums…
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
      v-else-if="albums.length"
      class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5"
      :aria-busy="loading"
    >
      <AlbumCard v-for="album in albums" :key="album.key" :album="album" />
    </div>
    <p
      v-else
      role="status"
      class="rounded-lg border p-6 text-sm text-muted-foreground"
    >
      <template v-if="tracks.length">
        No albums found. Tracks need album tags before they can appear here.
      </template>
      <template v-else>
        No tracks in your library yet. Add a music source and run a scan from
        Settings → Sources.
      </template>
    </p>
  </section>
</template>
