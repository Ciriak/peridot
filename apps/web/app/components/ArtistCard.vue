<script setup lang="ts">
import { useI18n } from "#imports";
import type { ArtistSummaryResponse } from "@peridot/contracts";
import { Badge } from "@peridot/ui/components/ui/badge";
import { ScrollingText } from "@peridot/ui/components/ui/scrolling-text";
import { artistLikeKey, artistRoute } from "../lib/library";
import { useLikes } from "../composables/use-likes";
import ArtistArtwork from "./ArtistArtwork.vue";
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
        <ArtistArtwork :image-url="artist.imageUrl" />
        <div class="min-w-0 flex-1">
          <h3 class="text-sm font-medium">
            <ScrollingText class="w-full">{{ artist.name }}</ScrollingText>
          </h3>
          <Badge v-if="!artist.available" variant="secondary" class="mt-1">
            {{ t("trackTable.unavailable") }}
          </Badge>
          <p
            v-if="artist.name !== artist.localName"
            class="text-xs text-muted-foreground"
          >
            <ScrollingText class="w-full">
              {{ t("card.localArtistName", { artist: artist.localName }) }}
            </ScrollingText>
          </p>
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
          likedArtistKeys.includes(artistLikeKey(artist.localName)) ||
          artist.liked
        "
        :label="artist.name"
        :pending="
          isLikePending({ kind: 'artist', name: props.artist.localName })
        "
        :disabled="!likesLoaded"
        @toggle="toggleLike({ kind: 'artist', name: artist.localName })"
      />
    </article>
  </ArtistContextMenu>
</template>
