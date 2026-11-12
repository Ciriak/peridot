<script setup lang="ts">
import { Icon } from "@iconify/vue/offline";
import { Button } from "@peridot/ui/components/ui/button";
import { computed, ref, watch } from "vue";
import {
  quickPickArtistNames,
  type ResolvedQuickPickItem,
} from "../lib/quick-picks";
import { albumRoute, artistRoute, trackAlbumTitleRoute } from "../lib/library";
import { icons } from "../lib/icons";
import TrackArtistLinks from "./TrackArtistLinks.vue";

const props = defineProps<{
  item: ResolvedQuickPickItem;
  coverUrl: string | null;
  activeItem: boolean;
  playing: boolean;
  playLabel: string;
  busy: boolean;
}>();
const emit = defineEmits<{ play: [] }>();

const coverFailed = ref(false);
const title = computed(() =>
  props.item.kind === "track" ? props.item.track.title : props.item.album.title,
);
const artistNames = computed(() => quickPickArtistNames(props.item));
const typeIcon = computed(() =>
  props.item.kind === "track" ? icons.music : icons.library,
);
const titleRoute = computed(() =>
  props.item.kind === "track"
    ? (trackAlbumTitleRoute(props.item.track) ??
      artistRoute({ name: props.item.track.artist }))
    : albumRoute(props.item.album),
);

watch(
  () => props.coverUrl,
  () => {
    coverFailed.value = false;
  },
);
</script>

<template>
  <div
    class="group/quick-pick flex min-w-0 items-center gap-2 rounded-md p-1 transition-colors hover:bg-accent"
  >
    <Button
      variant="ghost"
      size="icon-sm"
      class="relative size-10 shrink-0 cursor-pointer overflow-hidden rounded-md p-0"
      :aria-label="playLabel"
      :aria-busy="busy"
      @click="emit('play')"
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
        aria-hidden="true"
        class="size-5 text-muted-foreground"
      />
      <span
        aria-hidden="true"
        class="absolute inset-0 flex items-center justify-center bg-background/70 opacity-0 transition-opacity group-hover/quick-pick:opacity-100 group-focus-within/quick-pick:opacity-100"
      >
        <Icon
          :icon="activeItem && playing ? icons.pause : icons.play"
          class="size-4 text-foreground"
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
        <span class="truncate text-xs font-medium">
          {{ title }}
        </span>
      </NuxtLink>
      <p
        class="truncate text-xs text-muted-foreground"
        :title="artistNames.join(', ')"
      >
        <TrackArtistLinks :artists="artistNames" />
      </p>
    </div>
  </div>
</template>
