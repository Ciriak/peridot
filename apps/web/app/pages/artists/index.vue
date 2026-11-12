<script setup lang="ts">
import { useHead } from "#imports";
import { Badge } from "@peridot/ui/components/ui/badge";
import { Button } from "@peridot/ui/components/ui/button";
import { PeridotSpinner } from "@peridot/ui/components/ui/spinner";
import { onMounted } from "vue";
import ArtistCard from "../../components/ArtistCard.vue";
import { useCatalogArtistQuery } from "../../composables/use-catalog-query";
import { useLikes } from "../../composables/use-likes";

useHead({ title: "Artists — Peridot" });

const {
  items: artists,
  loading,
  loadingMore,
  error,
  loaded,
  hasMore,
  load,
  loadMore,
} = useCatalogArtistQuery();
const { load: loadLikes } = useLikes();

onMounted(() => {
  void load();
  void loadLikes();
});
</script>

<template>
  <div class="space-y-2">
    <h1 class="text-2xl font-semibold tracking-tight">Artists</h1>
    <p class="text-sm text-muted-foreground">
      Artists assembled from the performers tagged in your music library.
    </p>
  </div>
  <section aria-labelledby="artists-heading" class="space-y-4">
    <div class="flex items-center justify-between gap-4">
      <h2 id="artists-heading" class="text-lg font-semibold">All artists</h2>
      <Badge variant="secondary">
        {{ loading ? "Loading" : `${artists.length}${hasMore ? "+" : ""}` }}
      </Badge>
    </div>
    <div
      v-if="loading && !artists.length"
      role="status"
      class="flex items-center gap-3 rounded-lg border p-6 text-sm text-muted-foreground"
    >
      <PeridotSpinner label="Loading artists" />
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
      v-else-if="artists.length"
      class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5"
      :aria-busy="loading"
    >
      <ArtistCard v-for="artist in artists" :key="artist.id" :artist="artist" />
      <div v-if="hasMore" class="col-span-full flex justify-center">
        <Button
          type="button"
          variant="outline"
          :disabled="loadingMore"
          @click="loadMore"
        >
          {{ loadingMore ? "Loading artists…" : "Load more artists" }}
        </Button>
      </div>
    </div>
    <p
      v-else
      role="status"
      class="rounded-lg border p-6 text-sm text-muted-foreground"
    >
      <template v-if="loaded">
        No artists found in your current library.
      </template>
      <template v-else> Loading your artists… </template>
    </p>
  </section>
</template>
