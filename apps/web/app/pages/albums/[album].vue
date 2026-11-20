<script setup lang="ts">
import { definePageMeta, useHead, useI18n, useRoute } from "#imports";
import { Icon } from "@iconify/vue/offline";
import type { AlbumSummaryResponse } from "@peridot/contracts";
import { Badge } from "@peridot/ui/components/ui/badge";
import { Button } from "@peridot/ui/components/ui/button";
import { ScrollingText } from "@peridot/ui/components/ui/scrolling-text";
import { PeridotSpinner } from "@peridot/ui/components/ui/spinner";
import { computed, onMounted, ref, watch } from "vue";
import AlbumContextMenu from "../../components/AlbumContextMenu.vue";
import AlbumLink from "../../components/AlbumLink.vue";
import BackButton from "../../components/BackButton.vue";
import FadeInImage from "../../components/FadeInImage.vue";
import LikeButton from "../../components/LikeButton.vue";
import ScrolledHeader from "../../components/ScrolledHeader.vue";
import TrackArtistLinks from "../../components/TrackArtistLinks.vue";
import TrackTable from "../../components/TrackTable.vue";
import {
  useCatalogAlbumQuery,
  useCatalogTrackQuery,
} from "../../composables/use-catalog-query";
import { useCachedArtwork } from "../../composables/use-cached-artwork";
import { useLikes } from "../../composables/use-likes";
import { useLibraryPlayer } from "../../composables/use-library-player";
import { useOfflineTracks } from "../../composables/use-offline-tracks";
import { useServerConnection } from "../../composables/use-server-connection";
import { useServer } from "../../composables/use-server";
import { useSession } from "../../composables/use-session";
import { loadCollectionTracks } from "../../lib/catalog-collections";
import { icons } from "../../lib/icons";
import {
  formatTrackDuration,
  trackCoverUrl,
  trackIdFromTitleHash,
  type TrackSort,
} from "../../lib/library";
import {
  isAuthenticationRedirectError,
  isPeridotNetworkError,
} from "../../lib/peridot-client";

definePageMeta({ name: "album-detail" });

const route = useRoute();
const { t } = useI18n();
const { address } = useServer();
const { token } = useSession();
const {
  active,
  playing,
  toggleCollectionPlayback,
  togglePlayback,
  isPlaybackTargetActive,
} = useLibraryPlayer();
const { status: serverStatus } = useServerConnection();
const { savedTracks, tracksMatching } = useOfflineTracks();
const {
  likedAlbumIds,
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
const requestedAlbumId = computed(() => {
  const value = route.query.id;
  return String(Array.isArray(value) ? (value[0] ?? "") : (value ?? ""));
});
const album = ref<AlbumSummaryResponse | null>(null);
const offlinePlaybackError = ref("");
const {
  items: albumMatches,
  loading: albumMatchesLoading,
  error: albumMatchesError,
  load: loadAlbumMatches,
} = useCatalogAlbumQuery(() => ({
  query: `${albumTitle.value} ${albumArtist.value}`.trim(),
  limit: 20,
  sort: "title",
}));
const albumLoading = computed(() => albumMatchesLoading.value && !album.value);
const albumError = computed(() => albumMatchesError.value ?? "");
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
  availability: album.value?.available ? "available" : ("all" as const),
  sort: trackSort.value.field === "number" ? "track" : trackSort.value.field,
  direction: trackSort.value.direction,
}));

const scrollToTrackId = computed(() => trackIdFromTitleHash(route.hash));
const albumActive = computed(() => {
  const current = active.value;
  return Boolean(current && album.value && current.albumId === album.value.id);
});
const albumTarget = computed(() => ({
  kind: "album" as const,
  id: album.value?.id ?? "",
}));
const albumPlaybackActive = computed(
  () =>
    isPlaybackTargetActive(albumTarget.value) ||
    (albumActive.value && playing.value),
);
const albumPlayable = computed(
  () =>
    Boolean(album.value?.trackCount) &&
    (album.value?.available ||
      savedTracks.value.some(
        (saved) => saved.track.albumId === album.value?.id,
      )),
);
const albumPlayLabel = computed(() =>
  album.value
    ? t("card.playAlbum", {
        album: album.value.title,
        artist: album.value.artist,
      })
    : "",
);
const albumPauseLabel = computed(() =>
  album.value
    ? t("card.pauseAlbum", {
        album: album.value.title,
        artist: album.value.artist,
      })
    : "",
);
const coverUrl = computed(() =>
  trackCoverUrl(address.value ?? "", album.value?.coverUrl ?? null),
);
const {
  artworkUrl: coverImageUrl,
  failed: coverFailed,
  fromCache: coverFromCache,
} = useCachedArtwork(coverUrl);
useHead(() => ({
  title: album.value
    ? t("page.album.title", {
        album: `${album.value.title} by ${album.value.artist}`,
      })
    : t("page.album.fallbackTitle"),
}));

function loadAlbum(force = false) {
  void loadAlbumMatches(force);
}

async function playWholeAlbum() {
  if (!album.value || !albumPlayable.value) return;
  offlinePlaybackError.value = "";
  try {
    const result = await toggleCollectionPlayback(
      albumTarget.value,
      async () => {
        const saved = await tracksMatching(
          (track) => track.albumId === album.value?.id,
        );
        if (
          serverStatus.value === "lost" ||
          !album.value?.available ||
          !address.value ||
          !token.value
        ) {
          return saved;
        }
        try {
          return await loadCollectionTracks(address.value, token.value, {
            albumId: album.value.id,
          });
        } catch (reason) {
          if (isPeridotNetworkError(reason)) return saved;
          throw reason;
        }
      },
    );
    if (result === "empty") {
      offlinePlaybackError.value = t("error.offlineCollectionEmpty");
    }
  } catch (reason) {
    if (!isAuthenticationRedirectError(reason)) {
      offlinePlaybackError.value = t("page.album.loadError");
    }
  }
}

function toggleAlbumPlayback() {
  if (
    albumActive.value &&
    playing.value &&
    !isPlaybackTargetActive(albumTarget.value)
  ) {
    togglePlayback();
    return;
  }
  void playWholeAlbum();
}

function setTrackSort(next: TrackSort | null) {
  trackSort.value = next ?? { field: "number", direction: "asc" };
}

watch([albumTitle, albumArtist, requestedAlbumId, address, token], () => {
  album.value = null;
  loadAlbum();
});
watch(
  albumMatches,
  (matches) => {
    const nextAlbum =
      matches.find((candidate) => candidate.id === requestedAlbumId.value) ??
      matches.find(
        (candidate) =>
          candidate.title.toLowerCase() === albumTitle.value.toLowerCase() &&
          candidate.artist.toLowerCase() === albumArtist.value.toLowerCase(),
      ) ??
      null;
    const changed = nextAlbum?.id !== album.value?.id;
    album.value = nextAlbum;
    if (nextAlbum && changed) void loadTracks();
  },
  { immediate: true },
);
onMounted(() => {
  loadAlbum();
  void loadLikes();
});
</script>

<template>
  <BackButton />

  <div
    v-if="albumLoading"
    role="status"
    class="flex items-center gap-3 rounded-lg border p-6 text-sm text-muted-foreground"
  >
    <PeridotSpinner :label="t('page.album.loading')" />
    {{ t("page.album.loading") }}…
  </div>
  <div
    v-else-if="albumError"
    role="alert"
    class="space-y-3 rounded-lg border p-6 text-sm"
  >
    <p>{{ albumError }}</p>
    <Button variant="outline" @click="loadAlbum(true)">{{
      t("common.tryAgain")
    }}</Button>
  </div>
  <template v-else-if="album">
    <p
      v-if="offlinePlaybackError"
      role="alert"
      class="mb-4 text-sm text-destructive"
    >
      {{ offlinePlaybackError }}
    </p>
    <ScrolledHeader
      :title="album.title"
      :playable="albumPlayable"
      :playback-active="albumPlaybackActive"
      :play-label="albumPlayLabel"
      :pause-label="albumPauseLabel"
      @play="toggleAlbumPlayback"
    >
      <AlbumContextMenu :album="album">
        <section
          aria-labelledby="album-heading"
          class="relative flex flex-col gap-6 rounded-lg border bg-card p-6 text-card-foreground sm:flex-row sm:items-end"
        >
          <LikeButton
            class="absolute right-4 top-4"
            :liked="likedAlbumIds.includes(album.id) || album.liked"
            :label="album.title"
            :pending="
              isLikePending({
                kind: 'album',
                albumId: album.id,
                title: album.title,
                artist: album.artist,
              })
            "
            :disabled="!likesLoaded"
            @toggle="
              toggleLike({
                kind: 'album',
                albumId: album.id,
                title: album.title,
                artist: album.artist,
              })
            "
          />
          <div
            aria-hidden="true"
            class="relative flex size-40 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-muted text-muted-foreground"
          >
            <Icon :icon="icons.album" class="size-16" />
            <FadeInImage
              v-if="coverImageUrl && !coverFailed"
              :src="coverImageUrl"
              :fade-in="!coverFromCache"
              loading="eager"
              class="absolute inset-0"
              @error="coverFailed = true"
            />
          </div>
          <div class="min-w-0 flex-1 space-y-3 pr-12">
            <p
              class="text-xs font-medium uppercase tracking-wide text-muted-foreground"
            >
              {{ t("page.album.label") }}
            </p>
            <h1
              id="album-heading"
              class="text-3xl font-semibold tracking-tight"
            >
              <AlbumLink :album="album">
                <ScrollingText class="w-full">{{ album.title }}</ScrollingText>
              </AlbumLink>
            </h1>
            <ScrollingText class="w-full text-sm text-muted-foreground">
              <TrackArtistLinks :artists="album.artists" />
            </ScrollingText>
            <div class="flex flex-wrap items-center gap-3">
              <Button
                size="icon-lg"
                class="rounded-full"
                :disabled="!albumPlayable"
                :aria-label="
                  albumPlaybackActive ? albumPauseLabel : albumPlayLabel
                "
                @click="toggleAlbumPlayback"
              >
                <Icon
                  :icon="albumPlaybackActive ? icons.pause : icons.play"
                  aria-hidden="true"
                  class="size-5"
                />
              </Button>
              <Badge variant="secondary">
                {{
                  t(
                    "count.track",
                    { count: album.trackCount },
                    album.trackCount,
                  )
                }}
              </Badge>
              <Badge v-if="!album.available" variant="secondary">
                {{ t("trackTable.unavailable") }}
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
      </AlbumContextMenu>
    </ScrolledHeader>

    <section aria-labelledby="album-tracks-heading" class="space-y-4">
      <h2 id="album-tracks-heading" class="text-lg font-semibold">
        {{ t("components.tracks.label") }}
      </h2>
      <div
        v-if="tracksError"
        role="alert"
        class="space-y-3 rounded-lg border p-6 text-sm"
      >
        <p>{{ tracksError }}</p>
        <Button variant="outline" @click="loadTracks(true)">{{
          t("common.tryAgain")
        }}</Button>
      </div>
      <div
        v-else-if="tracksLoading && !tracks.length"
        role="status"
        class="flex items-center gap-2 text-sm text-muted-foreground"
      >
        <PeridotSpinner
          :label="t('components.tracks.loading')"
          class="size-4"
        />
        {{ t("components.tracks.loading") }}
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
        {{ t("page.album.noTracks") }}
      </p>
    </section>
  </template>
  <section
    v-else
    role="status"
    class="space-y-4 rounded-lg border p-6 text-sm text-muted-foreground"
  >
    <p>{{ t("page.album.unavailable") }}</p>
    <Button as-child variant="outline"
      ><NuxtLink to="/albums">{{ t("page.album.back") }}</NuxtLink></Button
    >
  </section>
</template>
