<script setup lang="ts">
import { useI18n } from "#imports";
import { Icon } from "@iconify/vue/offline";
import type { TrackResponse } from "@peridot/contracts";
import { Badge } from "@peridot/ui/components/ui/badge";
import { Button } from "@peridot/ui/components/ui/button";
import { ScrollingText } from "@peridot/ui/components/ui/scrolling-text";
import { useSortable } from "@vueuse/integrations/useSortable";
import {
  computed,
  nextTick,
  onBeforeUnmount,
  onMounted,
  ref,
  watch,
} from "vue";
import TrackArtwork from "./TrackArtwork.vue";
import TrackArtistLinks from "./TrackArtistLinks.vue";
import { useLibraryPlayer } from "../composables/use-library-player";
import { useOfflineTracks } from "../composables/use-offline-tracks";
import { useServer } from "../composables/use-server";
import { useServerConnection } from "../composables/use-server-connection";
import { icons } from "../lib/icons";
import { trackArtistNames } from "../lib/library";
import { isTrackPlayable } from "../lib/offline-playback";

const open = defineModel<boolean>("open", { required: true });
const { t } = useI18n();
const queueList = ref<HTMLElement | null>(null);
const panel = ref<HTMLElement | null>(null);
const sortableTracks = ref<TrackResponse[]>([]);
const { address } = useServer();
const { status: serverStatus } = useServerConnection();
const { savedTracks } = useOfflineTracks();
const savedTrackIds = computed(
  () => new Set(savedTracks.value.map((saved) => saved.track.id)),
);
const {
  active,
  playing,
  currentTrackId,
  loadQueue,
  queueError,
  queueLoading,
  shuffleEnabled,
  upcomingTracks,
  removeFromQueue,
  reorderQueue,
  play,
  togglePlayback,
} = useLibraryPlayer();

function isUnavailable(track: TrackResponse): boolean {
  return !isTrackPlayable(track, {
    serverLost: serverStatus.value === "lost",
    savedTrackIds: savedTrackIds.value,
  });
}

watch(
  upcomingTracks,
  (tracks) => {
    sortableTracks.value = [...tracks];
  },
  { immediate: true },
);

useSortable(queueList, sortableTracks, {
  animation: 150,
  filter: "a, button, input",
  preventOnFilter: false,
  watchElement: true,
  onEnd: ({ oldIndex, newIndex }) => {
    if (oldIndex === undefined || newIndex === undefined) return;
    const next = [...sortableTracks.value];
    const [moved] = next.splice(oldIndex, 1);
    if (!moved) return;
    next.splice(newIndex, 0, moved);
    sortableTracks.value = next;
    reorderQueue(next.map((track) => track.id));
  },
});

function closeQueue() {
  open.value = false;
  void nextTick(() => {
    document.querySelector<HTMLElement>("[data-queue-toggle]")?.focus();
  });
}

function handleKeydown(event: KeyboardEvent) {
  if (!open.value || event.key !== "Escape") return;
  event.preventDefault();
  closeQueue();
}

watch(open, async (isOpen) => {
  if (!isOpen) return;
  await nextTick();
  panel.value?.focus();
});

onMounted(() => document.addEventListener("keydown", handleKeydown));
onBeforeUnmount(() => document.removeEventListener("keydown", handleKeydown));
</script>

<template>
  <Teleport to="body">
    <template v-if="open">
      <div
        aria-hidden="true"
        class="fixed inset-x-0 top-0 bottom-48 z-20 bg-background/80 md:bottom-28"
        @click="closeQueue"
      />
      <aside
        id="queue-drawer"
        ref="panel"
        role="dialog"
        aria-modal="false"
        aria-labelledby="queue-heading"
        aria-describedby="queue-description"
        tabindex="-1"
        class="fixed top-0 right-0 bottom-48 z-40 flex w-4/5 max-w-lg flex-col border-l bg-card p-4 text-card-foreground shadow-lg outline-none md:bottom-28"
      >
        <div class="flex items-start justify-between gap-4">
          <div class="min-w-0">
            <div class="flex flex-wrap items-center gap-2">
              <h2 id="queue-heading" class="text-lg font-semibold">
                {{ t("queue.title") }}
              </h2>
              <Badge v-if="shuffleEnabled" variant="secondary">
                <Icon :icon="icons.shuffle" aria-hidden="true" />
                {{ t("queue.randomized") }}
              </Badge>
            </div>
            <p id="queue-description" class="text-sm text-muted-foreground">
              {{ t("queue.description") }}
            </p>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            :aria-label="t('player.closeQueue')"
            @click="closeQueue"
          >
            <Icon :icon="icons.close" aria-hidden="true" class="size-5" />
          </Button>
        </div>

        <div class="mt-4 rounded-md border p-3">
          <p class="mb-2 text-xs font-medium text-muted-foreground">
            {{ t("queue.nowPlaying") }}
          </p>
          <div
            v-if="active"
            class="group/track-artwork flex min-w-0 items-center gap-3"
          >
            <TrackArtwork
              :track="active"
              :server-address="address ?? ''"
              :class="isUnavailable(active) && 'opacity-60'"
            >
              <Button
                variant="ghost"
                size="icon-sm"
                class="absolute inset-0 size-full cursor-pointer rounded-md bg-background/70 opacity-0 transition-opacity hover:bg-background/70 hover:text-foreground disabled:cursor-not-allowed dark:hover:bg-background/70 group-hover/track-artwork:opacity-100 group-focus-within/track-artwork:opacity-100"
                :disabled="isUnavailable(active)"
                :aria-label="
                  playing
                    ? t('player.pauseTitle', { title: active.title })
                    : t('player.playTitle', { title: active.title })
                "
                @click="togglePlayback"
              >
                <Icon
                  :icon="playing ? icons.pause : icons.play"
                  aria-hidden="true"
                  class="size-5 text-foreground"
                />
              </Button>
            </TrackArtwork>
            <div class="min-w-0 flex-1">
              <ScrollingText class="w-full text-sm font-medium">
                {{ active.title }}
              </ScrollingText>
              <ScrollingText class="w-full text-xs text-muted-foreground">
                <TrackArtistLinks
                  v-if="active.mediaType === 'music'"
                  :artists="trackArtistNames(active)"
                />
                <template v-else>{{ active.artist }}</template>
              </ScrollingText>
            </div>
          </div>
          <p v-else class="text-sm text-muted-foreground">
            {{ t("queue.nothingPlaying") }}
          </p>
        </div>

        <div class="mt-4 flex items-center justify-between gap-4">
          <h3 id="queue-upcoming-heading" class="text-sm font-semibold">
            {{
              shuffleEnabled ? t("queue.queueOrder") : t("queue.nextInQueue")
            }}
          </h3>
          <span class="text-xs text-muted-foreground">
            {{
              t(
                "count.track",
                { count: upcomingTracks.length },
                upcomingTracks.length,
              )
            }}
          </span>
        </div>

        <p
          v-if="queueLoading && !queueError"
          role="status"
          class="mt-3 text-sm text-muted-foreground"
        >
          {{ t("queue.loading") }}
        </p>
        <div
          v-else-if="queueError"
          role="alert"
          class="mt-3 flex items-center justify-between gap-3 text-sm text-destructive"
        >
          <p>{{ queueError }}</p>
          <Button variant="outline" size="sm" @click="loadQueue(true)">
            {{ t("common.tryAgain") }}
          </Button>
        </div>
        <div
          v-else-if="sortableTracks.length"
          class="mt-3 min-h-0 flex-1 overflow-y-auto"
        >
          <ol
            ref="queueList"
            aria-labelledby="queue-upcoming-heading"
            class="space-y-2"
          >
            <li
              v-for="track in sortableTracks"
              :key="track.id"
              class="group/track-artwork flex cursor-grab items-center gap-2 rounded-md border p-2 active:cursor-grabbing"
              :class="isUnavailable(track) && 'text-muted-foreground'"
            >
              <span
                aria-hidden="true"
                class="cursor-grab rounded-md p-1 text-muted-foreground active:cursor-grabbing"
              >
                <Icon :icon="icons.drag" aria-hidden="true" class="size-4" />
              </span>
              <TrackArtwork
                :track="track"
                :server-address="address ?? ''"
                :class="isUnavailable(track) && 'opacity-60'"
              >
                <Button
                  variant="ghost"
                  size="icon-sm"
                  class="absolute inset-0 size-full cursor-pointer rounded-md bg-background/70 opacity-0 transition-opacity hover:bg-background/70 hover:text-foreground disabled:cursor-not-allowed dark:hover:bg-background/70 group-hover/track-artwork:opacity-100 group-focus-within/track-artwork:opacity-100"
                  :disabled="isUnavailable(track)"
                  :aria-label="t('queue.playFrom', { title: track.title })"
                  @click.stop="play(track)"
                >
                  <Icon
                    :icon="icons.play"
                    aria-hidden="true"
                    class="size-5 text-foreground"
                  />
                </Button>
              </TrackArtwork>
              <div class="min-w-0 flex-1">
                <ScrollingText class="w-full text-sm font-medium">
                  {{ track.title }}
                </ScrollingText>
                <ScrollingText class="w-full text-xs text-muted-foreground">
                  <TrackArtistLinks
                    v-if="track.mediaType === 'music'"
                    :artists="trackArtistNames(track)"
                  />
                  <template v-else>{{ track.artist }}</template>
                </ScrollingText>
              </div>
              <Button
                variant="ghost"
                size="icon"
                :aria-label="t('queue.remove', { title: track.title })"
                :disabled="track.id === currentTrackId"
                @click="removeFromQueue(track.id)"
              >
                <Icon :icon="icons.close" aria-hidden="true" class="size-5" />
              </Button>
            </li>
          </ol>
        </div>
        <p v-else class="mt-3 text-sm text-muted-foreground">
          {{ t("queue.empty") }}
        </p>
      </aside>
    </template>
  </Teleport>
</template>
