<script setup lang="ts">
import { useI18n } from "#imports";
import type {
  AlbumSummaryResponse,
  PlaylistEntryResponse,
  MediaResponse,
} from "@peridot/contracts";
import { Icon } from "@iconify/vue/offline";
import { Badge } from "@peridot/ui/components/ui/badge";
import { Button } from "@peridot/ui/components/ui/button";
import { ScrollingText } from "@peridot/ui/components/ui/scrolling-text";
import { useSortable } from "@vueuse/integrations/useSortable";
import type { SortableEvent } from "sortablejs";
import { computed, ref, watch } from "vue";
import { useLikes } from "../composables/use-likes";
import { useLibraryPlayer } from "../composables/use-library-player";
import { useMainScrollVirtualizer } from "../composables/use-main-scroll-virtualizer";
import { useOfflineTracks } from "../composables/use-offline-tracks";
import { useServer } from "../composables/use-server";
import { useServerConnection } from "../composables/use-server-connection";
import { icons } from "../lib/icons";
import {
  albumSummaryFromTrack,
  formatTrackDuration,
  trackArtistNames,
} from "../lib/library";
import { isTrackPlayable } from "../lib/offline-playback";
import { playlistEntriesAfterDrag } from "../lib/playlist-order";
import AlbumLink from "./AlbumLink.vue";
import ArtistLink from "./ArtistLink.vue";
import LikeButton from "./LikeButton.vue";
import TrackArtistLinks from "./TrackArtistLinks.vue";
import TrackArtwork from "./TrackArtwork.vue";
import MediaRowContextMenu from "./TrackRowContextMenu.vue";

const props = defineProps<{
  entries: readonly PlaylistEntryResponse[];
  editable: boolean;
  readOnly?: boolean;
  showTrackLikes?: boolean;
}>();
const emit = defineEmits<{
  reorder: [itemIds: string[]];
  remove: [entry: PlaylistEntryResponse];
  play: [track: MediaResponse];
}>();
const { t } = useI18n();
const list = ref<HTMLElement | null>(null);
const rows = ref<PlaylistEntryResponse[]>([]);
const virtualizer = useMainScrollVirtualizer({
  count: computed(() => rows.value.length),
  estimateSize: 65,
  overscan: 8,
  wrapper: list,
  getItemKey: (index) => rows.value[index]?.id ?? index,
});
const virtualRows = computed(() =>
  virtualizer.virtualItems.value.flatMap((row) => {
    const entry = rows.value[row.index];
    return entry ? [{ ...row, entry }] : [];
  }),
);
const { address } = useServer();
const { status } = useServerConnection();
const {
  currentTrackId,
  playing,
  unavailableTrackIdSet,
  play,
  retryUnavailableTrack,
} = useLibraryPlayer();
const { savedTracks } = useOfflineTracks();
const {
  loaded: likesLoaded,
  toggle: toggleLike,
  isPending: isLikePending,
} = useLikes();
const savedIds = computed(
  () => new Set(savedTracks.value.map((saved) => saved.track.id)),
);

watch(
  () => props.entries,
  (entries) => {
    rows.value = [...entries];
  },
  { immediate: true },
);

let pendingReorderIds: string[] | null = null;

function entryIdFromElement(element: Element | null) {
  return element?.getAttribute("data-playlist-entry-id") ?? null;
}

function restoreDraggedElement(event: SortableEvent) {
  if (typeof event.oldIndex !== "number") return;
  event.item.parentNode?.removeChild(event.item);
  event.from.insertBefore(
    event.item,
    event.from.children[event.oldIndex] ?? null,
  );
}

function reorderRowsForDrop(event: SortableEvent) {
  const entryId = entryIdFromElement(event.item);
  if (!entryId) return;
  const previousId = entryIdFromElement(event.item.previousElementSibling);
  const nextId = entryIdFromElement(event.item.nextElementSibling);
  const reordered = playlistEntriesAfterDrag(
    rows.value,
    entryId,
    previousId,
    nextId,
  );
  if (!reordered) return;
  pendingReorderIds = reordered.map((entry) => entry.id);
  restoreDraggedElement(event);
  rows.value = reordered;
}

useSortable(list, rows, {
  animation: 150,
  filter: "a, button, input",
  preventOnFilter: false,
  watchElement: true,
  disabled: !props.editable,
  onUpdate: reorderRowsForDrop,
  onEnd: () => {
    const itemIds = pendingReorderIds;
    pendingReorderIds = null;
    if (props.editable && itemIds) emit("reorder", itemIds);
  },
});

function playable(entry: PlaylistEntryResponse): boolean {
  return Boolean(
    entry.media &&
    isTrackPlayable(entry.media, {
      serverLost: status.value === "lost",
      savedTrackIds: savedIds.value,
      unavailableTrackIds: unavailableTrackIdSet.value,
    }),
  );
}

function isCurrent(entry: PlaylistEntryResponse): boolean {
  return Boolean(entry.media && currentTrackId.value === entry.media.id);
}

function toggleEntryPlayback(entry: PlaylistEntryResponse) {
  if (!entry.media) return;
  if (!playable(entry)) {
    retryUnavailableTrack(entry.media);
    return;
  }
  if (isCurrent(entry)) {
    play(entry.media);
    return;
  }
  emit("play", entry.media);
}

function albumForEntry(entry: PlaylistEntryResponse): AlbumSummaryResponse {
  if (entry.media) return albumSummaryFromTrack(entry.media);
  return {
    id: "",
    title: entry.album?.trim() ?? "",
    artist: entry.artist.trim(),
    artists: entry.artists,
    sourceKinds: [],
    coverUrl: entry.coverUrl,
    trackCount: 0,
    durationMs: entry.durationMs,
    releaseYear: null,
    available: entry.available,
    liked: entry.liked,
  };
}
</script>

<template>
  <div
    ref="list"
    role="list"
    :aria-label="t('playlistTracks.label')"
    class="relative rounded-lg border text-sm"
    :style="{
      height: `${virtualizer.totalSize.value}px`,
      overflowAnchor: 'none',
    }"
  >
    <MediaRowContextMenu
      v-for="{ entry, index, start } in virtualRows"
      :key="entry.id"
      :track="entry.media"
      @play="toggleEntryPlayback(entry)"
    >
      <div
        :ref="virtualizer.measureRow"
        role="listitem"
        :aria-posinset="index + 1"
        :aria-setsize="rows.length"
        :data-playlist-entry-id="entry.id"
        :style="virtualizer.virtualRowStyle({ start })"
        class="flex min-w-full items-center gap-3 border-b p-3"
        :class="{ 'border-0': index === rows.length - 1 }"
      >
        <Icon
          v-if="!readOnly"
          :icon="icons.drag"
          aria-hidden="true"
          class="size-4 shrink-0 text-muted-foreground"
          :class="!editable && 'opacity-30'"
        />
        <span
          class="w-6 shrink-0 text-right tabular-nums text-muted-foreground"
        >
          {{ index + 1 }}
        </span>
        <Button
          v-if="entry.media"
          variant="ghost"
          size="icon-sm"
          class="group size-10 shrink-0 overflow-hidden rounded-md p-0"
          :aria-label="
            !playable(entry)
              ? t('trackTable.retryUnavailable')
              : isCurrent(entry) && playing
                ? t('playlistTracks.pause', { title: entry.title })
                : t('playlistTracks.play', { title: entry.title })
          "
          @click="toggleEntryPlayback(entry)"
        >
          <TrackArtwork :track="entry.media" :server-address="address ?? ''">
            <span
              aria-hidden="true"
              class="absolute inset-0 flex items-center justify-center bg-background/70 opacity-0 transition-opacity group-hover:opacity-100"
            >
              <Icon
                :icon="
                  !playable(entry)
                    ? icons.cloudOff
                    : isCurrent(entry) && playing
                      ? icons.pause
                      : icons.play
                "
                class="size-4"
              />
            </span>
          </TrackArtwork>
        </Button>
        <div
          v-else
          class="flex size-10 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground"
        >
          <Icon
            :icon="entry.album ? icons.album : icons.music"
            aria-hidden="true"
            class="size-5"
          />
        </div>
        <div class="min-w-0 flex-1">
          <div class="flex min-w-0 flex-wrap items-center gap-2">
            <ScrollingText
              class="min-w-0"
              :class="!playable(entry) && 'opacity-60'"
              :title="
                playable(entry) ? entry.title : t('trackTable.unavailableTitle')
              "
            >
              {{ entry.title }}
            </ScrollingText>
            <Icon
              v-if="entry.media && !playable(entry)"
              :icon="icons.cloudOff"
              aria-hidden="true"
              class="size-4 shrink-0 text-muted-foreground"
            />
            <Icon
              v-if="isCurrent(entry)"
              :icon="icons.waveform"
              aria-hidden="true"
              class="size-4 shrink-0 text-primary"
            />
            <Badge
              v-if="entry.media && !entry.media.available && playable(entry)"
              variant="secondary"
            >
              {{ t("trackTable.availableOffline") }}
            </Badge>
            <Badge v-else-if="!entry.media" variant="secondary">
              {{ t("playlistTracks.unavailable") }}
            </Badge>
          </div>
          <ScrollingText class="w-full text-xs text-muted-foreground">
            <TrackArtistLinks
              v-if="entry.media?.mediaType === 'music'"
              :artists="trackArtistNames(entry.media)"
            />
            <ArtistLink
              v-else-if="entry.artist.trim()"
              :artist="entry.artist"
            />
          </ScrollingText>
        </div>
        <AlbumLink
          v-if="entry.album"
          :album="albumForEntry(entry)"
          class="hidden w-48 shrink-0 text-muted-foreground hover:text-foreground hover:underline md:block"
        >
          <ScrollingText class="w-full">{{ entry.album }}</ScrollingText>
        </AlbumLink>
        <span
          v-else
          class="hidden w-48 shrink-0 text-muted-foreground md:block"
        >
          <ScrollingText class="w-full">
            {{ entry.album || "—" }}
          </ScrollingText>
        </span>
        <span
          class="w-16 shrink-0 text-right tabular-nums text-muted-foreground"
        >
          {{ formatTrackDuration(entry.durationMs) }}
        </span>
        <LikeButton
          v-if="showTrackLikes !== false && entry.media?.mediaType === 'music'"
          compact
          :liked="entry.liked"
          :label="entry.title"
          :pending="isLikePending({ kind: 'media', mediaId: entry.media.id })"
          :disabled="!likesLoaded || status === 'lost'"
          @toggle="toggleLike({ kind: 'media', mediaId: entry.media!.id })"
        />
        <span v-else class="w-7 shrink-0" />
        <Button
          v-if="!readOnly"
          type="button"
          variant="ghost"
          size="icon-sm"
          :disabled="!editable"
          :aria-label="t('playlistTracks.remove', { title: entry.title })"
          :title="t('playlistTracks.remove', { title: entry.title })"
          @click="emit('remove', entry)"
        >
          <Icon :icon="icons.close" aria-hidden="true" class="size-4" />
        </Button>
      </div>
    </MediaRowContextMenu>
  </div>
</template>
