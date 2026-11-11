<script setup lang="ts">
import { definePageMeta, useHead, useRoute } from "#imports";
import { Icon } from "@iconify/vue/offline";
import { Badge } from "@peridot/ui/components/ui/badge";
import { Button } from "@peridot/ui/components/ui/button";
import { Spinner } from "@peridot/ui/components/ui/spinner";
import { computed, onMounted } from "vue";
import AlbumCard from "../../components/AlbumCard.vue";
import LikeButton from "../../components/LikeButton.vue";
import TrackTable from "../../components/TrackTable.vue";
import { useLikes } from "../../composables/use-likes";
import { useLibraryPlayer } from "../../composables/use-library-player";
import { useLibraryTracks } from "../../composables/use-library-tracks";
import { icons } from "../../lib/icons";
import {
  findArtist,
  formatTrackDuration,
  groupAlbums,
  groupArtists,
} from "../../lib/library";

definePageMeta({ name: "artist-detail" });

const route = useRoute();
const { tracks, loading, error, load } = useLibraryTracks();
const { playCollection } = useLibraryPlayer();
const {
  likedArtistKeys,
  loaded: likesLoaded,
  load: loadLikes,
  toggle: toggleLike,
  isPending: isLikePending,
} = useLikes();

const artistName = computed(() => {
  const value = route.params.artist;
  return String(Array.isArray(value) ? (value[0] ?? "") : (value ?? ""));
});
const artist = computed(() =>
  findArtist(groupArtists(tracks.value), artistName.value),
);
const albums = computed(() =>
  artist.value ? groupAlbums(artist.value.tracks) : [],
);
useHead(() => ({
  title: artist.value ? `${artist.value.name} — Peridot` : "Artist — Peridot",
}));

function playWholeArtist() {
  const currentArtist = artist.value;
  if (currentArtist?.trackIds.length) playCollection(currentArtist.trackIds);
}

onMounted(() => {
  void load();
  void loadLikes();
});
</script>

<template>
  <div class="mb-2">
    <Button as-child variant="ghost" size="lg"
      ><NuxtLink to="/artists"
        ><Icon :icon="icons.arrowLeft" aria-hidden="true" />Back to
        artists</NuxtLink
      ></Button
    >
  </div>

  <div
    v-if="loading && !tracks.length"
    role="status"
    class="flex items-center gap-3 rounded-lg border p-6 text-sm text-muted-foreground"
  >
    <Spinner label="Loading artist" />
    Loading this artist…
  </div>
  <div
    v-else-if="error"
    role="alert"
    class="space-y-3 rounded-lg border p-6 text-sm"
  >
    <p>{{ error }}</p>
    <Button variant="outline" @click="load(true)">Try again</Button>
  </div>
  <template v-else-if="artist">
    <section
      aria-labelledby="artist-heading"
      class="flex flex-col gap-6 rounded-lg border bg-card p-6 text-card-foreground sm:flex-row sm:items-end"
    >
      <div
        aria-hidden="true"
        class="flex size-40 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground"
      >
        <Icon :icon="icons.user" class="size-16" />
      </div>
      <div class="min-w-0 space-y-3">
        <p
          class="text-xs font-medium uppercase tracking-wide text-muted-foreground"
        >
          Artist
        </p>
        <h1 id="artist-heading" class="text-3xl font-semibold tracking-tight">
          {{ artist.name }}
        </h1>
        <div class="flex flex-wrap items-center gap-3">
          <Button :disabled="!artist.tracks.length" @click="playWholeArtist">
            <Icon :icon="icons.play" aria-hidden="true" />Play artist
          </Button>
          <LikeButton
            :liked="likedArtistKeys.includes(artist.key)"
            :label="artist.name"
            :pending="isLikePending({ kind: 'artist', name: artist.name })"
            :disabled="!likesLoaded"
            @toggle="toggleLike({ kind: 'artist', name: artist.name })"
          />
          <Badge variant="secondary">
            {{ artist.albumCount }}
            {{ artist.albumCount === 1 ? "album" : "albums" }}
          </Badge>
          <Badge variant="secondary">
            {{ artist.tracks.length }}
            {{ artist.tracks.length === 1 ? "track" : "tracks" }}
          </Badge>
          <span class="text-sm text-muted-foreground">
            {{ formatTrackDuration(artist.durationMs) }}
          </span>
        </div>
      </div>
    </section>

    <section
      v-if="albums.length"
      aria-labelledby="artist-albums-heading"
      class="space-y-4"
    >
      <div class="flex items-center justify-between gap-4">
        <h2 id="artist-albums-heading" class="text-lg font-semibold">Albums</h2>
        <Badge variant="secondary">
          {{ albums.length }} {{ albums.length === 1 ? "album" : "albums" }}
        </Badge>
      </div>
      <div
        class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5"
      >
        <AlbumCard v-for="album in albums" :key="album.key" :album="album" />
      </div>
    </section>

    <section aria-labelledby="artist-tracks-heading" class="space-y-4">
      <div class="flex items-center justify-between gap-4">
        <h2 id="artist-tracks-heading" class="text-lg font-semibold">Tracks</h2>
        <Badge variant="secondary">All tracks</Badge>
      </div>
      <TrackTable
        v-if="artist.tracks.length"
        :tracks="artist.tracks"
        variant="artist"
      />
      <p
        v-else
        role="status"
        class="rounded-lg border p-6 text-sm text-muted-foreground"
      >
        This artist has no playable tracks.
      </p>
    </section>
  </template>
  <section
    v-else
    role="status"
    class="space-y-4 rounded-lg border p-6 text-sm text-muted-foreground"
  >
    <p>This artist is not available in your current library.</p>
    <Button as-child variant="outline"
      ><NuxtLink to="/artists">Back to artists</NuxtLink></Button
    >
  </section>
</template>
