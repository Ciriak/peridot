<script setup lang="ts">
import { useI18n } from "#imports";
import { Icon } from "@iconify/vue/offline";
import { Button } from "@peridot/ui/components/ui/button";
import { ScrollingText } from "@peridot/ui/components/ui/scrolling-text";
import type { AlbumSummaryResponse } from "@peridot/contracts";
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
const { active, playing, playCollection, togglePlayback } = useLibraryPlayer();
const { savedTracks, tracksMatching } = useOfflineTracks();
const { status: serverStatus } = useServerConnection();
const coverUrl = computed(() =>
  trackCoverUrl(address.value ?? "", props.album.coverUrl),
);
const { artworkUrl: coverImageUrl, failed: coverFailed } =
  useCachedArtwork(coverUrl);
const {
  likedAlbumIds,
  loaded: likesLoaded,
  toggle: toggleLike,
  isPending: isLikePending,
} = useLikes();
const albumActive = computed(() => {
  return active.value?.albumId === props.album.id;
});
const albumPlayable = computed(
  () =>
    Boolean(props.album.trackCount) &&
    (serverStatus.value !== "lost" ||
      savedTracks.value.some(
        (saved) => saved.track.albumId === props.album.id,
      )),
);
async function toggleAlbumPlayback() {
  if (albumActive.value && playing.value) {
    togglePlayback();
    return;
  }
  if (!address.value || !token.value || !albumPlayable.value) return;
  const playSaved = async () => {
    const saved = await tracksMatching(
      (track) => track.albumId === props.album.id,
    );
    if (saved.length) playCollection(saved);
  };
  if (serverStatus.value === "lost") {
    await playSaved();
    return;
  }
  try {
    playCollection(
      await loadCollectionTracks(address.value, token.value, {
        albumId: props.album.id,
      }),
    );
  } catch (reason) {
    if (isPeridotNetworkError(reason)) await playSaved();
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
              class="flex aspect-square items-center justify-center overflow-hidden rounded-md bg-muted text-muted-foreground group-hover:text-foreground"
            >
              <img
                v-if="coverImageUrl && !coverFailed"
                :src="coverImageUrl"
                alt=""
                loading="lazy"
                decoding="async"
                class="size-full object-cover"
                @error="coverFailed = true"
              />
              <Icon
                v-else
                :icon="icons.album"
                :class="compact ? 'size-4' : 'size-10'"
              />
            </div>
          </NuxtLink>
          <Button
            variant="default"
            :size="compact ? 'icon-sm' : 'icon'"
            class="pointer-events-none absolute z-10 cursor-pointer rounded-full opacity-0 shadow-md transition-opacity group-hover:pointer-events-auto group-hover:opacity-100 focus-visible:pointer-events-auto focus-visible:opacity-100"
            :class="compact ? 'bottom-1 right-1' : 'bottom-2 right-2'"
            :disabled="!albumPlayable"
            :aria-label="
              albumActive && playing
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
              :icon="albumActive && playing ? icons.pause : icons.play"
              aria-hidden="true"
              :class="compact ? 'size-4' : 'size-5'"
            />
          </Button>
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
