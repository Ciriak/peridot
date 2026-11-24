<script setup lang="ts">
import { useI18n } from "#imports";
import type { MediaResponse } from "@peridot/contracts";
import { Icon } from "@iconify/vue/offline";
import { ScrollingText } from "@peridot/ui/components/ui/scrolling-text";
import { computed, watch } from "vue";
import FadeInImage from "./FadeInImage.vue";
import LikeButton from "./LikeButton.vue";
import TrackArtistLinks from "./TrackArtistLinks.vue";
import TrackContextMenu from "./TrackContextMenu.vue";
import { useCachedArtwork } from "../composables/use-cached-artwork";
import { icons } from "../lib/icons";
import {
  trackAlbumTitleRoute,
  trackArtistNames,
  trackCoverUrl,
} from "../lib/library";

const props = withDefaults(
  defineProps<{
    track: MediaResponse | null;
    serverAddress: string;
    interactive?: boolean;
    liked?: boolean;
    likePending?: boolean;
    likeDisabled?: boolean;
  }>(),
  {
    interactive: false,
    liked: false,
    likePending: false,
    likeDisabled: true,
  },
);
const emit = defineEmits<{
  like: [];
  play: [];
}>();
const { t } = useI18n();
const currentCoverUrl = computed(() =>
  trackCoverUrl(props.serverAddress, props.track?.coverUrl ?? null),
);
const {
  artworkUrl: currentCoverImageUrl,
  failed: coverFailed,
  fromCache: coverFromCache,
} = useCachedArtwork(currentCoverUrl);
const currentTrackTitleRoute = computed(() =>
  props.track ? trackAlbumTitleRoute(props.track) : null,
);
const previewArtistNames = computed(() =>
  props.track ? trackArtistNames(props.track).join(", ") : "",
);
const placeholderIcon = computed(() =>
  props.track?.mediaType === "audiobook"
    ? icons.book
    : props.track?.mediaType === "podcast"
      ? icons.podcast
      : props.track?.albumId
        ? icons.album
        : icons.music,
);

watch(
  () => props.track?.id,
  () => {
    coverFailed.value = false;
  },
);
</script>

<template>
  <div
    data-mobile-player-track-panel
    class="min-w-0 overflow-hidden text-center"
  >
    <component
      :is="interactive && track ? TrackContextMenu : 'div'"
      v-bind="interactive && track ? { track } : {}"
      @play="emit('play')"
    >
      <div class="flex min-w-0 flex-col items-center">
        <div
          aria-hidden="true"
          class="relative mx-auto flex aspect-square w-full max-w-sm shrink-0 items-center justify-center overflow-hidden rounded-xl bg-muted text-muted-foreground shadow-lg"
          :class="track?.available === false && 'opacity-60'"
        >
          <Icon :icon="placeholderIcon" aria-hidden="true" class="size-16" />
          <FadeInImage
            v-if="currentCoverImageUrl && !coverFailed"
            :key="currentCoverImageUrl"
            :src="currentCoverImageUrl"
            :fade-in="!coverFromCache"
            loading="eager"
            class="absolute inset-0"
            @error="coverFailed = true"
          />
        </div>

        <div class="mt-4 min-w-0 text-center">
          <template v-if="track">
            <ScrollingText
              :key="`${track.id}:${track.title}`"
              mode="always"
              class="w-full text-lg font-semibold"
              :title="
                track.available ? undefined : t('trackTable.unavailableTitle')
              "
            >
              <NuxtLink
                v-if="interactive && currentTrackTitleRoute"
                :to="currentTrackTitleRoute"
                class="inline-block rounded-sm hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                :class="!track.available && 'opacity-60'"
              >
                {{ track.title }}
              </NuxtLink>
              <span v-else>{{ track.title }}</span>
            </ScrollingText>
            <ScrollingText
              mode="always"
              class="w-full text-sm text-muted-foreground"
            >
              <TrackArtistLinks
                v-if="interactive && track.mediaType === 'music'"
                :artists="trackArtistNames(track)"
              />
              <template v-else>{{ previewArtistNames }}</template>
            </ScrollingText>
          </template>
          <template v-else>
            <p class="text-lg font-semibold">{{ t("player.noTrack") }}</p>
            <p class="text-sm text-muted-foreground">
              {{ t("player.scanLibrary") }}
            </p>
          </template>
        </div>
      </div>
    </component>

    <div v-if="interactive && track" class="mt-3 flex w-full justify-end">
      <LikeButton
        large
        :liked="liked"
        :label="track.title"
        :pending="likePending"
        :disabled="likeDisabled"
        @toggle="emit('like')"
      />
    </div>
  </div>
</template>
