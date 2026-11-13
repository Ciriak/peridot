<script setup lang="ts">
import { useHead, useI18n } from "#imports";
import { Icon } from "@iconify/vue/offline";
import { Badge } from "@peridot/ui/components/ui/badge";
import { Button } from "@peridot/ui/components/ui/button";
import { PeridotSpinner } from "@peridot/ui/components/ui/spinner";
import { computed, onMounted, ref } from "vue";
import AlbumCard from "../components/AlbumCard.vue";
import ArtistCard from "../components/ArtistCard.vue";
import TrackTable from "../components/TrackTable.vue";
import {
  useCatalogAlbumQuery,
  useCatalogArtistQuery,
  useCatalogTrackQuery,
} from "../composables/use-catalog-query";
import { useLikes } from "../composables/use-likes";
import { icons } from "../lib/icons";
import type { TrackSort } from "../lib/library";

const { t } = useI18n();
useHead({ title: t("page.home.title") });

const {
  trackItems,
  albumItems,
  artistItems,
  loading: likesLoading,
  load: loadLikes,
} = useLikes();

const HOME_PREVIEW_LIMIT = 10;
const trackSort = ref<TrackSort>({ field: "title", direction: "asc" });
const likedTrackCount = computed(() => trackItems.value.length);
const likedAlbumCount = computed(() => albumItems.value.length);
const likedArtistCount = computed(() => artistItems.value.length);

const {
  tracks: likedTracks,
  loading: likedTracksLoading,
  error: likedTracksError,
  loaded: likedTracksLoaded,
  load: loadLikedTracks,
} = useCatalogTrackQuery(() => ({
  liked: true,
  limit: HOME_PREVIEW_LIMIT,
  sort: trackSort.value.field === "number" ? "track" : trackSort.value.field,
  direction: trackSort.value.direction,
}));

const {
  items: likedAlbums,
  loading: likedAlbumsLoading,
  error: likedAlbumsError,
  loaded: likedAlbumsLoaded,
  load: loadLikedAlbums,
} = useCatalogAlbumQuery(() => ({
  liked: true,
  limit: HOME_PREVIEW_LIMIT,
  sort: "title",
  direction: "asc",
}));

const {
  items: likedArtists,
  loading: likedArtistsLoading,
  error: likedArtistsError,
  loaded: likedArtistsLoaded,
  load: loadLikedArtists,
} = useCatalogArtistQuery(() => ({
  liked: true,
  limit: HOME_PREVIEW_LIMIT,
  sort: "name",
  direction: "asc",
}));

const likedTrackPreview = computed(() =>
  likedTracks.value.slice(0, HOME_PREVIEW_LIMIT),
);
const likedAlbumPreview = computed(() =>
  likedAlbums.value.slice(0, HOME_PREVIEW_LIMIT),
);
const likedArtistPreview = computed(() =>
  likedArtists.value.slice(0, HOME_PREVIEW_LIMIT),
);

function setTrackSort(next: TrackSort | null) {
  trackSort.value = next ?? { field: "title", direction: "asc" };
}

onMounted(() => {
  void loadLikedTracks();
  void loadLikedAlbums();
  void loadLikedArtists();
  void loadLikes();
});
</script>

<template>
  <div class="space-y-10">
    <header class="space-y-2">
      <h1 class="text-2xl font-semibold tracking-tight">
        {{ t("page.home.heading") }}
      </h1>
      <p class="text-sm text-muted-foreground">
        {{ t("page.home.description") }}
      </p>
    </header>

    <section
      aria-labelledby="home-liked-songs-heading"
      class="space-y-4"
      :aria-busy="likedTracksLoading"
    >
      <div class="flex flex-wrap items-center justify-between gap-3">
        <h2 id="home-liked-songs-heading" class="text-lg font-semibold">
          {{ t("page.home.likedSongs") }}
        </h2>
        <div class="flex items-center gap-2">
          <Badge variant="secondary">
            {{
              likesLoading
                ? t("common.loading")
                : t("count.track", { count: likedTrackCount }, likedTrackCount)
            }}
          </Badge>
          <Button as-child variant="ghost" size="sm">
            <NuxtLink to="/liked">{{ t("page.home.viewAll") }}</NuxtLink>
          </Button>
        </div>
      </div>
      <div
        v-if="likedTracksLoading && !likedTrackPreview.length"
        role="status"
        class="flex items-center gap-3 rounded-lg border p-6 text-sm text-muted-foreground"
      >
        <PeridotSpinner :label="t('page.home.loadingLikedSongs')" />
        {{ t("page.home.loadingLikedSongs") }}
      </div>
      <div
        v-else-if="likedTracksError"
        role="alert"
        class="space-y-3 rounded-lg border p-6 text-sm"
      >
        <p>{{ likedTracksError }}</p>
        <Button variant="outline" @click="loadLikedTracks(true)">
          {{ t("common.tryAgain") }}
        </Button>
      </div>
      <TrackTable
        v-else-if="likedTrackPreview.length"
        :tracks="likedTrackPreview"
        variant="library"
        :sort="trackSort"
        @sort-change="setTrackSort"
      />
      <p
        v-else
        role="status"
        class="rounded-lg border p-6 text-sm text-muted-foreground"
      >
        {{
          likedTracksLoaded
            ? t("page.home.noLikedSongs")
            : t("page.home.loadingLikedSongs")
        }}
      </p>
    </section>

    <section aria-labelledby="home-playlists-heading" class="space-y-4">
      <div class="flex flex-wrap items-center justify-between gap-3">
        <h2 id="home-playlists-heading" class="text-lg font-semibold">
          {{ t("page.home.playlists") }}
        </h2>
        <div class="flex items-center gap-2">
          <Badge variant="secondary">{{ t("page.home.comingSoon") }}</Badge>
          <Button as-child variant="ghost" size="sm">
            <NuxtLink to="/playlists">{{ t("page.home.viewAll") }}</NuxtLink>
          </Button>
        </div>
      </div>
      <div
        class="flex flex-col gap-4 rounded-lg border bg-card p-6 text-card-foreground sm:flex-row sm:items-center"
      >
        <div
          class="flex size-12 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground"
        >
          <Icon :icon="icons.playlist" aria-hidden="true" class="size-6" />
        </div>
        <div class="min-w-0 flex-1 space-y-1">
          <h3 class="font-medium">{{ t("page.playlists.emptyTitle") }}</h3>
          <p class="text-sm text-muted-foreground">
            {{ t("page.playlists.placeholder") }}
          </p>
        </div>
      </div>
    </section>

    <section
      aria-labelledby="home-liked-albums-heading"
      class="space-y-4"
      :aria-busy="likedAlbumsLoading"
    >
      <div class="flex flex-wrap items-center justify-between gap-3">
        <h2 id="home-liked-albums-heading" class="text-lg font-semibold">
          {{ t("page.home.likedAlbums") }}
        </h2>
        <div class="flex items-center gap-2">
          <Badge variant="secondary">
            {{
              likesLoading
                ? t("common.loading")
                : t("count.album", { count: likedAlbumCount }, likedAlbumCount)
            }}
          </Badge>
          <Button as-child variant="ghost" size="sm">
            <NuxtLink to="/albums">{{ t("page.home.allAlbums") }}</NuxtLink>
          </Button>
        </div>
      </div>
      <div
        v-if="likedAlbumsLoading && !likedAlbumPreview.length"
        role="status"
        class="flex items-center gap-3 rounded-lg border p-6 text-sm text-muted-foreground"
      >
        <PeridotSpinner :label="t('page.home.loadingLikedAlbums')" />
        {{ t("page.home.loadingLikedAlbums") }}
      </div>
      <div
        v-else-if="likedAlbumsError"
        role="alert"
        class="space-y-3 rounded-lg border p-6 text-sm"
      >
        <p>{{ likedAlbumsError }}</p>
        <Button variant="outline" @click="loadLikedAlbums(true)">
          {{ t("common.tryAgain") }}
        </Button>
      </div>
      <div
        v-else-if="likedAlbumPreview.length"
        class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5"
      >
        <AlbumCard
          v-for="album in likedAlbumPreview"
          :key="album.id"
          :album="album"
        />
      </div>
      <p
        v-else
        role="status"
        class="rounded-lg border p-6 text-sm text-muted-foreground"
      >
        {{
          likedAlbumsLoaded
            ? t("page.home.noLikedAlbums")
            : t("page.home.loadingLikedAlbums")
        }}
      </p>
    </section>

    <section
      aria-labelledby="home-liked-artists-heading"
      class="space-y-4"
      :aria-busy="likedArtistsLoading"
    >
      <div class="flex flex-wrap items-center justify-between gap-3">
        <h2 id="home-liked-artists-heading" class="text-lg font-semibold">
          {{ t("page.home.likedArtists") }}
        </h2>
        <div class="flex items-center gap-2">
          <Badge variant="secondary">
            {{
              likesLoading
                ? t("common.loading")
                : t(
                    "count.artist",
                    { count: likedArtistCount },
                    likedArtistCount,
                  )
            }}
          </Badge>
          <Button as-child variant="ghost" size="sm">
            <NuxtLink to="/artists">{{ t("page.home.allArtists") }}</NuxtLink>
          </Button>
        </div>
      </div>
      <div
        v-if="likedArtistsLoading && !likedArtistPreview.length"
        role="status"
        class="flex items-center gap-3 rounded-lg border p-6 text-sm text-muted-foreground"
      >
        <PeridotSpinner :label="t('page.home.loadingLikedArtists')" />
        {{ t("page.home.loadingLikedArtists") }}
      </div>
      <div
        v-else-if="likedArtistsError"
        role="alert"
        class="space-y-3 rounded-lg border p-6 text-sm"
      >
        <p>{{ likedArtistsError }}</p>
        <Button variant="outline" @click="loadLikedArtists(true)">
          {{ t("common.tryAgain") }}
        </Button>
      </div>
      <div
        v-else-if="likedArtistPreview.length"
        class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5"
      >
        <ArtistCard
          v-for="artist in likedArtistPreview"
          :key="artist.id"
          :artist="artist"
        />
      </div>
      <p
        v-else
        role="status"
        class="rounded-lg border p-6 text-sm text-muted-foreground"
      >
        {{
          likedArtistsLoaded
            ? t("page.home.noLikedArtists")
            : t("page.home.loadingLikedArtists")
        }}
      </p>
    </section>
  </div>
</template>
