<script setup lang="ts">
import { Badge } from "@peridot/ui/components/ui/badge";
import { Button } from "@peridot/ui/components/ui/button";
import { PeridotSpinner } from "@peridot/ui/components/ui/spinner";
import { computed, onMounted, ref } from "vue";
import TrackTable from "./TrackTable.vue";
import { useCatalogTrackQuery } from "../composables/use-catalog-query";
import { useLikes } from "../composables/use-likes";
import type { TrackSort } from "../lib/library";

const props = withDefaults(
  defineProps<{ title: string; home?: boolean; favorites?: boolean }>(),
  { home: false, favorites: false },
);
const sort = ref<TrackSort | null>({ field: "title", direction: "asc" });
const queryOptions = computed(() => ({
  sort:
    sort.value?.field === "number"
      ? ("track" as const)
      : (sort.value?.field ?? "title"),
  direction: sort.value?.direction ?? ("asc" as const),
  ...(props.favorites ? { liked: true } : {}),
}));
const { tracks, loading, loadingMore, error, loaded, hasMore, load, loadMore } =
  useCatalogTrackQuery(() => queryOptions.value);
const { load: loadLikes } = useLikes();

function setSort(next: TrackSort | null) {
  sort.value = next ?? { field: "title", direction: "asc" };
}

onMounted(() => {
  void load();
  void loadLikes();
});
</script>

<template>
  <div class="space-y-2">
    <h1 class="text-2xl font-semibold tracking-tight">{{ title }}</h1>
    <p class="text-sm text-muted-foreground">
      Tracks cataloged from your configured music sources.
    </p>
  </div>
  <section aria-labelledby="tracks-heading" class="space-y-4">
    <div class="flex items-center justify-between gap-4">
      <h2 id="tracks-heading" class="text-lg font-semibold">Tracks</h2>
      <Button v-if="home" as-child variant="ghost" size="sm"
        ><NuxtLink to="/library">View library</NuxtLink></Button
      >
      <Badge v-else variant="secondary">
        {{
          loading ? "Loading" : `${tracks.length}${hasMore ? "+" : ""} tracks`
        }}
      </Badge>
    </div>
    <div
      v-if="loading && !tracks.length"
      role="status"
      class="flex items-center gap-3 rounded-lg border p-6 text-sm text-muted-foreground"
    >
      <PeridotSpinner label="Loading library" />
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
    <TrackTable
      v-else-if="tracks.length"
      :tracks="tracks"
      variant="library"
      :sort="sort ?? undefined"
      :has-more="hasMore"
      :loading-more="loadingMore"
      @sort-change="setSort"
      @load-more="loadMore"
    />
    <p
      v-else
      role="status"
      class="rounded-lg border p-6 text-sm text-muted-foreground"
    >
      <template v-if="favorites"> You have not liked any tracks yet. </template>
      <template v-else-if="loaded">
        No tracks in your library yet. Add a music source and run a scan from
        Settings → Sources.
      </template>
      <template v-else> Loading your library… </template>
    </p>
  </section>
</template>
