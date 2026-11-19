<script setup lang="ts">
import { useI18n } from "#imports";
import type {
  AudiobookSummaryResponse,
  LikeTarget,
  PodcastSummaryResponse,
} from "@peridot/contracts";
import { Icon } from "@iconify/vue/offline";
import { Badge } from "@peridot/ui/components/ui/badge";
import { Button } from "@peridot/ui/components/ui/button";
import { ScrollingText } from "@peridot/ui/components/ui/scrolling-text";
import { computed } from "vue";
import { useCachedArtwork } from "../composables/use-cached-artwork";
import { useLikes } from "../composables/use-likes";
import { useLibraryPlayer } from "../composables/use-library-player";
import { useOfflineTracks } from "../composables/use-offline-tracks";
import { useServerConnection } from "../composables/use-server-connection";
import { useServer } from "../composables/use-server";
import { useSession } from "../composables/use-session";
import { loadCollectionTracks } from "../lib/catalog-collections";
import { icons } from "../lib/icons";
import { trackCoverUrl } from "../lib/library";
import { isPeridotNetworkError } from "../lib/peridot-client";
import FadeInImage from "./FadeInImage.vue";
import LikeButton from "./LikeButton.vue";
import MediaCollectionOfflineButton from "./MediaCollectionOfflineButton.vue";

const props = defineProps<{
  collection: AudiobookSummaryResponse | PodcastSummaryResponse;
}>();

const { t } = useI18n();
const { address } = useServer();
const { token } = useSession();
const { active, playing, playCollection, togglePlayback } = useLibraryPlayer();
const { savedTracks, tracksMatching } = useOfflineTracks();
const { status: serverStatus } = useServerConnection();
const {
  likedAudiobookIds,
  likedPodcastIds,
  loaded: likesLoaded,
  toggle: toggleLike,
  isPending: isLikePending,
} = useLikes();
const audiobook = computed(() =>
  props.collection.mediaType === "audiobook" ? props.collection : null,
);
const creator = computed(() =>
  props.collection.mediaType === "audiobook"
    ? props.collection.author
    : props.collection.publisher,
);
const itemCount = computed(() =>
  props.collection.mediaType === "audiobook"
    ? props.collection.chapterCount
    : props.collection.episodeCount,
);
const route = computed(() =>
  props.collection.mediaType === "audiobook"
    ? {
        name: "audiobook-detail",
        params: { book: props.collection.title },
        query: { author: creator.value, id: props.collection.id },
      }
    : {
        name: "podcast-detail",
        params: { show: props.collection.title },
        query: { publisher: creator.value, id: props.collection.id },
      },
);
const likeTarget = computed<LikeTarget>(() =>
  props.collection.mediaType === "audiobook"
    ? {
        kind: "audiobook",
        audiobookId: props.collection.id,
        title: props.collection.title,
        author: props.collection.author,
      }
    : {
        kind: "podcast",
        podcastId: props.collection.id,
        title: props.collection.title,
        publisher: props.collection.publisher,
      },
);
const liked = computed(() =>
  props.collection.mediaType === "audiobook"
    ? likesLoaded.value
      ? likedAudiobookIds.value.includes(props.collection.id)
      : props.collection.liked
    : likesLoaded.value
      ? likedPodcastIds.value.includes(props.collection.id)
      : props.collection.liked,
);
const coverUrl = computed(() =>
  trackCoverUrl(address.value ?? "", props.collection.coverUrl),
);
const { artworkUrl: coverImageUrl, failed: coverFailed } =
  useCachedArtwork(coverUrl);
const collectionActive = computed(
  () => active.value?.albumId === props.collection.id,
);
const playable = computed(
  () =>
    itemCount.value > 0 &&
    (props.collection.available ||
      savedTracks.value.some(
        (saved) => saved.track.albumId === props.collection.id,
      )),
);
const icon = computed(() => (audiobook.value ? icons.book : icons.podcast));
const label = computed(() =>
  audiobook.value ? t("page.audiobook.label") : t("page.podcast.label"),
);
const countKey = computed(() =>
  audiobook.value ? "count.chapter" : "count.episode",
);

async function toggleCollectionPlayback() {
  if (collectionActive.value && playing.value) {
    togglePlayback();
    return;
  }
  if (!address.value || !token.value || !playable.value) return;
  const playSaved = async () => {
    const saved = await tracksMatching(
      (track) => track.albumId === props.collection.id,
    );
    if (saved.length) playCollection(saved);
  };
  if (serverStatus.value === "lost" || !props.collection.available) {
    await playSaved();
    return;
  }
  try {
    playCollection(
      await loadCollectionTracks(address.value, token.value, {
        collectionId: props.collection.id,
        mediaType: props.collection.mediaType,
      }),
    );
  } catch (reason) {
    if (isPeridotNetworkError(reason)) await playSaved();
  }
}
</script>

<template>
  <article
    class="group relative min-w-0 rounded-lg border bg-card p-3 text-card-foreground"
  >
    <div class="space-y-3">
      <div class="relative">
        <NuxtLink
          :to="route"
          class="block rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          :aria-label="
            t('card.openCollection', {
              collection: collection.title,
              creator,
            })
          "
        >
          <div
            aria-hidden="true"
            class="relative flex aspect-square items-center justify-center overflow-hidden rounded-md bg-muted text-muted-foreground group-hover:text-foreground"
          >
            <Icon :icon="icon" class="size-10" />
            <FadeInImage
              v-if="coverImageUrl && !coverFailed"
              :src="coverImageUrl"
              class="absolute inset-0"
              @error="coverFailed = true"
            />
          </div>
        </NuxtLink>
        <Button
          variant="default"
          size="icon"
          class="pointer-events-none absolute bottom-2 right-2 z-10 cursor-pointer rounded-full opacity-0 shadow-md transition-opacity group-hover:pointer-events-auto group-hover:opacity-100 focus-visible:pointer-events-auto focus-visible:opacity-100"
          :disabled="!playable"
          :aria-label="
            collectionActive && playing
              ? t('card.pauseCollection', {
                  collection: collection.title,
                })
              : t('card.playCollection', {
                  collection: collection.title,
                  creator,
                })
          "
          @click.prevent.stop="toggleCollectionPlayback"
        >
          <Icon
            :icon="collectionActive && playing ? icons.pause : icons.play"
            aria-hidden="true"
            class="size-5"
          />
        </Button>
        <MediaCollectionOfflineButton
          :collection="{ ...collection, trackCount: itemCount }"
          :media-type="collection.mediaType"
          compact
          overlay
          class="absolute right-2 top-2 opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
        />
      </div>
      <div class="min-w-0 pr-12">
        <NuxtLink
          :to="route"
          class="block rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          :aria-label="
            t('card.openCollection', {
              collection: collection.title,
              creator,
            })
          "
        >
          <h3 class="text-sm font-medium">
            <ScrollingText class="w-full">{{ collection.title }}</ScrollingText>
          </h3>
        </NuxtLink>
        <Badge v-if="!collection.available" variant="secondary" class="mt-1">
          {{ t("trackTable.unavailable") }}
        </Badge>
        <ScrollingText class="w-full text-xs text-muted-foreground">
          {{ creator }} · {{ t(countKey, { count: itemCount }, itemCount) }}
        </ScrollingText>
        <span class="sr-only">{{ label }}</span>
      </div>
    </div>
    <LikeButton
      class="absolute bottom-1 right-1"
      :liked="liked"
      :label="collection.title"
      :pending="isLikePending(likeTarget)"
      :disabled="!likesLoaded"
      @toggle="toggleLike(likeTarget)"
    />
  </article>
</template>
