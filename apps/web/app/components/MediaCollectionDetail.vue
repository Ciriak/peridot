<script setup lang="ts">
import { useI18n, useRoute } from "#imports";
import type { LikeTarget } from "@peridot/contracts";
import { Icon } from "@iconify/vue/offline";
import { Badge } from "@peridot/ui/components/ui/badge";
import { Button } from "@peridot/ui/components/ui/button";
import { ScrollingText } from "@peridot/ui/components/ui/scrolling-text";
import { PeridotSpinner } from "@peridot/ui/components/ui/spinner";
import { computed, onMounted, ref, watch } from "vue";
import { useCatalogTrackQuery } from "../composables/use-catalog-query";
import { useCachedArtwork } from "../composables/use-cached-artwork";
import { useLikes } from "../composables/use-likes";
import { useLibraryPlayer } from "../composables/use-library-player";
import { useMediaCollection } from "../composables/use-media-collection";
import { useOfflineTracks } from "../composables/use-offline-tracks";
import { useServerConnection } from "../composables/use-server-connection";
import { useServer } from "../composables/use-server";
import { useSession } from "../composables/use-session";
import { loadCollectionTracks } from "../lib/catalog-collections";
import { icons } from "../lib/icons";
import {
  formatTrackDuration,
  trackCoverUrl,
  trackIdFromTitleHash,
  type TrackSort,
} from "../lib/library";
import {
  isAuthenticationRedirectError,
  isPeridotNetworkError,
} from "../lib/peridot-client";
import FadeInImage from "./FadeInImage.vue";
import LikeButton from "./LikeButton.vue";
import MediaCollectionOfflineButton from "./MediaCollectionOfflineButton.vue";
import TrackTable from "./TrackTable.vue";

const props = defineProps<{
  mediaType: "audiobook" | "podcast";
  title: string;
  creator: string;
  requestedId: string;
}>();

const route = useRoute();
const { t } = useI18n();
const { address } = useServer();
const { token } = useSession();
const { active, playing, playCollection, togglePlayback } = useLibraryPlayer();
const { status: serverStatus } = useServerConnection();
const { savedTracks, tracksMatching } = useOfflineTracks();
const {
  likedAudiobookIds,
  likedPodcastIds,
  loaded: likesLoaded,
  load: loadLikes,
  toggle: toggleLike,
  isPending: isLikePending,
} = useLikes();
const offlinePlaybackError = ref("");
const trackSort = ref<TrackSort>(
  props.mediaType === "podcast"
    ? { field: "title", direction: "desc" }
    : { field: "number", direction: "asc" },
);
const collectionSort = computed<
  "track" | "title" | "artist" | "album" | "duration" | "published"
>(() => {
  if (trackSort.value.field === "number") return "track";
  if (props.mediaType === "podcast" && trackSort.value.field === "title") {
    return "published";
  }
  return trackSort.value.field;
});
const {
  collection,
  loading: collectionLoading,
  error: collectionError,
  load: loadCollection,
} = useMediaCollection(
  () => props.mediaType,
  () => props.requestedId,
  () => props.title,
);
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
  mediaType: props.mediaType,
  collectionId: collection.value?.id ?? "__peridot_missing_collection__",
  availability: collection.value?.available ? "available" : ("all" as const),
  sort: collectionSort.value,
  direction: trackSort.value.direction,
}));
const scrollToTrackId = computed(() => trackIdFromTitleHash(route.hash));
const icon = computed(() =>
  props.mediaType === "audiobook" ? icons.book : icons.podcast,
);
const itemCount = computed(() =>
  collection.value
    ? collection.value.mediaType === "audiobook"
      ? collection.value.chapterCount
      : collection.value.episodeCount
    : 0,
);
const creatorLabel = computed(() =>
  collection.value?.mediaType === "audiobook"
    ? collection.value.author
    : collection.value?.mediaType === "podcast"
      ? collection.value.publisher
      : props.creator,
);
const collectionActive = computed(
  () => active.value?.albumId === collection.value?.id,
);
const collectionPlayable = computed(
  () =>
    itemCount.value > 0 &&
    (collection.value?.available ||
      savedTracks.value.some(
        (saved) => saved.track.albumId === collection.value?.id,
      )),
);
const coverUrl = computed(() =>
  trackCoverUrl(address.value ?? "", collection.value?.coverUrl ?? null),
);
const { artworkUrl: coverImageUrl, failed: coverFailed } =
  useCachedArtwork(coverUrl);
const likeTarget = computed<LikeTarget | null>(() => {
  const current = collection.value;
  if (!current) return null;
  return current.mediaType === "audiobook"
    ? {
        kind: "audiobook",
        audiobookId: current.id,
        title: current.title,
        author: current.author,
      }
    : {
        kind: "podcast",
        podcastId: current.id,
        title: current.title,
        publisher: current.publisher,
      };
});
const liked = computed(() => {
  const current = collection.value;
  if (!current) return false;
  if (!likesLoaded.value) return current.liked;
  return current.mediaType === "audiobook"
    ? likedAudiobookIds.value.includes(current.id)
    : likedPodcastIds.value.includes(current.id);
});
const countKey = computed(() =>
  props.mediaType === "audiobook" ? "count.chapter" : "count.episode",
);
const kindLabelKey = computed(() =>
  props.mediaType === "audiobook"
    ? "page.audiobook.label"
    : "page.podcast.label",
);
const backRoute = computed(() =>
  props.mediaType === "audiobook" ? "/audiobooks" : "/podcasts",
);
const backLabelKey = computed(() =>
  props.mediaType === "audiobook" ? "page.audiobook.back" : "page.podcast.back",
);
const unavailableKey = computed(() =>
  props.mediaType === "audiobook"
    ? "page.audiobook.unavailable"
    : "page.podcast.unavailable",
);
const emptyKey = computed(() =>
  props.mediaType === "audiobook"
    ? "page.audiobook.noTracks"
    : "page.podcast.noTracks",
);

function setTrackSort(next: TrackSort | null) {
  trackSort.value =
    next ??
    (props.mediaType === "podcast"
      ? { field: "title", direction: "desc" }
      : { field: "number", direction: "asc" });
}

async function playWholeCollection() {
  const current = collection.value;
  if (!address.value || !token.value || !current || !collectionPlayable.value)
    return;
  offlinePlaybackError.value = "";
  const playSavedTracks = async () => {
    const saved = await tracksMatching((track) => track.albumId === current.id);
    if (!saved.length) {
      offlinePlaybackError.value = t("error.offlineCollectionEmpty");
      return;
    }
    playCollection(saved);
  };
  if (serverStatus.value === "lost" || !current.available) {
    await playSavedTracks();
    return;
  }
  try {
    playCollection(
      await loadCollectionTracks(address.value, token.value, {
        collectionId: current.id,
        mediaType: current.mediaType,
      }),
    );
  } catch (reason) {
    if (isPeridotNetworkError(reason)) {
      await playSavedTracks();
      return;
    }
    if (!isAuthenticationRedirectError(reason)) {
      offlinePlaybackError.value = t("error.catalogLoad");
    }
  }
}

function toggleCollectionPlayback() {
  if (collectionActive.value && playing.value) {
    togglePlayback();
    return;
  }
  void playWholeCollection();
}

watch(
  () => [props.requestedId, address.value, token.value],
  () => void loadCollection(),
);
watch(
  collection,
  (next, previous) => {
    if (next && next.id !== previous?.id) void loadTracks();
  },
  { immediate: true },
);
onMounted(() => {
  void loadCollection();
  void loadLikes();
});
</script>

<template>
  <div class="mb-2">
    <Button as-child variant="ghost" size="lg">
      <NuxtLink :to="backRoute">
        <Icon :icon="icons.arrowLeft" aria-hidden="true" />
        {{ t(backLabelKey) }}
      </NuxtLink>
    </Button>
  </div>

  <div
    v-if="collectionLoading"
    role="status"
    class="flex items-center gap-3 rounded-lg border p-6 text-sm text-muted-foreground"
  >
    <PeridotSpinner :label="t('common.loading')" />
    {{ t("common.loading") }}…
  </div>
  <div
    v-else-if="collectionError"
    role="alert"
    class="space-y-3 rounded-lg border p-6 text-sm"
  >
    <p>{{ collectionError }}</p>
    <Button variant="outline" @click="loadCollection(true)">
      {{ t("common.tryAgain") }}
    </Button>
  </div>
  <template v-else-if="collection">
    <p
      v-if="offlinePlaybackError"
      role="alert"
      class="mb-4 text-sm text-destructive"
    >
      {{ offlinePlaybackError }}
    </p>
    <section
      aria-labelledby="collection-heading"
      class="relative flex flex-col gap-6 rounded-lg border bg-card p-6 text-card-foreground sm:flex-row sm:items-end"
    >
      <MediaCollectionOfflineButton
        :collection="{ ...collection, trackCount: itemCount }"
        :media-type="mediaType"
        class="absolute right-4 top-4"
      />
      <div
        aria-hidden="true"
        class="relative flex size-40 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-muted text-muted-foreground"
      >
        <Icon :icon="icon" class="size-16" />
        <FadeInImage
          v-if="coverImageUrl && !coverFailed"
          :src="coverImageUrl"
          loading="eager"
          class="absolute inset-0"
          @error="coverFailed = true"
        />
      </div>
      <div class="min-w-0 flex-1 space-y-3 pr-12">
        <p
          class="text-xs font-medium uppercase tracking-wide text-muted-foreground"
        >
          {{ t(kindLabelKey) }}
        </p>
        <h1
          id="collection-heading"
          class="text-3xl font-semibold tracking-tight"
        >
          <ScrollingText class="w-full">{{ collection.title }}</ScrollingText>
        </h1>
        <ScrollingText class="w-full text-sm text-muted-foreground">
          {{ creatorLabel }}
        </ScrollingText>
        <div class="flex flex-wrap items-center gap-3">
          <Button
            size="icon-lg"
            class="rounded-full"
            :disabled="!collectionPlayable"
            :aria-label="
              collectionActive && playing
                ? t('card.pauseCollection', {
                    collection: collection.title,
                  })
                : t('card.playCollection', {
                    collection: collection.title,
                    creator: creatorLabel,
                  })
            "
            @click="toggleCollectionPlayback"
          >
            <Icon
              :icon="collectionActive && playing ? icons.pause : icons.play"
              aria-hidden="true"
              class="size-5"
            />
          </Button>
          <LikeButton
            v-if="likeTarget"
            :liked="liked"
            :label="collection.title"
            :pending="isLikePending(likeTarget)"
            :disabled="!likesLoaded"
            @toggle="toggleLike(likeTarget)"
          />
          <Badge variant="secondary">
            {{ t(countKey, { count: itemCount }, itemCount) }}
          </Badge>
          <Badge v-if="!collection.available" variant="secondary">
            {{ t("trackTable.unavailable") }}
          </Badge>
          <span class="text-sm text-muted-foreground">
            <template
              v-if="
                collection.mediaType === 'audiobook' && collection.releaseYear
              "
            >
              {{ collection.releaseYear }}
              <span aria-hidden="true">·</span>
            </template>
            {{ formatTrackDuration(collection.durationMs) }}
          </span>
        </div>
      </div>
    </section>

    <section aria-labelledby="collection-tracks-heading" class="space-y-4">
      <h2 id="collection-tracks-heading" class="text-lg font-semibold">
        {{
          t(
            mediaType === "audiobook"
              ? "page.audiobook.chapters"
              : "page.podcast.episodes",
          )
        }}
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
        :variant="mediaType"
        :scroll-to-track-id="scrollToTrackId"
        :sort="trackSort"
        :has-more="hasMore"
        :loading-more="tracksLoadingMore"
        :show-artists="false"
        :allow-track-like="false"
        @sort-change="setTrackSort"
        @load-more="loadMoreTracks"
      />
      <p
        v-else-if="tracksLoaded"
        role="status"
        class="rounded-lg border p-6 text-sm text-muted-foreground"
      >
        {{ t(emptyKey) }}
      </p>
    </section>
  </template>
  <section
    v-else
    role="status"
    class="space-y-4 rounded-lg border p-6 text-sm text-muted-foreground"
  >
    <p>{{ t(unavailableKey) }}</p>
    <Button as-child variant="outline">
      <NuxtLink :to="backRoute">{{ t(backLabelKey) }}</NuxtLink>
    </Button>
  </section>
</template>
