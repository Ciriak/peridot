<script setup lang="ts">
import { useI18n } from "#imports";
import type { TrackResponse } from "@peridot/contracts";
import { Icon } from "@iconify/vue/offline";
import { Button } from "@peridot/ui/components/ui/button";
import { ProgressCircle } from "@peridot/ui/components/ui/progress-circle";
import { ScrollingText } from "@peridot/ui/components/ui/scrolling-text";
import { computed, nextTick, ref, watch } from "vue";
import AutoLoadMore from "./AutoLoadMore.vue";
import LikeButton from "./LikeButton.vue";
import TrackArtwork from "./TrackArtwork.vue";
import TrackArtistLinks from "./TrackArtistLinks.vue";
import TrackContextMenu from "./TrackContextMenu.vue";
import { useLikes } from "../composables/use-likes";
import { useLibraryPlayer } from "../composables/use-library-player";
import { useOfflineTracks } from "../composables/use-offline-tracks";
import { useServer } from "../composables/use-server";
import { useServerConnection } from "../composables/use-server-connection";
import { icons } from "../lib/icons";
import {
  notifyOfflineTrackFailed,
  notifyOfflineTrackSaved,
} from "../lib/toasts";
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
import { isTrackPlayable } from "../lib/offline-playback";

const props = defineProps<{
  tracks: readonly TrackResponse[];
  variant: TrackTableVariant;
  scrollToTrackId?: string | null;
  sort?: TrackSort;
  hasMore?: boolean;
  loadingMore?: boolean;
  showArtists?: boolean;
  allowTrackLike?: boolean;
}>();
const { t } = useI18n();
const emit = defineEmits<{
  "sort-change": [sort: TrackSort | null];
  "load-more": [];
}>();

const { address } = useServer();
const { status: serverStatus } = useServerConnection();
const { playing, currentTrackId, play, playCollection } = useLibraryPlayer();
const {
  likedTrackIds,
  loaded: likesLoaded,
  toggle: toggleLike,
  isPending: isLikePending,
} = useLikes();
const {
  savedTracks: savedOfflineTracks,
  canSave: canSaveOffline,
  error: offlineError,
  isSaved: isSavedOffline,
  isPending: isOfflinePending,
  progressFor: offlineProgressFor,
  save: saveOffline,
  remove: removeOffline,
} = useOfflineTracks();
const savedTrackIds = computed(
  () => new Set(savedOfflineTracks.value.map((saved) => saved.track.id)),
);

const activeSort = computed(
  () => props.sort ?? defaultTrackSort(props.variant),
);
const TRACK_BATCH_SIZE = 30;
const rows = computed(() =>
  props.tracks.map((data, index) => ({ data, index })),
);
const visibleCount = ref(TRACK_BATCH_SIZE);
const visibleRows = computed(() => rows.value.slice(0, visibleCount.value));
const hasHiddenRows = computed(() => visibleCount.value < rows.value.length);
const autoLoadProgress = computed(
  () => rows.value.length + visibleRows.value.length,
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

function isUnavailable(track: TrackResponse): boolean {
  return !isTrackPlayable(track, {
    serverLost: serverStatus.value === "lost",
    savedTrackIds: savedTrackIds.value,
  });
}

function loadMoreRows() {
  if (hasHiddenRows.value) {
    visibleCount.value = Math.min(
      rows.value.length,
      visibleCount.value + TRACK_BATCH_SIZE,
    );
    return;
  }
  if (props.hasMore && !props.loadingMore) emit("load-more");
}

function playFromList(track: TrackResponse, restart = false) {
  if (isUnavailable(track)) return;
  if (!restart && currentTrackId.value === track.id) {
    play(track);
    return;
  }
  playCollection(
    props.tracks.filter((candidate) => !isUnavailable(candidate)),
    track.id,
  );
}

async function toggleOffline(track: TrackResponse) {
  if (isOfflinePending(track.id)) return;
  if (isSavedOffline(track.id)) {
    if (!(await removeOffline(track.id))) {
      notifyOfflineTrackFailed(
        track.title,
        offlineError.value ?? t("error.apiUnavailable"),
      );
    }
    return;
  }
  if (await saveOffline(track)) {
    notifyOfflineTrackSaved(track.title);
  } else {
    notifyOfflineTrackFailed(
      track.title,
      offlineError.value ?? t("error.apiUnavailable"),
    );
  }
}

function offlineActionLabel(track: TrackResponse): string {
  if (isOfflinePending(track.id) && !isSavedOffline(track.id)) {
    return t("trackTable.savingOffline", { title: track.title });
  }
  return isSavedOffline(track.id)
    ? t("trackTable.removeOffline", { title: track.title })
    : t("trackTable.saveOffline", { title: track.title });
}

watch(
  [() => props.scrollToTrackId, () => props.tracks],
  async ([trackId]) => {
    if (!import.meta.client || !trackId) return;
    const index = rows.value.findIndex((item) => item.data.id === trackId);
    if (index < 0) return;
    visibleCount.value = Math.max(visibleCount.value, index + 1);
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
          v-if="!['album', 'audiobook', 'podcast'].includes(variant)"
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
          <span class="sr-only">{{ t("trackTable.offline") }}</span>
        </div>
        <div
          v-if="allowTrackLike !== false"
          role="columnheader"
          class="w-14 shrink-0 p-3 text-right font-medium"
        >
          <span class="sr-only">{{ t("trackTable.favorite") }}</span>
        </div>
      </div>
    </div>

    <div role="rowgroup">
      <TrackContextMenu
        v-for="item in visibleRows"
        :key="item.data.id"
        :track="item.data"
        @play="playFromList(item.data, true)"
      >
        <div
          role="row"
          :aria-rowindex="item.index + 2"
          class="group/track-artwork flex h-14 min-w-full select-none items-center whitespace-nowrap border-b hover:bg-muted/50"
          :class="{
            'border-0': item.index === tracks.length - 1,
          }"
          @dblclick.prevent="playFromList(item.data)"
        >
          <div
            v-if="variant !== 'library'"
            role="cell"
            class="flex w-16 shrink-0 justify-end p-3 tabular-nums text-muted-foreground"
          >
            {{ formatTrackNumber(item.data) }}
          </div>
          <div
            role="cell"
            class="flex min-w-0 flex-1 items-center gap-2 p-2"
          >
            <TrackArtwork
              :track="item.data"
              :server-address="address ?? ''"
              :class="isUnavailable(item.data) && 'opacity-60'"
            >
              <Button
                variant="ghost"
                size="icon-sm"
                class="absolute inset-0 size-full cursor-pointer rounded-md bg-background/70 opacity-0 transition-opacity hover:bg-background/70 hover:text-foreground disabled:cursor-not-allowed dark:hover:bg-background/70 group-hover/track-artwork:opacity-100 group-focus-within/track-artwork:opacity-100"
                :disabled="isUnavailable(item.data)"
                :aria-label="
                  isPlaying(item.data)
                    ? t('trackTable.pause', { title: item.data.title })
                    : t('trackTable.play', { title: item.data.title })
                "
                @click="playFromList(item.data)"
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
                <ScrollingText
                  :id="trackTitleAnchorId(item.data.id)"
                  class="min-w-0 scroll-mt-4"
                  :class="{ 'opacity-60': isUnavailable(item.data) }"
                  >{{ item.data.title }}</ScrollingText
                >
                <Icon
                  v-if="isActive(item.data)"
                  :icon="icons.waveform"
                  aria-hidden="true"
                  class="size-4 shrink-0 text-primary"
                />
              </div>
              <ScrollingText class="w-full text-xs text-muted-foreground">
                <TrackArtistLinks
                  v-if="
                    showArtists !== false && item.data.mediaType === 'music'
                  "
                  :artists="trackArtistNames(item.data)"
                />
                <template v-else>{{ item.data.artist }}</template>
                <span
                  v-if="item.data.genres.length"
                  :aria-label="
                    t('trackTable.genres', {
                      genres: item.data.genres.join(', '),
                    })
                  "
                >
                  · {{ item.data.genres.join(" · ") }}
                </span>
              </ScrollingText>
            </div>
          </div>
          <div
            v-if="!['album', 'audiobook', 'podcast'].includes(variant)"
            role="cell"
            class="hidden w-56 shrink-0 p-3 text-muted-foreground md:block"
          >
            <ScrollingText
              v-if="item.data.album?.trim() && item.data.artist.trim()"
              class="w-full"
            >
              <NuxtLink
                :to="trackAlbumRoute(item.data)"
                class="rounded-sm hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                @dblclick.stop
              >
                {{ item.data.album?.trim() }}
              </NuxtLink>
            </ScrollingText>
            <ScrollingText v-else class="w-full">
              {{ item.data.album?.trim() || "—" }}
            </ScrollingText>
          </div>
          <div
            role="cell"
            class="w-20 shrink-0 p-3 text-right tabular-nums text-muted-foreground"
          >
            {{ formatTrackDuration(item.data.durationMs) }}
          </div>
          <div role="cell" class="w-14 shrink-0 p-2 text-right">
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              :disabled="
                isOfflinePending(item.data.id) ||
                (!isSavedOffline(item.data.id) &&
                  (!canSaveOffline || !item.data.available))
              "
              :aria-busy="isOfflinePending(item.data.id)"
              :aria-label="offlineActionLabel(item.data)"
              :title="offlineActionLabel(item.data)"
              :aria-pressed="isSavedOffline(item.data.id)"
              @click="toggleOffline(item.data)"
              @dblclick.stop
            >
              <ProgressCircle
                v-if="
                  isOfflinePending(item.data.id) &&
                  !isSavedOffline(item.data.id)
                "
                :value="offlineProgressFor(item.data.id) ?? null"
                :label="offlineActionLabel(item.data)"
                size="sm"
              />
              <Icon
                v-else
                :icon="
                  isSavedOffline(item.data.id)
                    ? icons.cloudCheck
                    : icons.cloudDownload
                "
                aria-hidden="true"
                :class="
                  isSavedOffline(item.data.id)
                    ? 'text-primary'
                    : 'text-muted-foreground'
                "
              />
            </Button>
          </div>
          <div
            v-if="allowTrackLike !== false && item.data.mediaType === 'music'"
            role="cell"
            class="w-14 shrink-0 p-2 text-right"
          >
            <LikeButton
              :liked="
                likesLoaded
                  ? likedTrackIds.includes(item.data.id)
                  : item.data.liked
              "
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
    <div
      v-if="hasHiddenRows || hasMore"
      role="rowgroup"
    >
      <div role="row" :aria-rowindex="tracks.length + 2">
        <AutoLoadMore
          role="cell"
          class="min-w-full"
          :enabled="hasHiddenRows || Boolean(hasMore)"
          :loading="Boolean(loadingMore) && !hasHiddenRows"
          :item-count="autoLoadProgress"
          :label="t('trackTable.loadingMore')"
          @load="loadMoreRows"
        />
      </div>
    </div>
  </div>
</template>
