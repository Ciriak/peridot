<script setup lang="ts">
import { useI18n } from "#imports";
import type { TrackResponse } from "@peridot/contracts";
import { Icon } from "@iconify/vue/offline";
import { Button } from "@peridot/ui/components/ui/button";
import { useIntersectionObserver } from "@vueuse/core";
import { computed, nextTick, ref, watch } from "vue";
import LikeButton from "./LikeButton.vue";
import TrackArtwork from "./TrackArtwork.vue";
import TrackArtistLinks from "./TrackArtistLinks.vue";
import TrackContextMenu from "./TrackContextMenu.vue";
import { useLikes } from "../composables/use-likes";
import { useLibraryPlayer } from "../composables/use-library-player";
import { useServer } from "../composables/use-server";
import { icons } from "../lib/icons";
import {
  defaultTrackSort,
  formatTrackDuration,
  formatTrackNumber,
  nextTrackSort,
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
  sort?: TrackSort;
  hasMore?: boolean;
  loadingMore?: boolean;
}>();
const { t } = useI18n();
const emit = defineEmits<{
  "sort-change": [sort: TrackSort | null];
  "load-more": [];
}>();

const { address } = useServer();
const { playing, currentTrackId, play, playCollection } = useLibraryPlayer();
const {
  likedTrackIds,
  loaded: likesLoaded,
  toggle: toggleLike,
  isPending: isLikePending,
} = useLikes();

const activeSort = computed(
  () => props.sort ?? defaultTrackSort(props.variant),
);
const rows = computed(() =>
  props.tracks.map((data, index) => ({ data, index })),
);
const loadMoreTarget = ref<HTMLElement | null>(null);
useIntersectionObserver(
  loadMoreTarget,
  ([entry]) => {
    if (entry?.isIntersecting && props.hasMore && !props.loadingMore) {
      emit("load-more");
    }
  },
  { rootMargin: "300px 0px", threshold: 0 },
);

function toggleSort(field: TrackSortField) {
  emit("sort-change", nextTrackSort(activeSort.value, field));
}

function ariaSort(field: TrackSortField): "ascending" | "descending" | "none" {
  if (activeSort.value.field !== field) return "none";
  return activeSort.value.direction === "asc" ? "ascending" : "descending";
}

function sortLabel(field: TrackSortField): string {
  const label = t(
    field === "number"
      ? "trackTable.trackNumber"
      : field === "title"
        ? "trackTable.title"
        : field === "album"
          ? "trackTable.album"
          : "trackTable.duration",
  );
  if (activeSort.value.field !== field) {
    return t("trackTable.sortAscending", { label });
  }
  if (activeSort.value.direction === "asc") {
    return t("trackTable.sortDescending", { label });
  }
  return t("trackTable.resetSort", { label });
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
    props.tracks.map((track) => track.id),
    trackId,
  );
}

watch(
  [() => props.scrollToTrackId, () => props.tracks],
  async ([trackId]) => {
    if (!import.meta.client || !trackId) return;
    const index = props.tracks.findIndex((track) => track.id === trackId);
    if (index < 0) return;
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
    :aria-rowcount="tracks.length + 1"
    :aria-label="t('trackTable.label')"
    class="rounded-lg border text-sm"
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
            :class="activeSort.field === 'number' && 'text-foreground'"
            :aria-label="sortLabel('number')"
            @click="toggleSort('number')"
          >
            #
            <Icon
              v-if="activeSort.field === 'number'"
              :icon="
                activeSort.direction === 'asc' ? icons.caretUp : icons.caretDown
              "
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
            :class="activeSort.field === 'title' && 'text-foreground'"
            :aria-label="sortLabel('title')"
            @click="toggleSort('title')"
          >
            {{ t("trackTable.title") }}
            <Icon
              v-if="activeSort.field === 'title'"
              :icon="
                activeSort.direction === 'asc' ? icons.caretUp : icons.caretDown
              "
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
            :class="activeSort.field === 'album' && 'text-foreground'"
            :aria-label="sortLabel('album')"
            @click="toggleSort('album')"
          >
            {{ t("trackTable.album") }}
            <Icon
              v-if="activeSort.field === 'album'"
              :icon="
                activeSort.direction === 'asc' ? icons.caretUp : icons.caretDown
              "
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
            :class="activeSort.field === 'duration' && 'text-foreground'"
            :aria-label="sortLabel('duration')"
            @click="toggleSort('duration')"
          >
            {{ t("trackTable.duration") }}
            <Icon
              v-if="activeSort.field === 'duration'"
              :icon="
                activeSort.direction === 'asc' ? icons.caretUp : icons.caretDown
              "
              aria-hidden="true"
              class="size-3.5"
            />
          </button>
        </div>
        <div
          role="columnheader"
          class="w-14 shrink-0 p-3 text-right font-medium"
        >
          <span class="sr-only">{{ t("trackTable.favorite") }}</span>
        </div>
      </div>
    </div>

    <div role="rowgroup">
      <TrackContextMenu
        v-for="item in rows"
        :key="item.data.id"
        :track="item.data"
        @play="playFromList(item.data.id, true)"
      >
        <div
          role="row"
          :aria-rowindex="item.index + 2"
          class="group/track-artwork flex h-14 min-w-full select-none items-center whitespace-nowrap border-b hover:bg-muted/50"
          :class="{
            'border-0': item.index === tracks.length - 1,
          }"
          @dblclick.prevent="playFromList(item.data.id)"
        >
          <div
            v-if="variant !== 'library'"
            role="cell"
            class="flex w-16 shrink-0 justify-end p-3 tabular-nums text-muted-foreground"
          >
            {{ formatTrackNumber(item.data) }}
          </div>
          <div role="cell" class="flex min-w-0 flex-1 items-center gap-2 p-2">
            <TrackArtwork :track="item.data" :server-address="address ?? ''">
              <Button
                variant="ghost"
                size="icon-sm"
                class="absolute inset-0 size-full rounded-md bg-background/70 opacity-0 transition-opacity hover:bg-background/70 hover:text-foreground dark:hover:bg-background/70 group-hover/track-artwork:opacity-100 group-focus-within/track-artwork:opacity-100"
                :aria-label="
                  isPlaying(item.data)
                    ? t('trackTable.pause', { title: item.data.title })
                    : t('trackTable.play', { title: item.data.title })
                "
                @click="playFromList(item.data.id)"
                @dblclick.stop
              >
                <Icon
                  :icon="isPlaying(item.data) ? icons.pause : icons.play"
                  aria-hidden="true"
                  class="text-foreground"
                />
              </Button>
            </TrackArtwork>
            <div class="min-w-0 flex-1">
              <div class="flex min-w-0 items-center gap-2">
                <span
                  :id="trackTitleAnchorId(item.data.id)"
                  class="scroll-mt-4 truncate"
                  :class="{ 'opacity-60': !item.data.available }"
                  >{{ item.data.title }}</span
                >
                <Icon
                  v-if="isActive(item.data)"
                  :icon="icons.waveform"
                  aria-hidden="true"
                  class="size-4 shrink-0 text-primary"
                />
              </div>
              <p class="truncate text-xs text-muted-foreground">
                <TrackArtistLinks :artists="trackArtistNames(item.data)" />
              </p>
            </div>
          </div>
          <div
            v-if="variant !== 'album'"
            role="cell"
            class="hidden w-56 shrink-0 truncate p-3 text-muted-foreground md:block"
          >
            <NuxtLink
              v-if="item.data.album?.trim() && item.data.artist.trim()"
              :to="trackAlbumRoute(item.data)"
              class="block truncate rounded-sm hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              @dblclick.stop
            >
              {{ item.data.album?.trim() }}
            </NuxtLink>
            <template v-else>
              {{ item.data.album?.trim() || "—" }}
            </template>
          </div>
          <div
            role="cell"
            class="w-20 shrink-0 p-3 text-right tabular-nums text-muted-foreground"
          >
            {{ formatTrackDuration(item.data.durationMs) }}
          </div>
          <div role="cell" class="w-14 shrink-0 p-2 text-right">
            <LikeButton
              :liked="likedTrackIds.includes(item.data.id) || item.data.liked"
              :label="item.data.title"
              :pending="isLikePending({ kind: 'track', trackId: item.data.id })"
              :disabled="!likesLoaded"
              @toggle="toggleLike({ kind: 'track', trackId: item.data.id })"
              @dblclick.stop
            />
          </div>
        </div>
      </TrackContextMenu>
    </div>
    <div v-if="hasMore" role="rowgroup">
      <div
        ref="loadMoreTarget"
        role="row"
        :aria-rowindex="tracks.length + 2"
        class="flex min-w-full justify-center border-t p-3"
      >
        <div role="cell">
          <Button
            type="button"
            variant="outline"
            :disabled="loadingMore"
            @click="emit('load-more')"
          >
            {{
              loadingMore
                ? t("trackTable.loadingMore")
                : t("trackTable.loadMore")
            }}
          </Button>
        </div>
      </div>
    </div>
  </div>
</template>
