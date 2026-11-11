<script setup lang="ts">
import type { TrackResponse } from "@peridot/contracts";
import { Icon } from "@iconify/vue/offline";
import { Button } from "@peridot/ui/components/ui/button";
import { computed, ref } from "vue";
import LikeButton from "./LikeButton.vue";
import TrackArtistLinks from "./TrackArtistLinks.vue";
import TrackContextMenu from "./TrackContextMenu.vue";
import { useLikes } from "../composables/use-likes";
import { useLibraryPlayer } from "../composables/use-library-player";
import { icons } from "../lib/icons";
import {
  defaultTrackSort,
  formatTrackDuration,
  formatTrackNumber,
  nextTrackSort,
  sortTracks,
  trackAlbumRoute,
  trackTitleAnchorId,
  type TrackSort,
  type TrackTableVariant,
  type TrackSortField,
} from "../lib/library";

const props = defineProps<{
  tracks: readonly TrackResponse[];
  variant: TrackTableVariant;
}>();

const { playing, currentTrackId, play } = useLibraryPlayer();
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
</script>

<template>
  <div class="overflow-x-auto rounded-lg border">
    <table class="w-full text-left text-sm">
      <thead class="border-b text-muted-foreground">
        <tr>
          <th
            v-if="variant !== 'library'"
            scope="col"
            class="w-16 p-3 text-right font-medium"
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
                :icon="
                  sort.direction === 'asc' ? icons.caretUp : icons.caretDown
                "
                aria-hidden="true"
                class="size-3.5"
              />
            </button>
          </th>
          <th
            scope="col"
            class="p-3 font-medium"
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
                :icon="
                  sort.direction === 'asc' ? icons.caretUp : icons.caretDown
                "
                aria-hidden="true"
                class="size-3.5"
              />
            </button>
          </th>
          <th
            v-if="variant === 'library'"
            scope="col"
            class="hidden p-3 font-medium sm:table-cell"
            :aria-sort="ariaSort('artist')"
          >
            <button
              type="button"
              class="inline-flex items-center gap-1 rounded-md transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              :class="sort?.field === 'artist' && 'text-foreground'"
              :aria-label="sortLabel('artist', 'artist')"
              @click="toggleSort('artist')"
            >
              Artist
              <Icon
                v-if="sort?.field === 'artist'"
                :icon="
                  sort.direction === 'asc' ? icons.caretUp : icons.caretDown
                "
                aria-hidden="true"
                class="size-3.5"
              />
            </button>
          </th>
          <th
            v-if="variant !== 'album'"
            scope="col"
            class="hidden p-3 font-medium md:table-cell"
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
                :icon="
                  sort.direction === 'asc' ? icons.caretUp : icons.caretDown
                "
                aria-hidden="true"
                class="size-3.5"
              />
            </button>
          </th>
          <th
            scope="col"
            class="p-3 text-right font-medium"
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
                :icon="
                  sort.direction === 'asc' ? icons.caretUp : icons.caretDown
                "
                aria-hidden="true"
                class="size-3.5"
              />
            </button>
          </th>
          <th scope="col" class="p-3 text-right font-medium">
            <span class="sr-only">Favorite</span>
          </th>
        </tr>
      </thead>
      <tbody>
        <TrackContextMenu
          v-for="track in sortedTracks"
          :key="track.id"
          :track="track"
          @play="play(track.id, true)"
        >
          <tr
            class="select-none border-b last:border-0 hover:bg-muted/50"
            @dblclick.prevent="play(track.id)"
          >
            <td
              v-if="variant !== 'library'"
              class="p-3 text-right tabular-nums text-muted-foreground"
            >
              {{ formatTrackNumber(track) }}
            </td>
            <td class="p-2">
              <div class="flex min-w-0 items-center gap-2">
                <Button
                  variant="ghost"
                  size="icon-sm"
                  :aria-label="
                    isPlaying(track)
                      ? `Pause ${track.title}`
                      : `Play track ${track.title}`
                  "
                  @click="play(track.id)"
                  @dblclick.stop
                >
                  <Icon
                    :icon="isPlaying(track) ? icons.pause : icons.play"
                    aria-hidden="true"
                    :class="
                      isPlaying(track)
                        ? 'text-primary'
                        : 'text-muted-foreground'
                    "
                  />
                </Button>
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
            </td>
            <td
              v-if="variant === 'library'"
              class="hidden p-3 text-muted-foreground sm:table-cell"
            >
              <TrackArtistLinks :artists="track.artists" />
            </td>
            <td
              v-if="variant !== 'album'"
              class="hidden p-3 text-muted-foreground md:table-cell"
            >
              <NuxtLink
                v-if="
                  variant === 'library' &&
                  track.album?.trim() &&
                  track.artist.trim()
                "
                :to="trackAlbumRoute(track)"
                class="rounded-sm hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                @dblclick.stop
              >
                {{ track.album?.trim() }}
              </NuxtLink>
              <template v-else>{{ track.album?.trim() || "—" }}</template>
            </td>
            <td class="p-3 text-right tabular-nums text-muted-foreground">
              {{ formatTrackDuration(track.durationMs) }}
            </td>
            <td class="p-2 text-right">
              <LikeButton
                :liked="likedTrackIds.includes(track.id)"
                :label="track.title"
                :pending="isLikePending({ kind: 'track', trackId: track.id })"
                :disabled="!likesLoaded"
                @toggle="toggleLike({ kind: 'track', trackId: track.id })"
                @dblclick.stop
              />
            </td>
          </tr>
        </TrackContextMenu>
      </tbody>
    </table>
  </div>
</template>
