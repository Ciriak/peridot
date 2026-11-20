<script setup lang="ts">
import { useI18n } from "#imports";
import type { TrackResponse } from "@peridot/contracts";
import { Icon } from "@iconify/vue/offline";
import { Badge } from "@peridot/ui/components/ui/badge";
import { Button } from "@peridot/ui/components/ui/button";
import { ProgressCircle } from "@peridot/ui/components/ui/progress-circle";
import { ScrollingText } from "@peridot/ui/components/ui/scrolling-text";
import { computed, nextTick, ref, watch } from "vue";
import AutoLoadMore from "./AutoLoadMore.vue";
import AlbumLink from "./AlbumLink.vue";
import DownloadProgressTooltip from "./DownloadProgressTooltip.vue";
import LikeButton from "./LikeButton.vue";
import TrackArtistLinks from "./TrackArtistLinks.vue";
import TrackArtwork from "./TrackArtwork.vue";
import TrackContextMenu from "./TrackContextMenu.vue";
import { useMainScrollVirtualizer } from "../composables/use-main-scroll-virtualizer";
import { useLikes } from "../composables/use-likes";
import { useLibraryPlayer } from "../composables/use-library-player";
import { useOfflineTracks } from "../composables/use-offline-tracks";
import { useServer } from "../composables/use-server";
import { useServerConnection } from "../composables/use-server-connection";
import { icons } from "../lib/icons";
import { notifyOfflineTrackFailed } from "../lib/toasts";
import {
  defaultTrackSort,
  formatTrackDuration,
  formatTrackNumber,
  nextTrackSort,
  albumSummaryFromTrack,
  trackArtistNames,
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
const rowGroup = ref<HTMLElement | null>(null);
const virtualizer = useMainScrollVirtualizer({
  count: computed(() => props.tracks.length),
  estimateSize: 56,
  overscan: 8,
  wrapper: rowGroup,
  getItemKey: (index) => props.tracks[index]?.id ?? index,
});
const virtualRows = computed(() =>
  virtualizer.virtualItems.value.flatMap((row) => {
    const track = props.tracks[row.index];
    return track ? [{ ...row, track }] : [];
  }),
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

function isOfflineOnly(track: TrackResponse): boolean {
  return !track.available && isSavedOffline(track.id);
}

function loadMoreRows() {
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
  if (!(await saveOffline(track))) {
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

const completedScrollTarget = ref<string | null>(null);

async function scrollToTarget(trackId: string) {
  await nextTick();
  await virtualizer.refresh();
  const index = props.tracks.findIndex((track) => track.id === trackId);
  if (index < 0) return false;
  virtualizer.scrollToIndex(index, { align: "start" });
  completedScrollTarget.value = trackId;
  return true;
}

watch(
  () => props.scrollToTrackId,
  async (trackId) => {
    completedScrollTarget.value = null;
    if (import.meta.client && trackId) await scrollToTarget(trackId);
  },
  { flush: "post", immediate: true },
);
watch(
  () => props.tracks,
  async () => {
    const trackId = props.scrollToTrackId;
    if (
      import.meta.client &&
      trackId &&
      completedScrollTarget.value !== trackId
    ) {
      await scrollToTarget(trackId);
    }
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
    :style="{ overflowAnchor: 'none' }"
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
          v-if="variant !== 'album'"
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

    <div
      ref="rowGroup"
      role="rowgroup"
      class="relative"
      :style="{
        height: `${virtualizer.totalSize.value}px`,
        overflowAnchor: 'none',
      }"
    >
      <TrackContextMenu
        v-for="item in virtualRows"
        :key="String(item.key)"
        :track="item.track"
        @play="playFromList(item.track, true)"
      >
        <div
          role="row"
          :aria-rowindex="item.index + 2"
          class="group/track-artwork flex h-14 min-w-full select-none items-center whitespace-nowrap border-b hover:bg-muted/50"
          :class="{
            'border-0': item.index === tracks.length - 1,
          }"
          :style="virtualizer.virtualRowStyle(item)"
          @dblclick.prevent="playFromList(item.track)"
        >
          <div
            v-if="variant !== 'library'"
            role="cell"
            class="flex w-16 shrink-0 justify-end p-3 tabular-nums text-muted-foreground"
          >
            {{ formatTrackNumber(item.track) }}
          </div>
          <div role="cell" class="flex min-w-0 flex-1 items-center gap-2 p-2">
            <TrackArtwork
              :track="item.track"
              :server-address="address ?? ''"
              :class="isUnavailable(item.track) && 'opacity-60'"
            >
              <Button
                variant="ghost"
                size="icon-sm"
                class="absolute inset-0 size-full cursor-pointer rounded-md bg-background/70 opacity-0 transition-opacity hover:bg-background/70 hover:text-foreground disabled:cursor-not-allowed dark:hover:bg-background/70 group-hover/track-artwork:opacity-100 group-focus-within/track-artwork:opacity-100"
                :disabled="isUnavailable(item.track)"
                :aria-label="
                  isPlaying(item.track)
                    ? t('trackTable.pause', { title: item.track.title })
                    : t('trackTable.play', { title: item.track.title })
                "
                @click="playFromList(item.track)"
                @dblclick.stop
              >
                <Icon
                  :icon="isPlaying(item.track) ? icons.pause : icons.play"
                  aria-hidden="true"
                  class="text-foreground"
                />
              </Button>
            </TrackArtwork>
            <div class="min-w-0 flex-1">
              <div class="flex min-w-0 items-center gap-2">
                <ScrollingText
                  :id="trackTitleAnchorId(item.track.id)"
                  class="min-w-0 scroll-mt-4"
                  :class="{ 'opacity-60': isUnavailable(item.track) }"
                  >{{ item.track.title }}</ScrollingText
                >
                <Icon
                  v-if="isActive(item.track)"
                  :icon="icons.waveform"
                  aria-hidden="true"
                  class="size-4 shrink-0 text-primary"
                />
                <Badge
                  v-if="!item.track.available"
                  variant="secondary"
                  class="shrink-0"
                >
                  {{
                    isOfflineOnly(item.track)
                      ? t("trackTable.availableOffline")
                      : t("trackTable.unavailable")
                  }}
                </Badge>
              </div>
              <ScrollingText class="w-full text-xs text-muted-foreground">
                <template
                  v-if="
                    showArtists !== false && item.track.mediaType === 'music'
                  "
                >
                  <TrackArtistLinks :artists="trackArtistNames(item.track)" />
                </template>
                <template v-else>{{ item.track.artist }}</template>
              </ScrollingText>
            </div>
          </div>
          <div
            v-if="!['album', 'audiobook', 'podcast'].includes(variant)"
            role="cell"
            class="hidden w-56 shrink-0 p-3 text-muted-foreground md:block"
          >
            <ScrollingText
              v-if="item.track.album?.trim() && item.track.artist.trim()"
              class="w-full"
            >
              <AlbumLink :album="albumSummaryFromTrack(item.track)" />
            </ScrollingText>
            <ScrollingText v-else class="w-full">
              {{ item.track.album?.trim() || "—" }}
            </ScrollingText>
          </div>
          <div
            role="cell"
            class="w-20 shrink-0 p-3 text-right tabular-nums text-muted-foreground"
          >
            {{ formatTrackDuration(item.track.durationMs) }}
          </div>
          <div
            v-if="variant !== 'album'"
            role="cell"
            class="w-14 shrink-0 p-2 text-right"
          >
            <DownloadProgressTooltip
              :active="
                isOfflinePending(item.track.id) &&
                !isSavedOffline(item.track.id)
              "
              :label="offlineActionLabel(item.track)"
              :progress="offlineProgressFor(item.track.id) ?? null"
              :title="item.track.title"
              type="track"
            >
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                :disabled="
                  isOfflinePending(item.track.id) ||
                  (!isSavedOffline(item.track.id) &&
                    (!canSaveOffline || !item.track.available))
                "
                :aria-busy="isOfflinePending(item.track.id)"
                :aria-label="offlineActionLabel(item.track)"
                :title="offlineActionLabel(item.track)"
                :aria-pressed="isSavedOffline(item.track.id)"
                @click="toggleOffline(item.track)"
                @dblclick.stop
              >
                <ProgressCircle
                  v-if="
                    isOfflinePending(item.track.id) &&
                    !isSavedOffline(item.track.id)
                  "
                  :value="offlineProgressFor(item.track.id) ?? null"
                  :label="offlineActionLabel(item.track)"
                  size="sm"
                />
                <Icon
                  v-else
                  :icon="
                    isSavedOffline(item.track.id)
                      ? icons.cloudCheck
                      : icons.cloudDownload
                  "
                  aria-hidden="true"
                  :class="
                    isSavedOffline(item.track.id)
                      ? 'text-primary'
                      : 'text-muted-foreground'
                  "
                />
              </Button>
            </DownloadProgressTooltip>
          </div>
          <div
            v-if="allowTrackLike !== false && item.track.mediaType === 'music'"
            role="cell"
            class="w-14 shrink-0 p-2 text-right"
          >
            <LikeButton
              :liked="
                likesLoaded
                  ? likedTrackIds.includes(item.track.id)
                  : item.track.liked
              "
              :label="item.track.title"
              :pending="
                isLikePending({ kind: 'track', trackId: item.track.id })
              "
              :disabled="!likesLoaded"
              @toggle="toggleLike({ kind: 'track', trackId: item.track.id })"
              @dblclick.stop
            />
          </div>
        </div>
      </TrackContextMenu>
    </div>
    <div v-if="hasMore" role="rowgroup">
      <div role="row" :aria-rowindex="tracks.length + 2">
        <AutoLoadMore
          role="cell"
          class="min-w-full"
          :enabled="Boolean(hasMore)"
          :loading="Boolean(loadingMore)"
          :item-count="tracks.length"
          :label="t('trackTable.loadingMore')"
          @load="loadMoreRows"
        />
      </div>
    </div>
  </div>
</template>
