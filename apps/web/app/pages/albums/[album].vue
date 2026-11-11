<script setup lang="ts">
import { definePageMeta, useHead, useRoute } from "#imports";
import { Icon } from "@iconify/vue/offline";
import { Badge } from "@peridot/ui/components/ui/badge";
import { Button } from "@peridot/ui/components/ui/button";
import { Spinner } from "@peridot/ui/components/ui/spinner";
import { computed, nextTick, onMounted, ref, watch } from "vue";
import LikeButton from "../../components/LikeButton.vue";
import TrackTable from "../../components/TrackTable.vue";
import TrackArtistLinks from "../../components/TrackArtistLinks.vue";
import { useLikes } from "../../composables/use-likes";
import { useLibraryPlayer } from "../../composables/use-library-player";
import { useLibraryTracks } from "../../composables/use-library-tracks";
import { useServer } from "../../composables/use-server";
import { icons } from "../../lib/icons";
import {
  findAlbum,
  formatTrackDuration,
  groupAlbums,
  trackCoverUrl,
} from "../../lib/library";

definePageMeta({ name: "album-detail" });

const route = useRoute();
const { address } = useServer();
const { tracks, loading, error, load } = useLibraryTracks();
const { active, playing, playCollection, togglePlayback } = useLibraryPlayer();
const {
  likedAlbumKeys,
  loaded: likesLoaded,
  load: loadLikes,
  toggle: toggleLike,
  isPending: isLikePending,
} = useLikes();

const albumTitle = computed(() => {
  const value = route.params.album;
  return String(Array.isArray(value) ? (value[0] ?? "") : (value ?? ""));
});
const albumArtist = computed(() => {
  const value = route.query.artist;
  return String(Array.isArray(value) ? (value[0] ?? "") : (value ?? ""));
});
const album = computed(() =>
  findAlbum(groupAlbums(tracks.value), albumTitle.value, albumArtist.value),
);
const albumActive = computed(() => {
  const activeTrackId = active.value?.id;
  return album.value && activeTrackId
    ? album.value.trackIds.includes(activeTrackId)
    : false;
});
const coverFailed = ref(false);
const coverUrl = computed(() =>
  trackCoverUrl(address.value ?? "", album.value?.coverUrl ?? null),
);
watch(coverUrl, () => {
  coverFailed.value = false;
});
useHead(() => ({
  title: album.value
    ? `${album.value.title} by ${album.value.artist} — Peridot`
    : "Album — Peridot",
}));

function playWholeAlbum() {
  const currentAlbum = album.value;
  if (currentAlbum?.trackIds.length) playCollection(currentAlbum.trackIds);
}

function toggleAlbumPlayback() {
  if (albumActive.value) {
    togglePlayback();
    return;
  }
  playWholeAlbum();
}

watch(
  [() => route.hash, () => album.value?.key],
  async ([hash]) => {
    if (!import.meta.client || !hash) return;
    await nextTick();
    document.getElementById(hash.slice(1))?.scrollIntoView({ block: "start" });
  },
  { flush: "post" },
);

onMounted(() => {
  void load();
  void loadLikes();
});
</script>

<template>
  <div class="mb-2">
    <Button as-child variant="ghost" size="lg"
      ><NuxtLink to="/albums"
        ><Icon :icon="icons.arrowLeft" aria-hidden="true" />Back to
        albums</NuxtLink
      ></Button
    >
  </div>

  <div
    v-if="loading && !tracks.length"
    role="status"
    class="flex items-center gap-3 rounded-lg border p-6 text-sm text-muted-foreground"
  >
    <Spinner label="Loading album" />
    Loading this album…
  </div>
  <div
    v-else-if="error"
    role="alert"
    class="space-y-3 rounded-lg border p-6 text-sm"
  >
    <p>{{ error }}</p>
    <Button variant="outline" @click="load(true)">Try again</Button>
  </div>
  <template v-else-if="album">
    <section
      aria-labelledby="album-heading"
      class="flex flex-col gap-6 rounded-lg border bg-card p-6 text-card-foreground sm:flex-row sm:items-end"
    >
      <div
        aria-hidden="true"
        class="flex size-40 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-muted text-muted-foreground"
      >
        <img
          v-if="coverUrl && !coverFailed"
          :src="coverUrl"
          alt=""
          class="size-full object-cover"
          @error="coverFailed = true"
        />
        <Icon v-else :icon="icons.music" class="size-16" />
      </div>
      <div class="min-w-0 space-y-3">
        <p
          class="text-xs font-medium uppercase tracking-wide text-muted-foreground"
        >
          Album
        </p>
        <h1 id="album-heading" class="text-3xl font-semibold tracking-tight">
          {{ album.title }}
        </h1>
        <p class="text-sm text-muted-foreground">
          <TrackArtistLinks :artists="album.artists" />
        </p>
        <div class="flex flex-wrap items-center gap-3">
          <Button
            size="icon-lg"
            class="rounded-full"
            :disabled="!album.tracks.length"
            :aria-label="
              albumActive && playing
                ? `Pause ${album.title} by ${album.artist}`
                : albumActive
                  ? `Resume ${album.title} by ${album.artist}`
                  : `Play ${album.title} by ${album.artist}`
            "
            @click="toggleAlbumPlayback"
          >
            <Icon
              :icon="albumActive && playing ? icons.pause : icons.play"
              aria-hidden="true"
              class="size-5"
            />
          </Button>
          <LikeButton
            :liked="likedAlbumKeys.includes(album.key)"
            :label="album.title"
            :pending="
              isLikePending({
                kind: 'album',
                title: album.title,
                artist: album.artist,
              })
            "
            :disabled="!likesLoaded"
            @toggle="
              toggleLike({
                kind: 'album',
                title: album.title,
                artist: album.artist,
              })
            "
          />
          <Badge variant="secondary">
            {{ album.tracks.length }}
            {{ album.tracks.length === 1 ? "track" : "tracks" }}
          </Badge>
          <span class="text-sm text-muted-foreground">
            {{ formatTrackDuration(album.durationMs) }}
          </span>
        </div>
      </div>
    </section>

    <section aria-labelledby="album-tracks-heading" class="space-y-4">
      <h2 id="album-tracks-heading" class="text-lg font-semibold">Tracks</h2>
      <TrackTable
        v-if="album.tracks.length"
        :tracks="album.tracks"
        variant="album"
      />
      <p
        v-else
        role="status"
        class="rounded-lg border p-6 text-sm text-muted-foreground"
      >
        This album has no playable tracks.
      </p>
    </section>
  </template>
  <section
    v-else
    role="status"
    class="space-y-4 rounded-lg border p-6 text-sm text-muted-foreground"
  >
    <p>This album is not available in your current library.</p>
    <Button as-child variant="outline"
      ><NuxtLink to="/albums">Back to albums</NuxtLink></Button
    >
  </section>
</template>
