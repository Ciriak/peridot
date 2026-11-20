<script setup lang="ts">
import { useI18n } from "#imports";
import { Icon } from "@iconify/vue/offline";
import { Badge } from "@peridot/ui/components/ui/badge";
import { Button } from "@peridot/ui/components/ui/button";
import { ScrollingText } from "@peridot/ui/components/ui/scrolling-text";
import type { AlbumSummaryResponse } from "@peridot/contracts";
import {
  TooltipContent,
  TooltipPortal,
  TooltipProvider,
  TooltipRoot,
  TooltipTrigger,
} from "reka-ui";
import { albumRoute, trackCoverUrl } from "../lib/library";
import { icons } from "../lib/icons";
import { computed } from "vue";
import { useCachedArtwork } from "../composables/use-cached-artwork";
import { useLikes } from "../composables/use-likes";
import { useLibraryPlayer } from "../composables/use-library-player";
import { useOfflineTracks } from "../composables/use-offline-tracks";
import { useServer } from "../composables/use-server";
import { useServerConnection } from "../composables/use-server-connection";
import { useSession } from "../composables/use-session";
import { loadCollectionTracks } from "../lib/catalog-collections";
import { isPeridotNetworkError } from "../lib/peridot-client";
import AlbumContextMenu from "./AlbumContextMenu.vue";
import FadeInImage from "./FadeInImage.vue";
import LikeButton from "./LikeButton.vue";
import TrackArtistLinks from "./TrackArtistLinks.vue";

const props = withDefaults(
  defineProps<{ album: AlbumSummaryResponse; compact?: boolean }>(),
  { compact: false },
);
const emit = defineEmits<{ open: [] }>();
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
const { savedTracks, tracksMatching } = useOfflineTracks();
const { status: serverStatus } = useServerConnection();
const coverUrl = computed(() =>
  trackCoverUrl(address.value ?? "", props.album.coverUrl),
);
const {
  artworkUrl: coverImageUrl,
  failed: coverFailed,
  fromCache: coverFromCache,
} = useCachedArtwork(coverUrl);
const {
  likedAlbumIds,
  loaded: likesLoaded,
  toggle: toggleLike,
  isPending: isLikePending,
} = useLikes();
const albumActive = computed(() => {
  return active.value?.albumId === props.album.id;
});
const savedTrackCount = computed(
  () =>
    savedTracks.value.filter((saved) => saved.track.albumId === props.album.id)
      .length,
);
const albumFullySaved = computed(
  () =>
    Boolean(props.album.trackCount) &&
    savedTrackCount.value >= props.album.trackCount,
);
const albumPlayable = computed(
  () =>
    Boolean(props.album.trackCount) &&
    (albumFullySaved.value ||
      (serverStatus.value !== "lost" && props.album.available)),
);
const albumControlEnabled = computed(
  () => albumPlayable.value || (albumActive.value && playing.value),
);
const albumTarget = computed(() => ({
  kind: "album" as const,
  id: props.album.id,
}));
const albumPlaybackActive = computed(
  () =>
    isPlaybackTargetActive(albumTarget.value) ||
    (albumActive.value && playing.value),
);
async function toggleAlbumPlayback() {
  if (
    albumActive.value &&
    playing.value &&
    !isPlaybackTargetActive(albumTarget.value)
  ) {
    togglePlayback();
    return;
  }
  if (!albumPlayable.value) return;
  try {
    await toggleCollectionPlayback(albumTarget.value, async () => {
      const saved = await tracksMatching(
        (track) => track.albumId === props.album.id,
      );
      if (serverStatus.value === "lost" || !address.value || !token.value) {
        return saved;
      }
      try {
        return await loadCollectionTracks(address.value, token.value, {
          albumId: props.album.id,
        });
      } catch (reason) {
        if (isPeridotNetworkError(reason)) return saved;
        throw reason;
      }
    });
  } catch {
    // The shared player exposes playback failures.
  }
}
</script>

<template>
  <AlbumContextMenu :album="album">
    <article
      class="group relative min-w-0 border bg-card text-card-foreground"
      :class="compact ? 'rounded-sm p-1' : 'rounded-lg p-3'"
    >
      <div :class="compact ? 'space-y-1' : 'space-y-3'">
        <div class="relative">
          <NuxtLink
            :to="albumRoute(album)"
            class="block rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            :aria-label="
              t('card.openAlbum', {
                album: album.title,
                artist: album.artist,
              })
            "
            @click="emit('open')"
          >
            <div
              aria-hidden="true"
              class="relative flex aspect-square items-center justify-center overflow-hidden rounded-md bg-muted text-muted-foreground group-hover:text-foreground"
            >
              <Icon
                :icon="icons.album"
                :class="compact ? 'size-4' : 'size-10'"
              />
              <FadeInImage
                v-if="coverImageUrl && !coverFailed"
                :src="coverImageUrl"
                :fade-in="!coverFromCache"
                class="absolute inset-0"
                @error="coverFailed = true"
              />
            </div>
          </NuxtLink>
          <TooltipProvider :delay-duration="150">
            <TooltipRoot :disabled="albumControlEnabled">
              <TooltipTrigger as-child>
                <Button
                  variant="default"
                  :size="compact ? 'icon-sm' : 'icon'"
                  class="pointer-events-none absolute z-10 cursor-pointer rounded-full opacity-0 shadow-md transition-opacity group-hover:pointer-events-auto group-hover:opacity-100 focus-visible:pointer-events-auto focus-visible:opacity-100 aria-disabled:cursor-not-allowed aria-disabled:opacity-50 aria-disabled:hover:bg-primary max-sm:pointer-events-auto max-sm:size-11 max-sm:opacity-100"
                  :class="compact ? 'bottom-1 right-1' : 'bottom-2 right-2'"
                  :aria-disabled="!albumControlEnabled"
                  :aria-label="
                    albumPlaybackActive
                      ? t('card.pauseAlbum', {
                          album: album.title,
                          artist: album.artist,
                        })
                      : t('card.playAlbum', {
                          album: album.title,
                          artist: album.artist,
                        })
                  "
                  @click.prevent.stop="toggleAlbumPlayback"
                >
                  <Icon
                    :icon="albumPlaybackActive ? icons.pause : icons.play"
                    aria-hidden="true"
                    :class="
                      compact ? 'size-4 max-sm:size-5' : 'size-5 max-sm:size-6'
                    "
                  />
                </Button>
              </TooltipTrigger>
              <TooltipPortal>
                <TooltipContent
                  v-if="!albumControlEnabled"
                  :side-offset="6"
                  class="z-50 rounded-md border bg-popover px-3 py-2 text-sm text-popover-foreground shadow-md"
                >
                  {{ t("trackTable.unavailable") }}
                </TooltipContent>
              </TooltipPortal>
            </TooltipRoot>
          </TooltipProvider>
        </div>
        <div class="min-w-0 flex-1" :class="compact ? 'pr-6' : 'pr-12'">
          <NuxtLink
            :to="albumRoute(album)"
            class="block rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            :aria-label="
              t('card.openAlbum', {
                album: album.title,
                artist: album.artist,
              })
            "
            @click="emit('open')"
          >
            <h3 :class="compact ? 'text-xs' : 'text-sm'" class="font-medium">
              <ScrollingText class="w-full">
                {{ album.title }}
              </ScrollingText>
            </h3>
          </NuxtLink>
          <Badge v-if="!albumPlayable" variant="secondary" class="mt-1">
            {{ t("trackTable.unavailable") }}
          </Badge>
          <ScrollingText class="w-full text-xs text-muted-foreground">
            <TrackArtistLinks :artists="album.artists" /> ·
            {{
              t("count.track", { count: album.trackCount }, album.trackCount)
            }}
          </ScrollingText>
        </div>
      </div>
      <LikeButton
        class="absolute"
        :class="compact ? 'bottom-0 right-0' : 'bottom-1 right-1'"
        :compact="compact"
        :liked="likedAlbumIds.includes(album.id) || album.liked"
        :label="album.title"
        :pending="
          isLikePending({
            kind: 'album',
            albumId: props.album.id,
            title: props.album.title,
            artist: props.album.artist,
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
    </article>
  </AlbumContextMenu>
</template>
