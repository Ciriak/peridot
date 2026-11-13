<script setup lang="ts">
import { useHead, useI18n } from "#imports";
import { Badge } from "@peridot/ui/components/ui/badge";
import { Button } from "@peridot/ui/components/ui/button";
import { PeridotSpinner } from "@peridot/ui/components/ui/spinner";
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import AlbumCard from "../components/AlbumCard.vue";
import PlaylistCard from "../components/PlaylistCard.vue";
import TrackTable from "../components/TrackTable.vue";
import {
  useCatalogAlbumQuery,
  useCatalogTrackQuery,
} from "../composables/use-catalog-query";
import { useLikes } from "../composables/use-likes";
import { usePlaylistList } from "../composables/use-playlists";
import { useUser } from "../composables/use-user";
import { HOME_GREETING_KEYS, homeGreetingPeriod } from "../lib/home-greeting";
import {
  HOME_SUGGESTION_LIMIT,
  selectHomeAlbumSuggestions,
  selectHomeTrackSuggestions,
} from "../lib/home-suggestions";

const { t } = useI18n();
const { user } = useUser();
useHead({ title: t("page.home.title") });
const now = ref(new Date());
const greeting = computed(() =>
  t(HOME_GREETING_KEYS[homeGreetingPeriod(now.value)], {
    username: user.value?.displayName ?? "",
  }),
);

const {
  likedAlbumIds,
  likedTrackIds,
  likedArtistKeys,
  loading: likesLoading,
  error: likesError,
  load: loadLikes,
} = useLikes();

const HOME_PREVIEW_LIMIT = HOME_SUGGESTION_LIMIT;
const HOME_CANDIDATE_LIMIT = 100;

const {
  items: albums,
  loading: albumsLoading,
  error: albumsError,
  loaded: albumsLoaded,
  load: loadAlbums,
} = useCatalogAlbumQuery(() => ({
  limit: HOME_CANDIDATE_LIMIT,
  sort: "title",
  direction: "asc",
}));

const {
  tracks,
  loading: tracksLoading,
  error: tracksError,
  loaded: tracksLoaded,
  load: loadTracks,
} = useCatalogTrackQuery(() => ({
  limit: HOME_CANDIDATE_LIMIT,
  sort: "title",
  direction: "asc",
}));
const {
  items: playlists,
  totalCount: playlistCount,
  loading: playlistsLoading,
  error: playlistsError,
  loaded: playlistsLoaded,
  load: loadPlaylists,
} = usePlaylistList(HOME_PREVIEW_LIMIT);

const suggestedAlbums = computed(() =>
  selectHomeAlbumSuggestions({
    albums: albums.value,
    likedAlbumIds: likedAlbumIds.value,
    likedArtistKeys: likedArtistKeys.value,
  }),
);
const suggestedTracks = computed(() =>
  selectHomeTrackSuggestions({
    tracks: tracks.value,
    likedTrackIds: likedTrackIds.value,
    likedArtistKeys: likedArtistKeys.value,
  }),
);
const suggestionCount = computed(
  () => suggestedAlbums.value.length + suggestedTracks.value.length,
);
const playlistPreview = computed(() =>
  playlists.value.slice(0, HOME_PREVIEW_LIMIT),
);
const suggestionsLoading = computed(
  () => likesLoading.value || albumsLoading.value || tracksLoading.value,
);
const suggestionsLoaded = computed(
  () => !likesLoading.value && albumsLoaded.value && tracksLoaded.value,
);
const suggestionsError = computed(
  () => likesError.value ?? albumsError.value ?? tracksError.value,
);

function retrySuggestions() {
  void loadLikes(true);
  void loadAlbums(true);
  void loadTracks(true);
}

let greetingClock: ReturnType<typeof setInterval> | undefined;

onMounted(() => {
  greetingClock = setInterval(() => {
    now.value = new Date();
  }, 60_000);
  void loadAlbums();
  void loadTracks();
  void loadLikes();
  void loadPlaylists();
});

onBeforeUnmount(() => {
  if (greetingClock !== undefined) clearInterval(greetingClock);
});
</script>

<template>
  <div class="space-y-10">
    <header>
      <h1 class="text-2xl font-semibold tracking-tight">
        {{ greeting }}
      </h1>
    </header>

    <section
      aria-labelledby="home-suggestions-heading"
      class="space-y-4"
      :aria-busy="suggestionsLoading"
    >
      <h2 id="home-suggestions-heading" class="text-lg font-semibold">
        {{ t("page.home.suggestions") }}
      </h2>
      <div
        v-if="suggestionsLoading && !suggestionCount"
        role="status"
        class="flex items-center gap-3 rounded-lg border p-6 text-sm text-muted-foreground"
      >
        <PeridotSpinner :label="t('page.home.loadingSuggestions')" />
        {{ t("page.home.loadingSuggestions") }}
      </div>
      <div
        v-else-if="suggestionsError"
        role="alert"
        class="space-y-3 rounded-lg border p-6 text-sm"
      >
        <p>{{ suggestionsError }}</p>
        <Button variant="outline" @click="retrySuggestions">
          {{ t("common.tryAgain") }}
        </Button>
      </div>
      <div v-else-if="suggestionCount" class="space-y-6">
        <div
          v-if="suggestedAlbums.length"
          class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5"
        >
          <AlbumCard
            v-for="album in suggestedAlbums"
            :key="album.id"
            :album="album"
          />
        </div>
        <div v-if="suggestedTracks.length" class="space-y-3">
          <h3 class="text-base font-semibold">{{ t("page.home.tracks") }}</h3>
          <TrackTable :tracks="suggestedTracks" variant="library" />
        </div>
      </div>
      <p
        v-else
        role="status"
        class="rounded-lg border p-6 text-sm text-muted-foreground"
      >
        {{
          suggestionsLoaded
            ? t("page.home.noSuggestions")
            : t("page.home.loadingSuggestions")
        }}
      </p>
    </section>

    <section
      aria-labelledby="home-playlists-heading"
      class="space-y-4"
      :aria-busy="playlistsLoading"
    >
      <div class="flex flex-wrap items-center justify-between gap-3">
        <h2 id="home-playlists-heading" class="text-lg font-semibold">
          {{ t("page.home.playlists") }}
        </h2>
        <div class="flex items-center gap-2">
          <Badge variant="secondary">
            {{ playlistsLoading ? t("common.loading") : playlistCount }}
          </Badge>
          <Button as-child variant="ghost" size="sm">
            <NuxtLink to="/playlists">{{ t("page.home.viewAll") }}</NuxtLink>
          </Button>
        </div>
      </div>
      <div
        v-if="playlistsLoading && !playlistPreview.length"
        role="status"
        class="flex items-center gap-3 rounded-lg border p-6 text-sm text-muted-foreground"
      >
        <PeridotSpinner :label="t('page.home.loadingPlaylists')" />
        {{ t("page.home.loadingPlaylists") }}
      </div>
      <div
        v-else-if="playlistsError && !playlistPreview.length"
        role="alert"
        class="space-y-3 rounded-lg border p-6 text-sm"
      >
        <p>{{ playlistsError }}</p>
        <Button variant="outline" @click="loadPlaylists(true)">
          {{ t("common.tryAgain") }}
        </Button>
      </div>
      <div
        v-else-if="playlistPreview.length"
        class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5"
      >
        <PlaylistCard
          v-for="playlist in playlistPreview"
          :key="playlist.id"
          :playlist="playlist"
        />
      </div>
      <p
        v-else
        role="status"
        class="rounded-lg border p-6 text-sm text-muted-foreground"
      >
        {{
          playlistsLoaded
            ? t("page.home.noPlaylists")
            : t("page.home.loadingPlaylists")
        }}
      </p>
    </section>
  </div>
</template>
