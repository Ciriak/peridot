<script setup lang="ts">
import { useI18n } from "#imports";
import { Icon } from "@iconify/vue/offline";
import { Button } from "@peridot/ui/components/ui/button";
import type { AlbumSummaryResponse } from "@peridot/contracts";
import { albumLikeKey, albumRoute, trackCoverUrl } from "../lib/library";
import { icons } from "../lib/icons";
import { computed, ref, watch } from "vue";
import { useLikes } from "../composables/use-likes";
import { useLibraryPlayer } from "../composables/use-library-player";
import { useServer } from "../composables/use-server";
import { useSession } from "../composables/use-session";
import { loadCollectionTrackIds } from "../lib/catalog-collections";
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
const coverFailed = ref(false);
const coverUrl = computed(() =>
  trackCoverUrl(address.value ?? "", props.album.coverUrl),
);
watch(coverUrl, () => {
  coverFailed.value = false;
});
const {
  likedAlbumKeys,
  loaded: likesLoaded,
  toggle: toggleLike,
  isPending: isLikePending,
} = useLikes();
const albumActive = computed(() => {
  const activeTrackId = active.value?.id;
  return activeTrackId
    ? active.value?.album === props.album.title &&
        active.value.artist === props.album.artist
    : false;
});
async function toggleAlbumPlayback() {
  if (albumActive.value && playing.value) {
    togglePlayback();
    return;
  }
  if (!address.value || !token.value || !props.album.trackCount) return;
  playCollection(
    await loadCollectionTrackIds(address.value, token.value, {
      albumId: props.album.id,
    }),
  );
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
                v-if="coverUrl && !coverFailed"
                :src="coverUrl"
                alt=""
                loading="lazy"
                decoding="async"
                class="size-full object-cover"
                @error="coverFailed = true"
              />
              <Icon
                v-else
                :icon="icons.music"
                :class="compact ? 'size-4' : 'size-10'"
              />
            </div>
          </NuxtLink>
          <Button
            variant="default"
            :size="compact ? 'icon-sm' : 'icon'"
            class="pointer-events-none absolute z-10 cursor-pointer rounded-full opacity-0 shadow-md transition-opacity group-hover:pointer-events-auto group-hover:opacity-100 focus-visible:pointer-events-auto focus-visible:opacity-100"
            :class="compact ? 'bottom-1 right-1' : 'bottom-2 right-2'"
            :disabled="!album.trackCount"
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
        <div class="min-w-0" :class="compact ? 'pr-6' : 'pr-12'">
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
            <h3
              class="truncate font-medium"
              :class="compact ? 'text-xs' : 'text-sm'"
            >
              {{ album.title }}
            </h3>
          </NuxtLink>
          <p class="truncate text-xs text-muted-foreground">
            <TrackArtistLinks :artists="album.artists" /> ·
            {{
              t("count.track", { count: album.trackCount }, album.trackCount)
            }}
          </p>
        </div>
      </div>
      <LikeButton
        class="absolute"
        :class="compact ? 'bottom-0 right-0' : 'bottom-1 right-1'"
        :compact="compact"
        :liked="likedAlbumKeys.includes(albumLikeKey(album)) || album.liked"
        :label="album.title"
        :pending="
          isLikePending({
            kind: 'album',
            title: props.album.title,
            artist: props.album.artist,
          })
        "
        :disabled="!likesLoaded"
        @toggle="
          toggleLike({
            kind: 'album',
            title: album.title,
            artist: album.artist,
          })
        "
      />
    </article>
  </AlbumContextMenu>
</template>
