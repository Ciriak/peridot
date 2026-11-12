<script setup lang="ts">
import { useI18n } from "#imports";
import { Icon } from "@iconify/vue/offline";
import type { ArtistSummaryResponse } from "@peridot/contracts";
import { artistLikeKey, artistRoute } from "../lib/library";
import { icons } from "../lib/icons";
import { useLikes } from "../composables/use-likes";
import ArtistContextMenu from "./ArtistContextMenu.vue";
import LikeButton from "./LikeButton.vue";

const props = defineProps<{ artist: ArtistSummaryResponse }>();
const { t } = useI18n();
const {
  likedArtistKeys,
  loaded: likesLoaded,
  toggle: toggleLike,
  isPending: isLikePending,
} = useLikes();
</script>

<template>
  <ArtistContextMenu :artist="artist">
    <article
      class="group flex min-w-0 items-center gap-2 rounded-lg border bg-card p-3 text-card-foreground"
    >
      <NuxtLink
        :to="artistRoute(artist)"
        class="flex min-w-0 flex-1 items-center gap-3 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        :aria-label="t('card.openArtist', { artist: artist.name })"
      >
        <div
          aria-hidden="true"
          class="flex size-16 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground group-hover:text-foreground"
        >
          <Icon :icon="icons.user" class="size-8" />
        </div>
        <div class="min-w-0">
          <h3 class="truncate text-sm font-medium">{{ artist.name }}</h3>
          <p class="text-xs text-muted-foreground">
            {{
              t("count.album", { count: artist.albumCount }, artist.albumCount)
            }}
            ·
            {{
              t("count.track", { count: artist.trackCount }, artist.trackCount)
            }}
          </p>
        </div>
      </NuxtLink>
      <LikeButton
        :liked="
          likedArtistKeys.includes(artistLikeKey(artist.name)) || artist.liked
        "
        :label="artist.name"
        :pending="isLikePending({ kind: 'artist', name: props.artist.name })"
        :disabled="!likesLoaded"
        @toggle="toggleLike({ kind: 'artist', name: artist.name })"
      />
    </article>
  </ArtistContextMenu>
</template>
