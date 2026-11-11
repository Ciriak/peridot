<script setup lang="ts">
import type { TrackResponse } from "@peridot/contracts";
import { Icon } from "@iconify/vue/offline";
import { Button } from "@peridot/ui/components/ui/button";
import { computed, nextTick, ref, watch } from "vue";
import LikeButton from "./LikeButton.vue";
import TrackArtwork from "./TrackArtwork.vue";
import TrackArtistLinks from "./TrackArtistLinks.vue";
import TrackContextMenu from "./TrackContextMenu.vue";
import { useLikes } from "../composables/use-likes";
import { useLibraryPlayer } from "../composables/use-library-player";
import { useProgressiveReveal } from "../composables/use-progressive-reveal";
import { useServer } from "../composables/use-server";
import { icons } from "../lib/icons";
import {
  defaultTrackSort,
  formatTrackDuration,
  formatTrackNumber,
  nextTrackSort,
  sortTracks,
  trackArtistNames,
  trackAlbumRoute,
  trackTitleAnchorId,
  type TrackSort,
  type TrackTableVariant,
  type TrackSortField,
} from "../lib/library";

const props = defineProps<{
  tracks: readonly TrackResponse[];
  variant: TrackTableVariant;
  scrollToTrackId?: string | null;
}>();

const { address } = useServer();
const { playing, currentTrackId, play, playCollection } = useLibraryPlayer();
const {
  likedTrackIds,
  loaded: likesLoaded,
  toggle: toggleLike,
  isPending: isLikePending,
} = useLikes();

const defaultSort = defaultTrackSort(props.variant);
const sort = ref<TrackSort | null>(null);
const sortedTracks = computed(() =>
  sortTracks(props.tracks, sort.value ?? defaultSort),
);
const {
  target: loadMoreTarget,
  hasMore,
  visibleItems: visibleTracks,
  revealMore,
  revealThrough,
} = useProgressiveReveal(sortedTracks);

function toggleSort(field: TrackSortField) {
  sort.value = nextTrackSort(sort.value, field);
}

function ariaSort(field: TrackSortField): "ascending" | "descending" | "none" {
  if (sort.value?.field !== field) return "none";
  return sort.value.direction === "asc" ? "ascending" : "descending";
}

function sortLabel(label: string, field: TrackSortField): string {
  if (sort.value?.field !== field) return `Sort by ${label} ascending`;
  if (sort.value.direction === "asc") return `Sort by ${label} descending`;
  return `Reset ${label} sorting to default`;
}

function isActive(track: TrackResponse): boolean {
  return currentTrackId.value === track.id;
}

function isPlaying(track: TrackResponse): boolean {
  return isActive(track) && playing.value;
}

function playFromList(trackId: string, restart = false) {
  if (!restart && currentTrackId.value === trackId) {
    play(trackId);
    return;
  }
  playCollection(
    sortedTracks.value.map((track) => track.id),
    trackId,
  );
}

watch(
  [() => props.scrollToTrackId, sortedTracks],
  async ([trackId]) => {
    if (!import.meta.client || !trackId) return;
    const index = sortedTracks.value.findIndex((track) => track.id === trackId);
    if (index < 0) return;
    revealThrough(index);
    await nextTick();
    document
      .getElementById(trackTitleAnchorId(trackId))
      ?.scrollIntoView({ block: "start" });
  },
  { flush: "post" },
);
</script>

<template>
  <div
    role="table"
    :aria-rowcount="sortedTracks.length + 1"
    aria-label="Tracks"
    class="overflow-x-auto rounded-lg border text-sm"
  >
    <div role="rowgroup">
      <div
        role="row"
        aria-rowindex="1"
        class="flex min-w-full border-b text-muted-foreground"
      >
        <div
          v-if="variant !== 'library'"
          role="columnheader"
          class="flex w-16 shrink-0 justify-end p-3 font-medium"
          :aria-sort="ariaSort('number')"
        >
          <button
            type="button"
            class="ml-auto inline-flex items-center gap-1 rounded-md transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            :class="sort?.field === 'number' && 'text-foreground'"
            :aria-label="sortLabel('track number', 'number')"
            @click="toggleSort('number')"
          >
            #
            <Icon
              v-if="sort?.field === 'number'"
              :icon="sort.direction === 'asc' ? icons.caretUp : icons.caretDown"
              aria-hidden="true"
              class="size-3.5"
            />
          </button>
        </div>
        <div
          role="columnheader"
          class="min-w-0 flex-1 p-3 font-medium"
          :aria-sort="ariaSort('title')"
        >
          <button
            type="button"
            class="inline-flex items-center gap-1 rounded-md transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            :class="sort?.field === 'title' && 'text-foreground'"
            :aria-label="sortLabel('title', 'title')"
            @click="toggleSort('title')"
          >
            Title
            <Icon
              v-if="sort?.field === 'title'"
              :icon="sort.direction === 'asc' ? icons.caretUp : icons.caretDown"
              aria-hidden="true"
              class="size-3.5"
            />
          </button>
        </div>
        <div
          v-if="variant !== 'album'"
          role="columnheader"
          class="hidden w-56 shrink-0 p-3 font-medium md:block"
          :aria-sort="ariaSort('album')"
        >
          <button
            type="button"
            class="inline-flex items-center gap-1 rounded-md transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            :class="sort?.field === 'album' && 'text-foreground'"
            :aria-label="sortLabel('album', 'album')"
            @click="toggleSort('album')"
          >
            Album
            <Icon
              v-if="sort?.field === 'album'"
              :icon="sort.direction === 'asc' ? icons.caretUp : icons.caretDown"
              aria-hidden="true"
              class="size-3.5"
            />
          </button>
        </div>
        <div
          role="columnheader"
          class="w-20 shrink-0 p-3 text-right font-medium"
          :aria-sort="ariaSort('duration')"
        >
          <button
            type="button"
            class="ml-auto inline-flex items-center gap-1 rounded-md transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            :class="sort?.field === 'duration' && 'text-foreground'"
            :aria-label="sortLabel('duration', 'duration')"
            @click="toggleSort('duration')"
          >
            Duration
            <Icon
              v-if="sort?.field === 'duration'"
              :icon="sort.direction === 'asc' ? icons.caretUp : icons.caretDown"
              aria-hidden="true"
              class="size-3.5"
            />
          </button>
        </div>
        <div
          role="columnheader"
          class="w-14 shrink-0 p-3 text-right font-medium"
        >
          <span class="sr-only">Favorite</span>
        </div>
      </div>
    </div>

    <div role="rowgroup">
      <TrackContextMenu
        v-for="(track, index) in visibleTracks"
        :key="track.id"
        :track="track"
        @play="playFromList(track.id, true)"
      >
        <div
          role="row"
          :aria-rowindex="index + 2"
          class="group/track-artwork flex h-14 min-w-full select-none items-center whitespace-nowrap border-b hover:bg-muted/50"
          :class="{
            'border-0': index === visibleTracks.length - 1,
          }"
          @dblclick.prevent="playFromList(track.id)"
        >
          <div
            v-if="variant !== 'library'"
            role="cell"
            class="flex w-16 shrink-0 justify-end p-3 tabular-nums text-muted-foreground"
          >
            {{ formatTrackNumber(track) }}
          </div>
          <div role="cell" class="flex min-w-0 flex-1 items-center gap-2 p-2">
            <TrackArtwork :track="track" :server-address="address ?? ''">
              <Button
                variant="ghost"
                size="icon-sm"
                class="absolute inset-0 size-full rounded-md bg-background/70 opacity-0 transition-opacity hover:bg-background/70 hover:text-foreground dark:hover:bg-background/70 group-hover/track-artwork:opacity-100 group-focus-within/track-artwork:opacity-100"
                :aria-label="
                  isPlaying(track)
                    ? `Pause ${track.title}`
                    : `Play track ${track.title}`
                "
                @click="playFromList(track.id)"
                @dblclick.stop
              >
                <Icon
                  :icon="isPlaying(track) ? icons.pause : icons.play"
                  aria-hidden="true"
                  class="text-foreground"
                />
              </Button>
            </TrackArtwork>
            <div class="min-w-0 flex-1">
              <div class="flex min-w-0 items-center gap-2">
                <span
                  :id="trackTitleAnchorId(track.id)"
                  class="scroll-mt-4 truncate"
                  :class="{ 'opacity-60': !track.available }"
                  >{{ track.title }}</span
                >
                <Icon
                  v-if="isActive(track)"
                  :icon="icons.waveform"
                  aria-hidden="true"
                  class="size-4 shrink-0 text-primary"
                />
              </div>
              <p class="truncate text-xs text-muted-foreground">
                <TrackArtistLinks :artists="trackArtistNames(track)" />
              </p>
            </div>
          </div>
          <div
            v-if="variant !== 'album'"
            role="cell"
            class="hidden w-56 shrink-0 truncate p-3 text-muted-foreground md:block"
          >
            <NuxtLink
              v-if="track.album?.trim() && track.artist.trim()"
              :to="trackAlbumRoute(track)"
              class="block truncate rounded-sm hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              @dblclick.stop
            >
              {{ track.album?.trim() }}
            </NuxtLink>
            <template v-else>
              {{ track.album?.trim() || "—" }}
            </template>
          </div>
          <div
            role="cell"
            class="w-20 shrink-0 p-3 text-right tabular-nums text-muted-foreground"
          >
            {{ formatTrackDuration(track.durationMs) }}
          </div>
          <div role="cell" class="w-14 shrink-0 p-2 text-right">
            <LikeButton
              :liked="likedTrackIds.includes(track.id)"
              :label="track.title"
              :pending="isLikePending({ kind: 'track', trackId: track.id })"
              :disabled="!likesLoaded"
              @toggle="toggleLike({ kind: 'track', trackId: track.id })"
              @dblclick.stop
            />
          </div>
        </div>
      </TrackContextMenu>
    </div>
    <div v-if="hasMore" ref="loadMoreTarget" role="rowgroup">
      <div
        role="row"
        :aria-rowindex="visibleTracks.length + 2"
        class="flex min-w-full justify-center border-t p-3"
      >
        <div role="cell">
          <Button type="button" variant="outline" @click="revealMore">
            Load more tracks
          </Button>
        </div>
      </div>
    </div>
  </div>
</template>
