<script setup lang="ts">
import { useHead } from "#imports";
import { Button } from "@peridot/ui/components/ui/button";
import { PeridotSpinner } from "@peridot/ui/components/ui/spinner";
import { onMounted } from "vue";
import AlbumCard from "../components/AlbumCard.vue";
import { useCatalogAlbumQuery } from "../composables/use-catalog-query";
import { useLikes } from "../composables/use-likes";

useHead({ title: "Home — Peridot" });

const {
  items: albums,
  loading,
  loadingMore,
  error,
  loaded,
  hasMore,
  load,
  loadMore,
} = useCatalogAlbumQuery();
const { load: loadLikes } = useLikes();

onMounted(() => {
  void load();
  void loadLikes();
});
</script>

<template>
  <div class="space-y-2">
    <h1 class="text-2xl font-semibold tracking-tight">Suggestions</h1>
    <p class="text-sm text-muted-foreground">
      Albums from your library to put back in rotation.
    </p>
  </div>
  <section aria-labelledby="suggestions-heading" class="space-y-4">
    <h2 id="suggestions-heading" class="text-lg font-semibold">
      Made from your library
    </h2>
    <div
      v-if="loading && !albums.length"
      role="status"
      class="flex items-center gap-3 rounded-lg border p-6 text-sm text-muted-foreground"
    >
      <PeridotSpinner label="Loading suggestions" />
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
      v-else-if="albums.length"
      class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5"
      :aria-busy="loading"
    >
      <AlbumCard v-for="album in albums" :key="album.id" :album="album" />
      <div v-if="hasMore" class="col-span-full flex justify-center">
        <Button
          type="button"
          variant="outline"
          :disabled="loadingMore"
          @click="loadMore"
        >
          {{ loadingMore ? "Loading suggestions…" : "Load more suggestions" }}
        </Button>
      </div>
    </div>
    <p
      v-else
      role="status"
      class="rounded-lg border p-6 text-sm text-muted-foreground"
    >
      <template v-if="loaded">
        No album suggestions found. Tracks need album tags before they can
        appear here.
      </template>
      <template v-else> Loading your music library… </template>
    </p>
  </section>
</template>
