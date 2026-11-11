<script setup lang="ts">
import { Badge } from "@peridot/ui/components/ui/badge";
import { Button } from "@peridot/ui/components/ui/button";
import { Spinner } from "@peridot/ui/components/ui/spinner";
import { computed, onMounted } from "vue";
import TrackTable from "./TrackTable.vue";
import { useLikes } from "../composables/use-likes";
import { useLibraryTracks } from "../composables/use-library-tracks";
import { filterTracks } from "../lib/library";

const props = withDefaults(
  defineProps<{ title: string; home?: boolean; favorites?: boolean }>(),
  { home: false, favorites: false },
);
const { tracks, loading, error, load } = useLibraryTracks();
const {
  likedTrackIds,
  loading: likesLoading,
  loaded: likesLoaded,
  error: likesError,
  load: loadLikes,
} = useLikes();
const visible = computed(() =>
  filterTracks(
    tracks.value,
    "",
    props.favorites ? likedTrackIds.value : undefined,
  ),
);

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
        {{ loading ? "Loading" : `${visible.length} tracks` }}
      </Badge>
    </div>
    <div
      v-if="loading && !tracks.length"
      role="status"
      class="flex items-center gap-3 rounded-lg border p-6 text-sm text-muted-foreground"
    >
      <Spinner label="Loading library" />
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
    <div
      v-else-if="favorites && likesLoading && !likesLoaded"
      role="status"
      class="flex items-center gap-3 rounded-lg border p-6 text-sm text-muted-foreground"
    >
      <Spinner label="Loading liked songs" />
      Loading your liked songs…
    </div>
    <div
      v-else-if="favorites && likesError"
      role="alert"
      class="space-y-3 rounded-lg border p-6 text-sm"
    >
      <p>{{ likesError }}</p>
      <Button variant="outline" @click="loadLikes(true)">Try again</Button>
    </div>
    <div v-else-if="visible.length" :aria-busy="loading">
      <TrackTable :tracks="visible" variant="library" />
    </div>
    <p
      v-else
      role="status"
      class="rounded-lg border p-6 text-sm text-muted-foreground"
    >
      <template v-if="favorites"> You have not liked any tracks yet. </template>
      <template v-else>
        No tracks in your library yet. Add a music source and run a scan from
        Settings → Sources.
      </template>
    </p>
  </section>
</template>
