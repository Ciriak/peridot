<script setup lang="ts">
import { Icon } from "@iconify/vue/offline";
import { Button } from "@peridot/ui/components/ui/button";
import { ScrollingText } from "@peridot/ui/components/ui/scrolling-text";
import { computed } from "vue";
import { useCachedArtwork } from "../composables/use-cached-artwork";
import {
  quickPickArtistNames,
  type ResolvedQuickPickItem,
} from "../lib/quick-picks";
import { albumRoute, artistRoute, trackAlbumTitleRoute } from "../lib/library";
import { icons } from "../lib/icons";
import FadeInImage from "./FadeInImage.vue";
import TrackArtistLinks from "./TrackArtistLinks.vue";

const props = withDefaults(
  defineProps<{
    item: ResolvedQuickPickItem;
    coverUrl: string | null;
    activeItem: boolean;
    playing: boolean;
    playLabel: string;
    busy: boolean;
    playable: boolean;
    layout?: "tile" | "card";
  }>(),
  { layout: "tile" },
);
const emit = defineEmits<{ play: [] }>();
const card = computed(() => props.layout === "card");

const {
  artworkUrl: cachedCoverUrl,
  failed: coverFailed,
  fromCache: coverFromCache,
} = useCachedArtwork(() => props.coverUrl);
const title = computed(() =>
  props.item.kind === "track" ? props.item.track.title : props.item.album.title,
);
const artistNames = computed(() => quickPickArtistNames(props.item));
const typeIcon = computed(() =>
  props.item.kind === "track" ? icons.music : icons.album,
);
const titleRoute = computed(() =>
  props.item.kind === "track"
    ? (trackAlbumTitleRoute(props.item.track) ??
      artistRoute({ name: props.item.track.artist }))
    : albumRoute(props.item.album),
);
</script>

<template>
  <article
    class="group/quick-pick flex min-w-0"
    :class="
      card
        ? 'flex-col gap-3 rounded-lg border bg-card p-3 text-card-foreground'
        : 'items-center gap-2 rounded-md p-1 transition-colors hover:bg-accent'
    "
  >
    <Button
      variant="ghost"
      size="icon-sm"
      :class="
        card
          ? 'relative aspect-square h-auto w-full shrink-0 cursor-pointer overflow-hidden rounded-md p-0'
          : 'relative size-10 shrink-0 cursor-pointer overflow-hidden rounded-md p-0'
      "
      :aria-label="playLabel"
      :aria-busy="busy"
      :disabled="!playable"
      @click="emit('play')"
    >
      <Icon
        :icon="props.item.kind === 'album' ? icons.album : icons.music"
        aria-hidden="true"
        :class="
          card
            ? 'size-10 text-muted-foreground'
            : 'size-5 text-muted-foreground'
        "
      />
      <FadeInImage
        v-if="cachedCoverUrl && !coverFailed"
        :src="cachedCoverUrl"
        :fade-in="!coverFromCache"
        class="absolute inset-0"
        @error="coverFailed = true"
      />
      <span
        aria-hidden="true"
        class="absolute inset-0 flex items-center justify-center bg-background/70 opacity-0 transition-opacity group-hover/quick-pick:opacity-100 group-focus-within/quick-pick:opacity-100 max-sm:opacity-100"
      >
        <Icon
          :icon="activeItem && playing ? icons.pause : icons.play"
          :class="card ? 'size-6 text-foreground' : 'size-4 text-foreground'"
        />
      </span>
    </Button>
    <div class="min-w-0 flex-1">
      <NuxtLink
        :to="titleRoute"
        class="flex min-w-0 items-center gap-1 rounded-sm hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        :title="title"
      >
        <Icon
          :icon="typeIcon"
          aria-hidden="true"
          class="size-3 shrink-0 text-muted-foreground"
        />
        <ScrollingText
          class="min-w-0 flex-1 font-medium"
          :class="[card ? 'text-sm' : 'text-xs', !playable && 'opacity-60']"
        >
          {{ title }}
        </ScrollingText>
      </NuxtLink>
      <ScrollingText
        class="w-full text-xs text-muted-foreground"
        :title="artistNames.join(', ')"
      >
        <TrackArtistLinks :artists="artistNames" />
      </ScrollingText>
    </div>
  </article>
</template>
