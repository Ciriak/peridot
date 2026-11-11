<script setup lang="ts">
import { Icon } from "@iconify/vue/offline";
import { Button } from "@peridot/ui/components/ui/button";
import { Spinner } from "@peridot/ui/components/ui/spinner";
import type { AlbumGroup } from "../lib/library";
import { albumRoute, trackCoverUrl } from "../lib/library";
import { icons } from "../lib/icons";
import { computed, ref, watch } from "vue";
import { useLikes } from "../composables/use-likes";
import { useLibraryPlayer } from "../composables/use-library-player";
import { useServer } from "../composables/use-server";
import AlbumContextMenu from "./AlbumContextMenu.vue";
import LikeButton from "./LikeButton.vue";

const props = withDefaults(
  defineProps<{ album: AlbumGroup; compact?: boolean }>(),
  { compact: false },
);
const emit = defineEmits<{ open: [] }>();
const { address } = useServer();
const { active, playing, loading, playCollection, togglePlayback } =
  useLibraryPlayer();
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
  return activeTrackId ? props.album.trackIds.includes(activeTrackId) : false;
});
const albumLoading = computed(() => albumActive.value && loading.value);

function toggleAlbumPlayback() {
  if (albumActive.value) {
    togglePlayback();
    return;
  }
  if (props.album.trackIds.length) playCollection(props.album.trackIds);
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
            :aria-label="`Open ${album.title} by ${album.artist}`"
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
            :disabled="!album.trackIds.length"
            :aria-label="
              albumLoading
                ? `Cancel loading ${album.title}`
                : albumActive && playing
                  ? `Pause ${album.title} by ${album.artist}`
                  : albumActive
                    ? `Resume ${album.title} by ${album.artist}`
                    : `Play ${album.title} by ${album.artist}`
            "
            :aria-busy="albumLoading"
            @click.prevent.stop="toggleAlbumPlayback"
          >
            <Spinner
              v-if="albumLoading"
              :label="`Loading ${album.title}`"
              :class="compact ? 'size-3' : 'size-4'"
            />
            <Icon
              v-else
              :icon="albumActive && playing ? icons.pause : icons.play"
              aria-hidden="true"
              :class="compact ? 'size-4' : 'size-5'"
            />
          </Button>
        </div>
        <NuxtLink
          :to="albumRoute(album)"
          class="block rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          :aria-label="`Open ${album.title} by ${album.artist}`"
          @click="emit('open')"
        >
          <div class="min-w-0" :class="compact ? 'pr-6' : 'pr-12'">
            <h3
              class="truncate font-medium"
              :class="compact ? 'text-xs' : 'text-sm'"
            >
              {{ album.title }}
            </h3>
            <p class="truncate text-xs text-muted-foreground">
              {{ album.artist }} ·
              {{ album.tracks.length }}
              {{ album.tracks.length === 1 ? "track" : "tracks" }}
            </p>
          </div>
        </NuxtLink>
      </div>
      <LikeButton
        class="absolute"
        :class="compact ? 'bottom-0 right-0' : 'bottom-1 right-1'"
        :compact="compact"
        :liked="likedAlbumKeys.includes(album.key)"
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
