<script setup lang="ts">
import { definePageMeta, useHead, useRoute } from "#imports";
import { Icon } from "@iconify/vue/offline";
import type { AlbumSummaryResponse } from "@peridot/contracts";
import { Badge } from "@peridot/ui/components/ui/badge";
import { Button } from "@peridot/ui/components/ui/button";
import { PeridotSpinner } from "@peridot/ui/components/ui/spinner";
import { computed, onMounted, ref, watch } from "vue";
import LikeButton from "../../components/LikeButton.vue";
import TrackArtistLinks from "../../components/TrackArtistLinks.vue";
import TrackTable from "../../components/TrackTable.vue";
import { useCatalogTrackQuery } from "../../composables/use-catalog-query";
import { useLikes } from "../../composables/use-likes";
import { useLibraryPlayer } from "../../composables/use-library-player";
import { useServer } from "../../composables/use-server";
import { useSession } from "../../composables/use-session";
import { loadCollectionTrackIds } from "../../lib/catalog-collections";
import { icons } from "../../lib/icons";
import {
  formatTrackDuration,
  trackCoverUrl,
  trackIdFromTitleHash,
  type TrackSort,
} from "../../lib/library";
import {
  isAuthenticationRedirectError,
  listAlbums,
} from "../../lib/peridot-client";

definePageMeta({ name: "album-detail" });

const route = useRoute();
const { address } = useServer();
const { token } = useSession();
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
const album = ref<AlbumSummaryResponse | null>(null);
const albumLoading = ref(true);
const albumError = ref("");
const trackSort = ref<TrackSort>({ field: "number", direction: "asc" });
const {
  tracks,
  loading: tracksLoading,
  loadingMore: tracksLoadingMore,
  error: tracksError,
  loaded: tracksLoaded,
  hasMore,
  load: loadTracks,
  loadMore: loadMoreTracks,
} = useCatalogTrackQuery(() => ({
  albumId: album.value?.id ?? "__peridot_missing_album__",
  sort: trackSort.value.field === "number" ? "track" : trackSort.value.field,
  direction: trackSort.value.direction,
}));

const scrollToTrackId = computed(() => trackIdFromTitleHash(route.hash));
const albumActive = computed(() => {
  const current = active.value;
  return Boolean(
    current &&
    current.album === album.value?.title &&
    current.artist === album.value?.artist,
  );
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

async function loadAlbum() {
  if (!address.value || !token.value) return;
  albumLoading.value = true;
  albumError.value = "";
  try {
    const page = await listAlbums(address.value, token.value, {
      query: `${albumTitle.value} ${albumArtist.value}`,
      limit: 20,
    });
    album.value =
      page.items.find(
        (candidate) =>
          candidate.title.toLowerCase() === albumTitle.value.toLowerCase() &&
          candidate.artist.toLowerCase() === albumArtist.value.toLowerCase(),
      ) ?? null;
    if (album.value) await loadTracks(true);
  } catch (reason) {
    if (isAuthenticationRedirectError(reason)) return;
    albumError.value = "This album could not be loaded.";
  } finally {
    albumLoading.value = false;
  }
}

async function playWholeAlbum() {
  if (!address.value || !token.value || !album.value) return;
  playCollection(
    await loadCollectionTrackIds(address.value, token.value, {
      albumId: album.value.id,
    }),
  );
}

function toggleAlbumPlayback() {
  if (albumActive.value && playing.value) {
    togglePlayback();
    return;
  }
  void playWholeAlbum();
}

function setTrackSort(next: TrackSort | null) {
  trackSort.value = next ?? { field: "number", direction: "asc" };
}

watch([albumTitle, albumArtist, address, token], () => {
  album.value = null;
  void loadAlbum();
});
onMounted(() => {
  void loadAlbum();
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
    v-if="albumLoading"
    role="status"
    class="flex items-center gap-3 rounded-lg border p-6 text-sm text-muted-foreground"
  >
    <PeridotSpinner label="Loading album" />
    Loading this album…
  </div>
  <div
    v-else-if="albumError || tracksError"
    role="alert"
    class="space-y-3 rounded-lg border p-6 text-sm"
  >
    <p>{{ albumError || tracksError }}</p>
    <Button variant="outline" @click="loadAlbum">Try again</Button>
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
            :disabled="!album.trackCount"
            :aria-label="
              albumActive && playing
                ? `Pause ${album.title} by ${album.artist}`
                : `Play ${album.title} by ${album.artist} from the first track`
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
            :liked="
              likedAlbumKeys.includes(
                `${album.artist.toLowerCase()}\u0000${album.title.toLowerCase()}`,
              ) || album.liked
            "
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
            {{ album.trackCount }}
            {{ album.trackCount === 1 ? "track" : "tracks" }}
          </Badge>
          <span class="text-sm text-muted-foreground">
            <template v-if="album.releaseYear">
              {{ album.releaseYear }}
              <span aria-hidden="true">·</span>
            </template>
            {{ formatTrackDuration(album.durationMs) }}
          </span>
        </div>
      </div>
    </section>

    <section aria-labelledby="album-tracks-heading" class="space-y-4">
      <h2 id="album-tracks-heading" class="text-lg font-semibold">Tracks</h2>
      <div
        v-if="tracksLoading && !tracks.length"
        role="status"
        class="flex items-center gap-2 text-sm text-muted-foreground"
      >
        <PeridotSpinner class="size-4" />
        Loading tracks
      </div>
      <TrackTable
        v-else-if="tracks.length"
        :tracks="tracks"
        variant="album"
        :scroll-to-track-id="scrollToTrackId"
        :sort="trackSort"
        :has-more="hasMore"
        :loading-more="tracksLoadingMore"
        @sort-change="setTrackSort"
        @load-more="loadMoreTracks"
      />
      <p
        v-else-if="tracksLoaded"
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
