<script setup lang="ts">
import {
  quickPickArtistNames,
  type ResolvedQuickPickItem,
} from "../lib/quick-picks";
import { Icon } from "@iconify/vue/offline";
import { Button } from "@peridot/ui/components/ui/button";
import { computed, ref, watch } from "vue";
import { useLibraryPlayer } from "../composables/use-library-player";
import { useServer } from "../composables/use-server";
import { useSession } from "../composables/use-session";
import { icons } from "../lib/icons";
import { trackCoverUrl } from "../lib/library";
import { loadCollectionTrackIds } from "../lib/catalog-collections";

const props = defineProps<{ item: ResolvedQuickPickItem }>();
const { address } = useServer();
const { token } = useSession();
const { active, playing, loading, play, playCollection, togglePlayback } =
  useLibraryPlayer();
const coverFailed = ref(false);
const coverUrl = computed(() =>
  trackCoverUrl(
    address.value ?? "",
    props.item.kind === "track"
      ? props.item.track.coverUrl
      : props.item.album.coverUrl,
  ),
);
const title = computed(() =>
  props.item.kind === "track" ? props.item.track.title : props.item.album.title,
);
const artistLabel = computed(() => quickPickArtistNames(props.item).join(", "));
const typeIcon = computed(() =>
  props.item.kind === "track" ? icons.music : icons.library,
);
const activeItem = computed(() => {
  const activeTrackId = active.value?.id;
  if (!activeTrackId) return false;
  return props.item.kind === "track"
    ? activeTrackId === props.item.track.id
    : active.value?.album === props.item.album.title &&
        active.value.artist === props.item.album.artist;
});
const playLabel = computed(() => {
  const kind = props.item.kind === "track" ? "track" : "album";
  if (activeItem.value) {
    if (playing.value) return `Pause ${kind} ${title.value}`;
    return props.item.kind === "album"
      ? `Play album ${title.value} from the first track`
      : `Resume track ${title.value}`;
  }
  return props.item.kind === "album"
    ? `Play album ${title.value} from the first track`
    : `Play track ${title.value}`;
});

watch(coverUrl, () => {
  coverFailed.value = false;
});

async function albumTrackIds(): Promise<string[]> {
  if (!address.value || !token.value || props.item.kind !== "album") return [];
  return loadCollectionTrackIds(address.value, token.value, {
    albumId: props.item.album.id,
  });
}

async function toggleItemPlayback() {
  if (activeItem.value && playing.value) {
    togglePlayback();
    return;
  }
  if (props.item.kind === "track") {
    play(props.item.track.id);
    return;
  }
  playCollection(await albumTrackIds());
}
</script>

<template>
  <Button
    variant="ghost"
    class="group/quick-pick h-auto w-full min-w-0 cursor-pointer justify-start gap-2 px-0 py-0 text-left"
    :aria-label="playLabel"
    :aria-busy="activeItem && loading"
    @click="toggleItemPlayback"
  >
    <span class="relative size-10 shrink-0 overflow-hidden rounded-md">
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
        class="absolute inset-0 flex items-center justify-center bg-background/70 opacity-0 transition-opacity group-hover/quick-pick:opacity-100 group-focus-visible/quick-pick:opacity-100"
      >
        <Icon
          :icon="activeItem && playing ? icons.pause : icons.play"
          class="size-4 text-foreground"
        />
      </span>
    </span>
    <span class="min-w-0 flex-1">
      <span class="flex min-w-0 items-center gap-1" :title="title">
        <Icon
          :icon="typeIcon"
          aria-hidden="true"
          class="size-3 shrink-0 text-muted-foreground"
        />
        <span class="truncate text-xs font-medium">
          {{ title }}
        </span>
      </span>
      <span
        class="block truncate text-xs text-muted-foreground"
        :title="artistLabel"
      >
        {{ artistLabel }}
      </span>
    </span>
  </Button>
</template>
