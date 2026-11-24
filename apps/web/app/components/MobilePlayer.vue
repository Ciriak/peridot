<script setup lang="ts">
import { useI18n, useRoute, useRouter } from "#imports";
import { Icon } from "@iconify/vue/offline";
import { Button } from "@peridot/ui/components/ui/button";
import { ScrollingText } from "@peridot/ui/components/ui/scrolling-text";
import { Slider } from "@peridot/ui/components/ui/slider";
import {
  DialogContent,
  DialogDescription,
  DialogOverlay,
  DialogPortal,
  DialogRoot,
  DialogTitle,
  DialogTrigger,
} from "reka-ui";
import { computed, nextTick, onBeforeUnmount, ref, watch } from "vue";
import FadeInImage from "./FadeInImage.vue";
import LikeButton from "./LikeButton.vue";
import MobilePlayerTrackPanel from "./MobilePlayerTrackPanel.vue";
import TrackArtistLinks from "./TrackArtistLinks.vue";
import { useCachedArtwork } from "../composables/use-cached-artwork";
import { useLikes } from "../composables/use-likes";
import { useLibraryPlayer } from "../composables/use-library-player";
import { useServer } from "../composables/use-server";
import { useSwipePlayer } from "../composables/use-swipe-player";
import { icons } from "../lib/icons";
import { trackArtistNames, trackCoverUrl } from "../lib/library";
import {
  isMobilePlayerRoute,
  withMobilePlayerRoute,
  withoutMobilePlayerRoute,
} from "../lib/mobile-player-route";

const emit = defineEmits<{ openQueue: [] }>();
const { t } = useI18n();
const route = useRoute();
const router = useRouter();
const { address } = useServer();
const {
  likedTrackIds,
  loaded: likesLoaded,
  toggle: toggleLike,
  isPending: isLikePending,
} = useLikes();
const {
  playing,
  repeatMode,
  currentTrackId,
  elapsed,
  loading,
  error,
  active,
  queueTracks,
  shuffleEnabled,
  currentTrackPlayable,
  canGoNext,
  nextTrackPreview,
  previousTrackPreview,
  durationSeconds,
  next,
  prepareNextTrackPreview,
  previous,
  toggleRandomization,
  cycleRepeatMode,
  togglePlayback,
  seek,
} = useLibraryPlayer();
const playerGestureSurface = ref<HTMLElement | null>(null);
const playerScrollArea = ref<HTMLElement | null>(null);
const loadingRayAtRight = ref(false);
let loadingRayFrame: number | undefined;
let loadingRayTimeout: ReturnType<typeof setTimeout> | undefined;

const clock = (seconds: number) =>
  `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
const currentTrackLikeTarget = computed(() =>
  currentTrackId.value
    ? ({ kind: "media", mediaId: currentTrackId.value } as const)
    : null,
);
const currentCoverUrl = computed(() =>
  trackCoverUrl(address.value ?? "", active.value?.coverUrl ?? null),
);
const {
  artworkUrl: currentCoverImageUrl,
  failed: coverFailed,
  fromCache: coverFromCache,
} = useCachedArtwork(currentCoverUrl);
const placeholderIcon = computed(() =>
  active.value?.mediaType === "audiobook"
    ? icons.book
    : active.value?.mediaType === "podcast"
      ? icons.podcast
      : active.value?.albumId
        ? icons.album
        : icons.music,
);
const open = computed<boolean>({
  get: () => isMobilePlayerRoute(route.query),
  set: (isOpen) => {
    if (isOpen) {
      if (!isMobilePlayerRoute(route.query)) {
        void router.push({ query: withMobilePlayerRoute(route.query) });
      }
      return;
    }
    closeFullscreen();
  },
});

function toggleCurrentTrackLike() {
  if (currentTrackId.value)
    void toggleLike({ kind: "media", mediaId: currentTrackId.value });
}

function playActiveTrack() {
  if (active.value && !playing.value) togglePlayback();
}

function closeFullscreen() {
  if (!isMobilePlayerRoute(route.query)) return;
  const historyState = window.history.state as {
    back?: string | null;
  } | null;
  if (historyState?.back) {
    router.back();
    return;
  }
  void router.replace({ query: withoutMobilePlayerRoute(route.query) });
}

function openQueue() {
  closeFullscreen();
  emit("openQueue");
}

function stopLoadingRay() {
  if (loadingRayFrame !== undefined) {
    cancelAnimationFrame(loadingRayFrame);
    loadingRayFrame = undefined;
  }
  if (loadingRayTimeout !== undefined) {
    clearTimeout(loadingRayTimeout);
    loadingRayTimeout = undefined;
  }
  loadingRayAtRight.value = false;
}

function startLoadingRay() {
  if (!import.meta.client) return;
  stopLoadingRay();
  void nextTick(() => {
    loadingRayFrame = requestAnimationFrame(() => {
      loadingRayFrame = undefined;
      if (!loading.value) return;
      loadingRayAtRight.value = true;
      const advance = () => {
        loadingRayTimeout = setTimeout(() => {
          if (!loading.value) return;
          loadingRayAtRight.value = !loadingRayAtRight.value;
          advance();
        }, 1500);
      };
      advance();
    });
  });
}

watch(
  loading,
  (isLoading) => {
    if (isLoading) startLoadingRay();
    else stopLoadingRay();
  },
  { immediate: true },
);

onBeforeUnmount(stopLoadingRay);

const {
  surfaceStyle: playerSurfaceStyle,
  overlayStyle: playerOverlayStyle,
  carouselStyle: playerCarouselStyle,
  surfaceDragging: playerSurfaceDragging,
  carouselDragging: playerCarouselDragging,
  surfaceAnimating: playerSurfaceAnimating,
  carouselAnimating: playerCarouselAnimating,
} = useSwipePlayer({
  target: playerGestureSurface,
  scrollArea: playerScrollArea,
  open,
  active,
  canGoNext,
  nextTrack: nextTrackPreview,
  previousTrack: previousTrackPreview,
  prepareNextTrack: prepareNextTrackPreview,
  next: () => next(),
  previous,
  close: closeFullscreen,
});
</script>

<template>
  <DialogRoot v-model:open="open">
    <div data-mobile-player class="relative flex h-full w-full md:hidden">
      <Slider
        :model-value="[elapsed]"
        :min="0"
        :max="Math.max(durationSeconds, 1)"
        :step="1"
        :disabled="!currentTrackPlayable || durationSeconds <= 0"
        :aria-busy="loading"
        class="absolute inset-x-0 top-0 z-10 h-5 items-start"
        track-class="rounded-none"
        hide-thumb
        :thumb-label="t('player.position')"
        @update:model-value="seek($event?.[0] ?? 0)"
      />
      <div class="flex min-h-0 flex-1">
        <div
          class="flex h-full w-0 min-w-0 max-w-full flex-1 items-center gap-3 overflow-hidden px-3"
        >
          <DialogTrigger as-child>
            <Button
              variant="ghost"
              size="icon-lg"
              class="relative size-14 shrink-0 overflow-hidden rounded-md p-0 transition-none hover:bg-transparent hover:text-current active:bg-transparent active:text-current dark:hover:bg-transparent dark:active:bg-transparent"
              :aria-label="t('player.openFullscreen')"
              aria-haspopup="dialog"
            >
              <span
                aria-hidden="true"
                class="relative flex size-14 shrink-0 items-center justify-center overflow-hidden rounded-md bg-muted text-muted-foreground"
                :class="active && !currentTrackPlayable && 'opacity-60'"
              >
                <Icon
                  :icon="placeholderIcon"
                  aria-hidden="true"
                  class="size-7"
                />
                <FadeInImage
                  v-if="currentCoverImageUrl && !coverFailed"
                  :key="currentCoverImageUrl"
                  :src="currentCoverImageUrl"
                  :fade-in="!coverFromCache"
                  loading="eager"
                  class="absolute inset-0"
                  @error="coverFailed = true"
                />
              </span>
            </Button>
          </DialogTrigger>
          <span class="w-0 min-w-0 max-w-full flex-1 overflow-hidden">
            <DialogTrigger as-child>
              <Button
                variant="ghost"
                class="h-auto w-full justify-start p-0 text-left transition-none hover:bg-transparent hover:text-current active:bg-transparent active:text-current dark:hover:bg-transparent dark:active:bg-transparent"
                :aria-label="t('player.openFullscreen')"
                aria-haspopup="dialog"
              >
                <ScrollingText
                  v-if="active"
                  :key="`${active.id}:${active.title}`"
                  mode="always"
                  class="w-full max-w-full text-sm font-medium"
                  :title="
                    currentTrackPlayable
                      ? undefined
                      : t('trackTable.unavailableTitle')
                  "
                >
                  {{ active.title }}
                </ScrollingText>
                <span v-else class="block truncate text-sm font-medium">
                  {{ t("player.noTrack") }}
                </span>
              </Button>
            </DialogTrigger>
            <ScrollingText
              v-if="active"
              mode="always"
              class="w-full max-w-full text-xs text-muted-foreground"
            >
              <TrackArtistLinks
                v-if="active.mediaType === 'music'"
                :artists="trackArtistNames(active)"
              />
              <template v-else>{{ active.artist }}</template>
            </ScrollingText>
            <span v-else class="block truncate text-xs text-muted-foreground">
              {{ t("player.scanLibrary") }}
            </span>
          </span>
        </div>

        <div class="flex shrink-0 items-center gap-2 pr-3">
          <Button
            variant="ghost"
            size="icon-lg"
            class="size-12 transition-none hover:bg-transparent hover:text-current active:bg-transparent active:text-current dark:hover:bg-transparent dark:active:bg-transparent"
            :aria-label="t('player.next')"
            :disabled="!canGoNext"
            @click="next()"
          >
            <Icon :icon="icons.next" aria-hidden="true" class="size-6" />
          </Button>
          <LikeButton
            class="-ml-1.5 transition-none hover:bg-transparent hover:text-current active:bg-transparent active:text-current dark:hover:bg-transparent dark:active:bg-transparent"
            :liked="
              currentTrackLikeTarget
                ? likedTrackIds.includes(currentTrackLikeTarget.mediaId)
                : false
            "
            :label="active?.title ?? t('player.currentTrack')"
            :pending="
              currentTrackLikeTarget
                ? isLikePending(currentTrackLikeTarget)
                : false
            "
            :disabled="!currentTrackId || !likesLoaded"
            @toggle="toggleCurrentTrackLike"
          />
          <Button
            size="icon-lg"
            class="size-12 rounded-full transition-none hover:bg-primary active:bg-primary"
            :disabled="!currentTrackPlayable"
            :aria-label="playing ? t('player.pause') : t('player.play')"
            :aria-busy="loading"
            @click="togglePlayback"
          >
            <Icon
              :icon="playing ? icons.pause : icons.play"
              aria-hidden="true"
              class="size-6"
            />
          </Button>
        </div>
      </div>
    </div>

    <DialogPortal>
      <DialogOverlay
        class="fixed inset-0 z-40 bg-background/90"
        :class="
          playerSurfaceDragging
            ? 'transition-none'
            : 'transition-opacity duration-200 ease-out motion-reduce:transition-none'
        "
        :style="playerOverlayStyle"
      />
      <DialogContent
        data-mobile-player-dialog
        class="fixed inset-0 z-40 isolate flex h-dvh flex-col overflow-hidden bg-background text-foreground outline-none"
        :class="
          playerSurfaceDragging
            ? 'transition-none'
            : playerSurfaceAnimating
              ? 'transition-transform duration-200 ease-out motion-reduce:transition-none'
              : undefined
        "
        :style="playerSurfaceStyle"
      >
        <div
          ref="playerGestureSurface"
          class="relative flex h-full min-h-0 touch-pan-y flex-col overflow-hidden overscroll-x-none"
        >
          <div
            v-if="loading"
            aria-hidden="true"
            class="pointer-events-none absolute inset-x-0 top-0 z-30 h-1 overflow-hidden"
          >
            <div class="hidden size-full bg-primary/40 motion-reduce:block" />
            <div
              class="block size-full bg-linear-to-r from-transparent via-primary to-transparent transition-transform duration-1000 ease-in-out motion-reduce:hidden"
              :class="
                loadingRayAtRight ? 'translate-x-full' : '-translate-x-full'
              "
            />
          </div>
          <div
            aria-hidden="true"
            class="pointer-events-none absolute inset-0 -z-10 overflow-hidden"
          >
            <div class="absolute inset-0 opacity-30">
              <FadeInImage
                v-if="currentCoverImageUrl && !coverFailed"
                :key="currentCoverImageUrl"
                :src="currentCoverImageUrl"
                :fade-in="!coverFromCache"
                loading="eager"
                class="scale-125 blur-3xl"
              />
            </div>
            <div
              class="absolute inset-0 bg-linear-to-b from-background/30 via-background/80 to-background"
            />
          </div>

          <header
            class="flex min-h-16 shrink-0 items-center gap-3 border-b px-4"
          >
            <Button
              type="button"
              variant="ghost"
              size="icon-lg"
              class="size-12"
              :aria-label="t('player.closeFullscreen')"
              @click="open = false"
            >
              <Icon :icon="icons.caretDown" aria-hidden="true" class="size-7" />
            </Button>
            <div class="min-w-0">
              <DialogTitle class="text-base font-semibold">
                {{ t("player.nowPlaying") }}
              </DialogTitle>
              <DialogDescription class="sr-only">
                {{ t("player.fullscreenDescription") }}
              </DialogDescription>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon-lg"
              class="ml-auto size-12"
              :aria-label="t('player.openQueue')"
              @click="openQueue"
            >
              <Icon :icon="icons.queue" aria-hidden="true" class="size-7" />
            </Button>
          </header>

          <main
            ref="playerScrollArea"
            class="min-h-0 flex-1 overflow-y-auto px-4 py-6 sm:px-6"
          >
            <div
              class="mx-auto flex min-h-full max-w-xl flex-col justify-center gap-6"
            >
              <div data-mobile-player-carousel class="overflow-hidden">
                <div
                  class="flex w-full"
                  :class="
                    playerCarouselDragging
                      ? 'transition-none'
                      : playerCarouselAnimating
                        ? 'transition-transform duration-200 ease-out motion-reduce:transition-none'
                        : undefined
                  "
                  :style="playerCarouselStyle"
                >
                  <div
                    class="w-full shrink-0 overflow-hidden transition-opacity duration-200 motion-reduce:transition-none"
                    :class="
                      playerCarouselDragging || playerCarouselAnimating
                        ? 'opacity-100'
                        : 'opacity-0'
                    "
                    inert
                    aria-hidden="true"
                  >
                    <MobilePlayerTrackPanel
                      :track="previousTrackPreview"
                      :server-address="address ?? ''"
                    />
                  </div>
                  <div class="w-full shrink-0 overflow-hidden">
                    <MobilePlayerTrackPanel
                      :track="active"
                      :server-address="address ?? ''"
                      interactive
                      :liked="
                        currentTrackLikeTarget
                          ? likedTrackIds.includes(
                              currentTrackLikeTarget.mediaId,
                            )
                          : false
                      "
                      :like-pending="
                        currentTrackLikeTarget
                          ? isLikePending(currentTrackLikeTarget)
                          : false
                      "
                      :like-disabled="!currentTrackId || !likesLoaded"
                      @like="toggleCurrentTrackLike"
                      @play="playActiveTrack"
                    />
                  </div>
                  <div
                    class="w-full shrink-0 overflow-hidden transition-opacity duration-200 motion-reduce:transition-none"
                    :class="
                      playerCarouselDragging || playerCarouselAnimating
                        ? 'opacity-100'
                        : 'opacity-0'
                    "
                    inert
                    aria-hidden="true"
                  >
                    <MobilePlayerTrackPanel
                      :track="nextTrackPreview"
                      :server-address="address ?? ''"
                    />
                  </div>
                </div>
              </div>

              <p
                v-if="error"
                role="alert"
                class="-mt-2 text-center text-sm text-destructive"
              >
                {{ error }}
              </p>
              <div
                class="flex items-center gap-3 text-xs tabular-nums text-muted-foreground"
              >
                <span>{{ clock(elapsed) }}</span>
                <Slider
                  :model-value="[elapsed]"
                  :min="0"
                  :max="Math.max(durationSeconds, 1)"
                  :step="1"
                  :disabled="!currentTrackPlayable || durationSeconds <= 0"
                  :aria-busy="loading"
                  class="min-h-11 flex-1"
                  :thumb-label="t('player.position')"
                  @update:model-value="seek($event?.[0] ?? 0)"
                />
                <span>{{ clock(durationSeconds) }}</span>
              </div>

              <div class="flex items-center justify-center gap-2 sm:gap-4">
                <Button
                  variant="ghost"
                  size="icon-lg"
                  class="group size-12"
                  :aria-label="
                    shuffleEnabled
                      ? t('player.disableShuffle')
                      : t('player.enableShuffle')
                  "
                  :aria-pressed="shuffleEnabled"
                  :disabled="
                    !shuffleEnabled && (!active || queueTracks.length < 2)
                  "
                  @click="toggleRandomization"
                >
                  <Icon
                    :icon="icons.shuffle"
                    aria-hidden="true"
                    class="size-7 transition-colors"
                    :class="
                      shuffleEnabled
                        ? 'text-primary group-hover:text-primary group-active:text-primary'
                        : 'text-muted-foreground'
                    "
                  />
                </Button>
                <Button
                  variant="ghost"
                  size="icon-lg"
                  class="group size-12"
                  :aria-label="t('player.previous')"
                  :disabled="!active"
                  @click="previous"
                >
                  <Icon
                    :icon="icons.previous"
                    aria-hidden="true"
                    class="size-7 transition-colors group-hover:text-primary group-active:text-primary"
                  />
                </Button>
                <Button
                  size="icon-lg"
                  class="size-16 rounded-full"
                  :disabled="!currentTrackPlayable"
                  :aria-label="playing ? t('player.pause') : t('player.play')"
                  :aria-busy="loading"
                  @click="togglePlayback"
                >
                  <Icon
                    :icon="playing ? icons.pause : icons.play"
                    aria-hidden="true"
                    class="size-8"
                  />
                </Button>
                <Button
                  variant="ghost"
                  size="icon-lg"
                  class="group size-12"
                  :aria-label="t('player.next')"
                  :disabled="!canGoNext"
                  @click="next()"
                >
                  <Icon
                    :icon="icons.next"
                    aria-hidden="true"
                    class="size-7 transition-colors group-hover:text-primary group-active:text-primary"
                  />
                </Button>
                <Button
                  variant="ghost"
                  size="icon-lg"
                  class="group relative size-12"
                  :aria-label="
                    repeatMode === 'off'
                      ? t('player.enableRepeat')
                      : repeatMode === 'all'
                        ? t('player.repeatOne')
                        : t('player.disableRepeat')
                  "
                  :aria-pressed="repeatMode !== 'off'"
                  :disabled="!active"
                  @click="cycleRepeatMode"
                >
                  <Icon
                    :icon="
                      repeatMode === 'one' ? icons.repeatOne : icons.repeat
                    "
                    aria-hidden="true"
                    class="size-7 transition-colors"
                    :class="
                      repeatMode === 'off'
                        ? 'text-muted-foreground'
                        : 'text-primary group-hover:text-primary group-active:text-primary'
                    "
                  />
                  <span
                    v-if="repeatMode === 'one'"
                    aria-hidden="true"
                    class="absolute right-1 top-1 text-xs font-semibold leading-none text-primary"
                  >
                    1
                  </span>
                </Button>
              </div>
            </div>
          </main>
        </div>
      </DialogContent>
    </DialogPortal>
  </DialogRoot>
</template>
