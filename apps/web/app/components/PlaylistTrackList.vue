<script setup lang="ts">
import { useI18n } from "#imports";
import type { PlaylistEntryResponse, TrackResponse } from "@peridot/contracts";
import { Icon } from "@iconify/vue/offline";
import { Badge } from "@peridot/ui/components/ui/badge";
import { Button } from "@peridot/ui/components/ui/button";
import { ScrollingText } from "@peridot/ui/components/ui/scrolling-text";
import { useSortable } from "@vueuse/integrations/useSortable";
import { computed, ref, watch } from "vue";
import { useLikes } from "../composables/use-likes";
import { useLibraryPlayer } from "../composables/use-library-player";
import { useOfflineTracks } from "../composables/use-offline-tracks";
import { useServer } from "../composables/use-server";
import { useServerConnection } from "../composables/use-server-connection";
import { icons } from "../lib/icons";
import {
  formatTrackDuration,
  trackAlbumRoute,
  trackArtistNames,
} from "../lib/library";
import { isTrackPlayable } from "../lib/offline-playback";
import LikeButton from "./LikeButton.vue";
import TrackArtistLinks from "./TrackArtistLinks.vue";
import TrackArtwork from "./TrackArtwork.vue";
import TrackContextMenu from "./TrackContextMenu.vue";

const props = defineProps<{
  entries: readonly PlaylistEntryResponse[];
  editable: boolean;
}>();
const emit = defineEmits<{
  reorder: [itemIds: string[]];
  remove: [entry: PlaylistEntryResponse];
  play: [track: TrackResponse];
}>();
const { t } = useI18n();
const list = ref<HTMLElement | null>(null);
const rows = ref<PlaylistEntryResponse[]>([]);
const { address } = useServer();
const { status } = useServerConnection();
const { currentTrackId, playing, play } = useLibraryPlayer();
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

useSortable(list, rows, {
  animation: 150,
  filter: "a, button, input",
  preventOnFilter: false,
  watchElement: true,
  disabled: !props.editable,
  onEnd: () => {
    if (!props.editable) {
      rows.value = [...props.entries];
      return;
    }
    emit(
      "reorder",
      rows.value.map((entry) => entry.id),
    );
  },
});

function playable(entry: PlaylistEntryResponse): boolean {
  return Boolean(
    entry.track &&
    isTrackPlayable(entry.track, {
      serverLost: status.value === "lost",
      savedTrackIds: savedIds.value,
    }),
  );
}

function isCurrent(entry: PlaylistEntryResponse): boolean {
  return Boolean(entry.track && currentTrackId.value === entry.track.id);
}

function toggleEntryPlayback(entry: PlaylistEntryResponse) {
  if (!entry.track || !playable(entry)) return;
  if (isCurrent(entry)) {
    play(entry.track);
    return;
  }
  emit("play", entry.track);
}
</script>

<template>
  <div
    ref="list"
    role="list"
    :aria-label="t('playlistTracks.label')"
    class="rounded-lg border text-sm"
  >
    <div
      v-for="(entry, index) in rows"
      :key="entry.id"
      role="listitem"
      class="flex min-w-full items-center gap-3 border-b p-3 last:border-b-0"
    >
      <Icon
        :icon="icons.drag"
        aria-hidden="true"
        class="size-4 shrink-0 text-muted-foreground"
        :class="!editable && 'opacity-30'"
      />
      <span class="w-6 shrink-0 text-right tabular-nums text-muted-foreground">
        {{ index + 1 }}
      </span>
      <TrackContextMenu
        v-if="entry.track"
        :track="entry.track"
        @play="toggleEntryPlayback(entry)"
      >
        <Button
          variant="ghost"
          size="icon-sm"
          class="group size-10 shrink-0 overflow-hidden rounded-md p-0"
          :aria-label="
            isCurrent(entry) && playing
              ? t('playlistTracks.pause', { title: entry.title })
              : t('playlistTracks.play', { title: entry.title })
          "
          :disabled="!playable(entry)"
          @click="toggleEntryPlayback(entry)"
        >
          <TrackArtwork :track="entry.track" :server-address="address ?? ''">
            <span
              aria-hidden="true"
              class="absolute inset-0 flex items-center justify-center bg-background/70 opacity-0 transition-opacity group-hover:opacity-100"
            >
              <Icon
                :icon="isCurrent(entry) && playing ? icons.pause : icons.play"
                class="size-4"
              />
            </span>
          </TrackArtwork>
        </Button>
      </TrackContextMenu>
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
            :title="entry.title"
          >
            {{ entry.title }}
          </ScrollingText>
          <Icon
            v-if="isCurrent(entry)"
            :icon="icons.waveform"
            aria-hidden="true"
            class="size-4 shrink-0 text-primary"
          />
          <Badge
            v-if="entry.track && !entry.track.available"
            variant="secondary"
          >
            {{
              playable(entry)
                ? t("trackTable.availableOffline")
                : t("playlistTracks.unavailable")
            }}
          </Badge>
          <Badge v-else-if="!playable(entry)" variant="secondary">
            {{ t("playlistTracks.unavailable") }}
          </Badge>
        </div>
        <ScrollingText class="w-full text-xs text-muted-foreground">
          <TrackArtistLinks
            v-if="entry.track?.mediaType === 'music'"
            :artists="trackArtistNames(entry.track)"
          />
          <span v-else>{{ entry.artist }}</span>
        </ScrollingText>
      </div>
      <NuxtLink
        v-if="entry.album && entry.track"
        :to="trackAlbumRoute(entry.track)"
        class="hidden w-48 shrink-0 text-muted-foreground hover:text-foreground hover:underline md:block"
      >
        <ScrollingText class="w-full">{{ entry.album }}</ScrollingText>
      </NuxtLink>
      <span v-else class="hidden w-48 shrink-0 text-muted-foreground md:block">
        <ScrollingText class="w-full">
          {{ entry.album || "—" }}
        </ScrollingText>
      </span>
      <span class="w-16 shrink-0 text-right tabular-nums text-muted-foreground">
        {{ formatTrackDuration(entry.durationMs) }}
      </span>
      <LikeButton
        v-if="entry.track?.mediaType === 'music'"
        compact
        :liked="entry.liked"
        :label="entry.title"
        :pending="isLikePending({ kind: 'track', trackId: entry.track.id })"
        :disabled="!likesLoaded || status === 'lost'"
        @toggle="toggleLike({ kind: 'track', trackId: entry.track!.id })"
      />
      <span v-else class="w-7 shrink-0" />
      <Button
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
  </div>
</template>
