<script setup lang="ts">
import { definePageMeta, useHead, useI18n, useRoute } from "#imports";
import { Icon } from "@iconify/vue/offline";
import type { ArtistSummaryResponse } from "@peridot/contracts";
import { Badge } from "@peridot/ui/components/ui/badge";
import { Button } from "@peridot/ui/components/ui/button";
import { ScrollingText } from "@peridot/ui/components/ui/scrolling-text";
import { PeridotSpinner } from "@peridot/ui/components/ui/spinner";
import { computed, onMounted, ref, watch } from "vue";
import ArtistArtwork from "../../components/ArtistArtwork.vue";
import ArtistContextMenu from "../../components/ArtistContextMenu.vue";
import ArtistLink from "../../components/ArtistLink.vue";
import AutoLoadMore from "../../components/AutoLoadMore.vue";
import BackButton from "../../components/BackButton.vue";
import CatalogCard from "../../components/CatalogCard.vue";
import LikeButton from "../../components/LikeButton.vue";
import ScrolledHeader from "../../components/ScrolledHeader.vue";
import TrackTable from "../../components/TrackTable.vue";
import VirtualCardGrid from "../../components/VirtualCardGrid.vue";
import {
  useCatalogArtistQuery,
  useCatalogAlbumQuery,
  useCatalogTrackQuery,
} from "../../composables/use-catalog-query";
import { useLikes } from "../../composables/use-likes";
import { useLibraryPlayer } from "../../composables/use-library-player";
import { useOfflineTracks } from "../../composables/use-offline-tracks";
import { useServerConnection } from "../../composables/use-server-connection";
import { useServer } from "../../composables/use-server";
import { useSession } from "../../composables/use-session";
import { loadCollectionTracks } from "../../lib/catalog-collections";
import { albumCatalogCard } from "../../lib/catalog-cards";
import { icons } from "../../lib/icons";
import {
  artistLikeKey,
  formatTrackDuration,
  trackArtistNames,
  type TrackSort,
} from "../../lib/library";
import {
  isAuthenticationRedirectError,
  isPeridotNetworkError,
} from "../../lib/peridot-client";

definePageMeta({ name: "artist-detail" });

const route = useRoute();
const { t } = useI18n();
const { address } = useServer();
const { token } = useSession();
const { toggleCollectionPlayback, isPlaybackTargetActive } = useLibraryPlayer();
const { status: serverStatus } = useServerConnection();
const { savedTracks, tracksMatching } = useOfflineTracks();
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
const artist = ref<ArtistSummaryResponse | null>(null);
const offlinePlaybackError = ref("");
const artistTarget = computed(() => ({
  kind: "artist" as const,
  id: artist.value?.id ?? "",
}));
const artistPlaybackActive = computed(() =>
  isPlaybackTargetActive(artistTarget.value),
);
const artistPlayable = computed(() => {
  if (!artist.value?.trackCount) return false;
  if (serverStatus.value !== "lost") return true;
  const localName = artist.value.localName.trim().toLowerCase();
  return savedTracks.value.some((saved) =>
    trackArtistNames(saved.track).some(
      (name) => name.trim().toLowerCase() === localName,
    ),
  );
});
const artistPlayLabel = computed(() => t("context.playArtist"));
const artistPauseLabel = computed(() => t("context.pauseArtist"));
const {
  items: artistMatches,
  loading: artistMatchesLoading,
  error: artistMatchesError,
  load: loadArtistMatches,
} = useCatalogArtistQuery(() => ({
  query: artistName.value,
  limit: 20,
}));
const artistLoading = computed(
  () => artistMatchesLoading.value && !artist.value,
);
const artistError = computed(() => artistMatchesError.value ?? "");
const trackSort = ref<TrackSort>({ field: "number", direction: "asc" });
const {
  items: albums,
  loadingMore: albumsLoadingMore,
  error: albumsError,
  hasMore: hasMoreAlbums,
  totalCount: albumTotalCount,
  load: loadAlbums,
  loadMore: loadMoreAlbums,
} = useCatalogAlbumQuery(() => ({
  artistId: artist.value?.id ?? "__peridot_missing_artist__",
  sort: "title",
}));
const {
  tracks,
  loading: tracksLoading,
  loadingMore: tracksLoadingMore,
  error: tracksError,
  loaded: tracksLoaded,
  hasMore: hasMoreTracks,
  totalCount: trackTotalCount,
  load: loadTracks,
  loadMore: loadMoreTracks,
} = useCatalogTrackQuery(() => ({
  artistId: artist.value?.id ?? "__peridot_missing_artist__",
  sort: trackSort.value.field === "number" ? "track" : trackSort.value.field,
  direction: trackSort.value.direction,
}));

useHead(() => ({
  title: artist.value
    ? t("page.artist.title", { artist: artist.value.name })
    : t("page.artist.fallbackTitle"),
}));

function loadArtist(force = false) {
  void loadArtistMatches(force);
}

async function playWholeArtist() {
  if (!artist.value || !artistPlayable.value) return;
  offlinePlaybackError.value = "";
  try {
    const result = await toggleCollectionPlayback(
      artistTarget.value,
      async () => {
        const localName = artist.value?.localName.trim().toLowerCase();
        const saved = await tracksMatching((track) =>
          trackArtistNames(track).some(
            (name) => name.trim().toLowerCase() === localName,
          ),
        );
        if (serverStatus.value === "lost" || !address.value || !token.value) {
          return saved;
        }
        try {
          return await loadCollectionTracks(address.value, token.value, {
            artistId: artist.value?.id ?? "",
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
      offlinePlaybackError.value = t("page.artist.loadError");
    }
  }
}

function setTrackSort(next: TrackSort | null) {
  trackSort.value = next ?? { field: "number", direction: "asc" };
}

watch([artistName, address, token], () => {
  artist.value = null;
  loadArtist();
});
watch(
  artistMatches,
  (matches) => {
    const nextArtist =
      matches.find(
        (candidate) =>
          candidate.localName.toLowerCase() === artistName.value.toLowerCase(),
      ) ??
      matches.find(
        (candidate) =>
          candidate.name.toLowerCase() === artistName.value.toLowerCase(),
      ) ??
      null;
    const changed = nextArtist?.id !== artist.value?.id;
    artist.value = nextArtist;
    if (nextArtist && changed) {
      void Promise.all([loadAlbums(), loadTracks()]);
    }
  },
  { immediate: true },
);
onMounted(() => {
  loadArtist();
  void loadLikes();
});
</script>

<template>
  <BackButton />

  <div
    v-if="artistLoading"
    role="status"
    class="flex items-center gap-3 rounded-lg border p-6 text-sm text-muted-foreground"
  >
    <PeridotSpinner :label="t('page.artist.loading')" />
    {{ t("page.artist.loading") }}…
  </div>
  <div
    v-else-if="artistError"
    role="alert"
    class="space-y-3 rounded-lg border p-6 text-sm"
  >
    <p>{{ artistError }}</p>
    <Button variant="outline" @click="loadArtist(true)">{{
      t("common.tryAgain")
    }}</Button>
  </div>
  <template v-else-if="artist">
    <p
      v-if="offlinePlaybackError"
      role="alert"
      class="mb-4 text-sm text-destructive"
    >
      {{ offlinePlaybackError }}
    </p>
    <ScrolledHeader
      :title="artist.name"
      :playable="artistPlayable"
      :playback-active="artistPlaybackActive"
      :play-label="artistPlayLabel"
      :pause-label="artistPauseLabel"
      @play="playWholeArtist"
    >
      <ArtistContextMenu :artist="artist">
        <section
          aria-labelledby="artist-heading"
          class="flex flex-col gap-6 rounded-lg border bg-card p-6 text-card-foreground sm:flex-row sm:items-end"
        >
          <ArtistArtwork :image-url="artist.imageUrl" size="lg" />
          <div class="min-w-0 flex-1 space-y-3">
            <p
              class="text-xs font-medium uppercase tracking-wide text-muted-foreground"
            >
              {{ t("page.artist.label") }}
            </p>
            <h1
              id="artist-heading"
              class="text-3xl font-semibold tracking-tight"
            >
              <ArtistLink :artist="artist">
                <ScrollingText class="w-full">{{ artist.name }}</ScrollingText>
              </ArtistLink>
            </h1>
            <p
              v-if="artist.name !== artist.localName"
              class="text-sm text-muted-foreground"
            >
              <span>{{ t("page.artist.localNameLabel") }}:</span>
              <ArtistLink :artist="artist.localName">
                <ScrollingText class="w-full">{{
                  artist.localName
                }}</ScrollingText>
              </ArtistLink>
            </p>
            <div class="flex flex-wrap items-center gap-3">
              <Button
                :disabled="!artistPlayable"
                :aria-label="
                  artistPlaybackActive ? artistPauseLabel : artistPlayLabel
                "
                @click="playWholeArtist"
              >
                <Icon
                  :icon="artistPlaybackActive ? icons.pause : icons.play"
                  aria-hidden="true"
                />{{
                  artistPlaybackActive ? artistPauseLabel : artistPlayLabel
                }}
              </Button>
              <LikeButton
                :liked="
                  likedArtistKeys.includes(artistLikeKey(artist.localName)) ||
                  artist.liked
                "
                :label="artist.name"
                :pending="
                  isLikePending({ kind: 'artist', name: artist.localName })
                "
                :disabled="!likesLoaded"
                @toggle="toggleLike({ kind: 'artist', name: artist.localName })"
              />
              <Badge variant="secondary">
                {{
                  t(
                    "count.album",
                    { count: artist.albumCount },
                    artist.albumCount,
                  )
                }}
              </Badge>
              <Badge variant="secondary">
                {{
                  t(
                    "count.track",
                    { count: artist.trackCount },
                    artist.trackCount,
                  )
                }}
              </Badge>
              <span class="text-sm text-muted-foreground">
                {{ formatTrackDuration(artist.durationMs) }}
              </span>
            </div>
          </div>
        </section>
      </ArtistContextMenu>
    </ScrolledHeader>

    <div
      v-if="albumsError"
      role="alert"
      class="space-y-3 rounded-lg border p-6 text-sm"
    >
      <p>{{ albumsError }}</p>
      <Button variant="outline" @click="loadAlbums(true)">{{
        t("common.tryAgain")
      }}</Button>
    </div>
    <section
      v-else-if="albums.length"
      aria-labelledby="artist-albums-heading"
      class="space-y-4"
    >
      <div class="flex flex-wrap items-center gap-2">
        <h2 id="artist-albums-heading" class="text-lg font-semibold">
          {{ t("navigation.albums") }}
        </h2>
        <Badge variant="secondary">
          {{ t("count.album", { count: albumTotalCount }, albumTotalCount) }}
        </Badge>
      </div>
      <VirtualCardGrid
        :items="albums"
        layout="wide"
        :item-key="(album) => album.id"
        :estimate-row-height="300"
      >
        <template #default="{ item }">
          <CatalogCard :item="albumCatalogCard(item)" />
        </template>
        <template #footer>
          <AutoLoadMore
            :enabled="hasMoreAlbums"
            :loading="albumsLoadingMore"
            :item-count="albums.length"
            :label="t('page.albums.loadingMore')"
            @load="loadMoreAlbums"
          />
        </template>
      </VirtualCardGrid>
    </section>

    <section aria-labelledby="artist-tracks-heading" class="space-y-4">
      <div class="flex flex-wrap items-center gap-2">
        <h2 id="artist-tracks-heading" class="text-lg font-semibold">
          {{ t("components.tracks.label") }}
        </h2>
        <Badge variant="secondary">
          {{ t("count.track", { count: trackTotalCount }, trackTotalCount) }}
        </Badge>
      </div>
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
        variant="artist"
        :sort="trackSort"
        :has-more="hasMoreTracks"
        :loading-more="tracksLoadingMore"
        @sort-change="setTrackSort"
        @load-more="loadMoreTracks"
      />
      <p
        v-else-if="tracksLoaded"
        role="status"
        class="rounded-lg border p-6 text-sm text-muted-foreground"
      >
        {{ t("page.artist.noTracks") }}
      </p>
    </section>
  </template>
  <section
    v-else
    role="status"
    class="space-y-4 rounded-lg border p-6 text-sm text-muted-foreground"
  >
    <p>{{ t("page.artist.unavailable") }}</p>
    <Button as-child variant="outline"
      ><NuxtLink to="/artists">{{ t("page.artist.back") }}</NuxtLink></Button
    >
  </section>
</template>
