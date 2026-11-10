<script setup lang="ts">
import { Icon } from "@iconify/vue/offline";
import type { AlbumGroup } from "../lib/library";
import { albumRoute, trackCoverUrl } from "../lib/library";
import { icons } from "../lib/icons";
import { computed, ref, watch } from "vue";
import { useLikes } from "../composables/use-likes";
import { useServer } from "../composables/use-server";
import AlbumContextMenu from "./AlbumContextMenu.vue";
import LikeButton from "./LikeButton.vue";

const props = defineProps<{ album: AlbumGroup }>();
const { address } = useServer();
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
</script>

<template>
  <AlbumContextMenu :album="album">
    <article
      class="group relative min-w-0 rounded-lg border bg-card p-3 text-card-foreground"
    >
      <NuxtLink
        :to="albumRoute(album)"
        class="block space-y-3 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        :aria-label="`Open ${album.title} by ${album.artist}`"
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
          <Icon v-else :icon="icons.music" class="size-10" />
        </div>
        <div class="min-w-0 pr-12">
          <h3 class="truncate text-sm font-medium">{{ album.title }}</h3>
          <p class="truncate text-xs text-muted-foreground">
            {{ album.artist }} ·
            {{ album.tracks.length }}
            {{ album.tracks.length === 1 ? "track" : "tracks" }}
          </p>
        </div>
      </NuxtLink>
      <LikeButton
        class="absolute bottom-1 right-1"
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
