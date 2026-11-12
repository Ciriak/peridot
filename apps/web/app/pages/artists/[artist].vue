<script setup lang="ts">
import { definePageMeta, useHead, useI18n, useRoute } from "#imports";
import { Icon } from "@iconify/vue/offline";
import type { ArtistSummaryResponse } from "@peridot/contracts";
import { Badge } from "@peridot/ui/components/ui/badge";
import { Button } from "@peridot/ui/components/ui/button";
import { PeridotSpinner } from "@peridot/ui/components/ui/spinner";
import { computed, onMounted, ref, watch } from "vue";
import AlbumCard from "../../components/AlbumCard.vue";
import LikeButton from "../../components/LikeButton.vue";
import TrackTable from "../../components/TrackTable.vue";
import {
  useCatalogAlbumQuery,
  useCatalogTrackQuery,
} from "../../composables/use-catalog-query";
import { useLikes } from "../../composables/use-likes";
import { useLibraryPlayer } from "../../composables/use-library-player";
import { useServer } from "../../composables/use-server";
import { useSession } from "../../composables/use-session";
import { loadCollectionTrackIds } from "../../lib/catalog-collections";
import { icons } from "../../lib/icons";
import {
  artistLikeKey,
  formatTrackDuration,
  type TrackSort,
} from "../../lib/library";
import {
  isAuthenticationRedirectError,
  listArtists,
} from "../../lib/peridot-client";

definePageMeta({ name: "artist-detail" });

const route = useRoute();
const { t } = useI18n();
const { address } = useServer();
const { token } = useSession();
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
const artist = ref<ArtistSummaryResponse | null>(null);
const artistLoading = ref(true);
const artistError = ref("");
const trackSort = ref<TrackSort>({ field: "number", direction: "asc" });
const {
  items: albums,
  loadingMore: albumsLoadingMore,
  error: albumsError,
  hasMore: hasMoreAlbums,
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

async function loadArtist() {
  if (!address.value || !token.value) return;
  artistLoading.value = true;
  artistError.value = "";
  try {
    const page = await listArtists(address.value, token.value, {
      query: artistName.value,
      limit: 20,
    });
    artist.value =
      page.items.find(
        (candidate) =>
          candidate.name.toLowerCase() === artistName.value.toLowerCase(),
      ) ?? null;
    if (artist.value) {
      await Promise.all([loadAlbums(true), loadTracks(true)]);
    }
  } catch (reason) {
    if (isAuthenticationRedirectError(reason)) return;
    artistError.value = t("page.artist.loadError");
  } finally {
    artistLoading.value = false;
  }
}

async function playWholeArtist() {
  if (!address.value || !token.value || !artist.value) return;
  playCollection(
    await loadCollectionTrackIds(address.value, token.value, {
      artistId: artist.value.id,
    }),
  );
}

function setTrackSort(next: TrackSort | null) {
  trackSort.value = next ?? { field: "number", direction: "asc" };
}

watch([artistName, address, token], () => {
  artist.value = null;
  void loadArtist();
});
onMounted(() => {
  void loadArtist();
  void loadLikes();
});
</script>

<template>
  <div class="mb-2">
    <Button as-child variant="ghost" size="lg"
      ><NuxtLink to="/artists"
        ><Icon :icon="icons.arrowLeft" aria-hidden="true" />{{
          t("page.artist.back")
        }}</NuxtLink
      ></Button
    >
  </div>

  <div
    v-if="artistLoading"
    role="status"
    class="flex items-center gap-3 rounded-lg border p-6 text-sm text-muted-foreground"
  >
    <PeridotSpinner :label="t('page.artist.loading')" />
    {{ t("page.artist.loading") }}…
  </div>
  <div
    v-else-if="artistError || albumsError || tracksError"
    role="alert"
    class="space-y-3 rounded-lg border p-6 text-sm"
  >
    <p>{{ artistError || albumsError || tracksError }}</p>
    <Button variant="outline" @click="loadArtist">{{
      t("common.tryAgain")
    }}</Button>
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
          {{ t("page.artist.label") }}
        </p>
        <h1 id="artist-heading" class="text-3xl font-semibold tracking-tight">
          {{ artist.name }}
        </h1>
        <div class="flex flex-wrap items-center gap-3">
          <Button :disabled="!artist.trackCount" @click="playWholeArtist">
            <Icon :icon="icons.play" aria-hidden="true" />{{
              t("context.playArtist")
            }}
          </Button>
          <LikeButton
            :liked="
              likedArtistKeys.includes(artistLikeKey(artist.name)) ||
              artist.liked
            "
            :label="artist.name"
            :pending="isLikePending({ kind: 'artist', name: artist.name })"
            :disabled="!likesLoaded"
            @toggle="toggleLike({ kind: 'artist', name: artist.name })"
          />
          <Badge variant="secondary">
            {{
              t("count.album", { count: artist.albumCount }, artist.albumCount)
            }}
          </Badge>
          <Badge variant="secondary">
            {{
              t("count.track", { count: artist.trackCount }, artist.trackCount)
            }}
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
        <h2 id="artist-albums-heading" class="text-lg font-semibold">
          {{ t("navigation.albums") }}
        </h2>
        <Badge variant="secondary">
          {{
            `${t(
              "count.album",
              { count: albums.length },
              albums.length,
            )}${hasMoreAlbums ? "+" : ""}`
          }}
        </Badge>
      </div>
      <div
        class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5"
      >
        <AlbumCard v-for="album in albums" :key="album.id" :album="album" />
        <div v-if="hasMoreAlbums" class="col-span-full flex justify-center">
          <Button
            type="button"
            variant="outline"
            :disabled="albumsLoadingMore"
            @click="loadMoreAlbums"
          >
            {{
              albumsLoadingMore
                ? t("page.albums.loadingMore")
                : t("page.albums.loadMore")
            }}
          </Button>
        </div>
      </div>
    </section>

    <section aria-labelledby="artist-tracks-heading" class="space-y-4">
      <div class="flex items-center justify-between gap-4">
        <h2 id="artist-tracks-heading" class="text-lg font-semibold">
          {{ t("components.tracks.label") }}
        </h2>
        <Badge variant="secondary">
          {{
            `${t(
              "count.track",
              { count: tracks.length },
              tracks.length,
            )}${hasMoreTracks ? "+" : ""}`
          }}
        </Badge>
      </div>
      <div
        v-if="tracksLoading && !tracks.length"
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
