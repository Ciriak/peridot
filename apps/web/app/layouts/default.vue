<script setup lang="ts">
import { useI18n, useRoute, useRouter, useState } from "#imports";
import { Icon } from "@iconify/vue/offline";
import logo from "@peridot/ui/assets/brand/logo.svg";
import logoNop from "@peridot/ui/assets/brand/logo-nop.png?inline";
import { Button } from "@peridot/ui/components/ui/button";
import { Input } from "@peridot/ui/components/ui/input";
import { Slider } from "@peridot/ui/components/ui/slider";
import {
  computed,
  nextTick,
  onBeforeUnmount,
  onMounted,
  ref,
  watch,
} from "vue";
import LikeButton from "../components/LikeButton.vue";
import QueueDrawer from "../components/QueueDrawer.vue";
import SidebarQuickPicks from "../components/SidebarQuickPicks.vue";
import TaskProgressIndicator from "../components/TaskProgressIndicator.vue";
import { useCachedArtwork } from "../composables/use-cached-artwork";
import { useLikes } from "../composables/use-likes";
import { useLibraryPlayer } from "../composables/use-library-player";
import { useServer } from "../composables/use-server";
import { useSession } from "../composables/use-session";
import { useUser } from "../composables/use-user";
import { gravatarUrl } from "../lib/gravatar";
import { icons } from "../lib/icons";
import {
  trackAlbumTitleRoute,
  trackArtistNames,
  trackCoverUrl,
} from "../lib/library";

const route = useRoute();
const router = useRouter();
const { t } = useI18n();
const searchQuery = useState("search-query", () => "");
const searchInput = ref<{ $el?: HTMLInputElement } | null>(null);
const mobileNavigation = ref(false);
const queueOpen = ref(false);
const loadingRayAtRight = ref(false);
let loadingRayFrame: number | undefined;
let loadingRayTimeout: ReturnType<typeof setTimeout> | undefined;
const { address } = useServer();
const { token } = useSession();
const { user } = useUser();
const avatarFailed = ref(false);
const avatarSrc = computed(() =>
  avatarFailed.value || !user.value?.email
    ? logo
    : gravatarUrl(user.value.email),
);
const {
  likedTrackIds,
  loaded: likesLoaded,
  load: loadLikes,
  clear: clearLikes,
  toggle: toggleLike,
  isPending: isLikePending,
} = useLikes();
const {
  playing,
  repeatMode,
  currentTrackId,
  elapsed,
  volume,
  loading,
  error,
  active,
  queueTracks,
  shuffleEnabled,
  currentTrackPlayable,
  canGoNext,
  durationSeconds,
  next,
  previous,
  toggleRandomization,
  cycleRepeatMode,
  togglePlayback,
  seek,
  setVolume,
} = useLibraryPlayer();
const navigation = [
  { labelKey: "navigation.home", to: "/", icon: icons.home },
  { labelKey: "navigation.library", to: "/library", icon: icons.library },
  { labelKey: "navigation.albums", to: "/albums", icon: icons.music },
  { labelKey: "navigation.artists", to: "/artists", icon: icons.user },
  { labelKey: "navigation.likedSongs", to: "/liked", icon: icons.heart },
  {
    labelKey: "navigation.playlists",
    to: "/playlists",
    icon: icons.playlist,
  },
];
const currentPath = computed(() => route.path);
const isNavigationActive = (target: string) =>
  target === "/"
    ? currentPath.value === "/"
    : currentPath.value === target ||
      currentPath.value.startsWith(`${target}/`);
const clock = (seconds: number) =>
  `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
const likedTrackCount = computed(() => likedTrackIds.value.length);
const currentTrackLikeTarget = computed(() =>
  currentTrackId.value
    ? ({ kind: "track", trackId: currentTrackId.value } as const)
    : null,
);
const currentCoverUrl = computed(() =>
  trackCoverUrl(address.value ?? "", active.value?.coverUrl ?? null),
);
const { artworkUrl: currentCoverImageUrl, failed: coverFailed } =
  useCachedArtwork(currentCoverUrl);
const currentTrackTitleRoute = computed(() =>
  active.value ? trackAlbumTitleRoute(active.value) : null,
);

function toggleCurrentTrackLike() {
  if (currentTrackId.value)
    void toggleLike({ kind: "track", trackId: currentTrackId.value });
}

async function openSearch() {
  if (currentPath.value !== "/search") await router.push("/search");
  await nextTick();
  searchInput.value?.$el?.focus();
}

watch(currentPath, (path) => {
  mobileNavigation.value = false;
  if (path !== "/search") {
    searchQuery.value = "";
  } else {
    void nextTick(() => searchInput.value?.$el?.focus());
  }
});

watch([address, token, () => user.value?.id], () => {
  clearLikes();
  void loadLikes();
});

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

onMounted(() => {
  void loadLikes();
});

onBeforeUnmount(stopLoadingRay);
</script>

<template>
  <div
    class="flex h-dvh flex-col overflow-hidden bg-background text-foreground"
  >
    <a href="#main-content" class="sr-only focus:not-sr-only focus:p-4">{{
      t("navigation.skipToContent")
    }}</a>
    <div class="flex min-h-0 flex-1 pb-48 md:pb-28">
      <aside
        id="sidebar"
        :aria-label="t('navigation.sidebar')"
        :class="[
          'w-56 shrink-0 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground',
          mobileNavigation
            ? 'absolute inset-y-0 left-0 z-20 flex pb-48 md:static md:pb-0'
            : 'hidden md:flex',
        ]"
      >
        <div
          class="flex h-16 shrink-0 items-center justify-between border-b border-sidebar-border px-4"
        >
          <Button
            as-child
            variant="ghost"
            class="flex-1 justify-start text-lg font-semibold"
            ><NuxtLink to="/"
              ><img :src="logoNop" alt="" class="size-6 p-0.5" />{{
                t("app.name")
              }}</NuxtLink
            ></Button
          >
          <Button
            variant="ghost"
            size="icon-sm"
            class="md:hidden"
            :aria-label="t('navigation.close')"
            @click="mobileNavigation = false"
            ><Icon :icon="icons.close" aria-hidden="true"
          /></Button>
        </div>
        <nav :aria-label="t('navigation.main')" class="space-y-1 p-3">
          <Button
            v-for="item in navigation"
            :key="item.to"
            as-child
            variant="ghost"
            :class="[
              'w-full justify-start',
              isNavigationActive(item.to) &&
                'bg-sidebar-accent text-sidebar-accent-foreground',
            ]"
          >
            <NuxtLink
              :to="item.to"
              :aria-current="isNavigationActive(item.to) ? 'page' : undefined"
            >
              <Icon :icon="item.icon" aria-hidden="true" class="size-5" />{{
                t(item.labelKey)
              }}
              <span
                v-if="item.to === '/liked'"
                class="ml-auto text-xs text-muted-foreground"
                >{{ likedTrackCount }}</span
              >
            </NuxtLink>
          </Button>
        </nav>
        <div
          class="min-h-0 flex-1 overflow-y-auto border-t border-sidebar-border p-4"
        >
          <SidebarQuickPicks />
        </div>
      </aside>

      <div class="flex min-w-0 flex-1 flex-col">
        <header
          class="flex min-h-16 shrink-0 items-center gap-3 border-b px-4 md:px-6"
        >
          <Button
            variant="outline"
            size="icon"
            class="md:hidden"
            :aria-label="t('navigation.toggle')"
            aria-controls="sidebar"
            :aria-expanded="mobileNavigation"
            @click="mobileNavigation = !mobileNavigation"
            ><Icon :icon="icons.menu" aria-hidden="true"
          /></Button>
          <div class="relative min-w-0 flex-1 md:max-w-sm">
            <Icon
              :icon="icons.search"
              aria-hidden="true"
              class="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
            />
            <Input
              ref="searchInput"
              v-model="searchQuery"
              type="search"
              :aria-label="t('navigation.searchPlaceholder')"
              :placeholder="t('navigation.searchPlaceholder')"
              class="pl-9"
              @click="openSearch"
              @focus="openSearch"
            />
          </div>
          <div class="ml-auto flex shrink-0 items-center gap-2">
            <TaskProgressIndicator />
            <Button as-child variant="ghost" size="icon" class="rounded-full">
              <NuxtLink
                to="/settings/account"
                :aria-label="t('navigation.profileSettings')"
                class="group/avatar relative"
              >
                <img
                  :src="avatarSrc"
                  alt=""
                  class="size-8 rounded-full object-cover"
                  @error="avatarFailed = true"
                />
                <span
                  aria-hidden="true"
                  class="absolute inset-0 flex items-center justify-center rounded-full bg-background/80 opacity-0 transition-opacity group-hover/avatar:opacity-100 group-focus-visible/avatar:opacity-100 motion-reduce:transition-none"
                >
                  <Icon :icon="icons.settings" class="size-5 text-foreground" />
                </span>
              </NuxtLink>
            </Button>
          </div>
        </header>
        <main
          id="main-content"
          tabindex="-1"
          class="min-h-0 flex-1 overflow-y-auto p-4 md:p-6"
        >
          <div
            class="mx-auto space-y-8"
            :class="currentPath === '/search' ? 'max-w-none' : 'max-w-7xl'"
          >
            <slot />
          </div>
        </main>
      </div>
    </div>

    <footer
      :aria-label="t('player.region')"
      class="fixed inset-x-0 bottom-0 z-30 isolate flex h-48 flex-col justify-center gap-3 overflow-hidden border-t bg-card px-4 text-card-foreground md:h-28 md:flex-row md:items-center md:gap-6 md:px-6"
    >
      <div
        v-if="loading"
        aria-hidden="true"
        class="pointer-events-none absolute inset-x-0 top-0 z-20 h-1 overflow-hidden"
      >
        <div class="hidden size-full bg-primary/40 motion-reduce:block" />
        <div
          class="block size-full bg-linear-to-r from-transparent via-primary to-transparent transition-transform duration-1000 ease-in-out motion-reduce:hidden"
          :class="loadingRayAtRight ? 'translate-x-full' : '-translate-x-full'"
        />
      </div>
      <div
        aria-hidden="true"
        class="pointer-events-none absolute inset-y-0 left-0 -z-10 w-2/3 overflow-hidden md:w-1/2"
      >
        <div class="absolute inset-0 opacity-40">
          <Transition
            enter-active-class="transition-opacity duration-3000 delay-150 ease-in-out motion-reduce:transition-none"
            enter-from-class="opacity-0"
            enter-to-class="opacity-100"
            leave-active-class="transition-opacity duration-3000 delay-150 ease-in-out motion-reduce:transition-none"
            leave-from-class="opacity-100"
            leave-to-class="opacity-0"
          >
            <img
              v-if="currentCoverImageUrl && !coverFailed"
              :key="currentCoverImageUrl"
              :src="currentCoverImageUrl"
              alt=""
              class="absolute inset-0 size-full scale-125 object-cover object-left blur-3xl"
            />
          </Transition>
        </div>
        <div
          aria-hidden="true"
          class="absolute inset-y-0 right-0 w-1/2 bg-linear-to-r from-transparent via-card/60 to-card"
        />
      </div>
      <div
        aria-hidden="true"
        class="pointer-events-none absolute inset-0 -z-10 bg-linear-to-r from-card/20 via-card/70 to-card"
      />
      <div class="flex min-w-0 items-center gap-3 md:flex-1">
        <div
          aria-hidden="true"
          class="flex size-16 shrink-0 items-center justify-center overflow-hidden rounded-md bg-muted text-muted-foreground md:size-20"
          :class="active && !currentTrackPlayable && 'opacity-60'"
        >
          <img
            v-if="currentCoverImageUrl && !coverFailed"
            :key="currentCoverImageUrl"
            :src="currentCoverImageUrl"
            alt=""
            class="size-full object-cover"
            @error="coverFailed = true"
          />
          <Icon v-else :icon="icons.music" aria-hidden="true" class="size-8" />
        </div>
        <div class="min-w-0">
          <NuxtLink
            v-if="currentTrackTitleRoute"
            :to="currentTrackTitleRoute"
            class="block truncate rounded-sm text-sm font-medium hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            :class="!currentTrackPlayable && 'opacity-60'"
          >
            {{ active?.title }}
          </NuxtLink>
          <p v-else class="select-none truncate text-sm font-medium">
            {{ active?.title ?? t("player.noTrack") }}
          </p>
          <p
            v-if="error"
            role="alert"
            class="truncate text-xs text-destructive"
          >
            {{ error }}
          </p>
          <p v-else class="truncate text-xs text-muted-foreground">
            <TrackArtistLinks
              v-if="active"
              :artists="trackArtistNames(active)"
            />
            <template v-else>{{ t("player.scanLibrary") }}</template>
          </p>
        </div>
        <LikeButton
          :liked="
            currentTrackLikeTarget
              ? likedTrackIds.includes(currentTrackLikeTarget.trackId)
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
      </div>
      <div class="w-full space-y-1 md:max-w-lg md:flex-1">
        <div class="flex items-center justify-center gap-3">
          <Button
            variant="ghost"
            size="icon-lg"
            class="group"
            :aria-label="
              shuffleEnabled
                ? t('player.disableShuffle')
                : t('player.enableShuffle')
            "
            :aria-pressed="shuffleEnabled"
            :disabled="!shuffleEnabled && (!active || queueTracks.length < 2)"
            @click="toggleRandomization"
            ><Icon
              :icon="icons.shuffle"
              aria-hidden="true"
              class="size-6 transition-colors"
              :class="
                shuffleEnabled
                  ? 'text-primary group-hover:text-primary group-active:text-primary'
                  : 'text-muted-foreground'
              "
          /></Button>
          <Button
            variant="ghost"
            size="icon-lg"
            class="group"
            :aria-label="t('player.previous')"
            :disabled="!active"
            @click="previous"
            ><Icon
              :icon="icons.previous"
              aria-hidden="true"
              class="size-6 transition-colors group-hover:text-primary group-active:text-primary"
          /></Button>
          <Button
            size="icon-lg"
            class="size-12 translate-y-1 rounded-full"
            :disabled="!currentTrackPlayable"
            :aria-label="playing ? t('player.pause') : t('player.play')"
            :aria-busy="loading"
            @click="togglePlayback"
            ><Icon
              :icon="playing ? icons.pause : icons.play"
              aria-hidden="true"
              class="size-6"
          /></Button>
          <Button
            variant="ghost"
            size="icon-lg"
            class="group"
            :aria-label="t('player.next')"
            :disabled="!canGoNext"
            @click="next()"
            ><Icon
              :icon="icons.next"
              aria-hidden="true"
              class="size-6 transition-colors group-hover:text-primary group-active:text-primary"
          /></Button>
          <Button
            variant="ghost"
            size="icon-lg"
            class="group relative"
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
              :icon="repeatMode === 'one' ? icons.repeatOne : icons.repeat"
              aria-hidden="true"
              class="size-6 transition-colors"
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
              >1</span
            >
          </Button>
        </div>
        <div
          class="flex items-center gap-3 text-xs tabular-nums text-muted-foreground"
        >
          <span>{{ clock(elapsed) }}</span><Slider
            :model-value="[elapsed]"
            :min="0"
            :max="Math.max(durationSeconds, 1)"
            :step="1"
            :disabled="!currentTrackPlayable || durationSeconds <= 0"
            :aria-busy="loading"
            class="min-h-11 flex-1"
            :thumb-label="t('player.position')"
            @update:model-value="seek($event?.[0] ?? 0)"
          /><span>{{ clock(durationSeconds) }}</span>
        </div>
      </div>
      <div class="flex min-w-0 flex-1 items-center justify-end gap-3">
        <Button
          variant="ghost"
          size="icon-lg"
          class="group"
          :aria-label="
            queueOpen ? t('player.closeQueue') : t('player.openQueue')
          "
          aria-controls="queue-drawer"
          :aria-expanded="queueOpen"
          data-queue-toggle
          @click="queueOpen = !queueOpen"
        >
          <Icon
            :icon="icons.queue"
            aria-hidden="true"
            class="size-6 transition-colors group-hover:text-primary group-active:text-primary"
            :class="queueOpen && 'text-primary'"
          />
        </Button>
        <div class="hidden items-center gap-3 lg:flex">
          <Icon
            :icon="icons.volume"
            aria-hidden="true"
            class="size-5 text-muted-foreground"
          />
          <Slider
            id="volume"
            :model-value="[volume]"
            :min="0"
            :max="100"
            :step="1"
            class="w-24"
            :thumb-label="t('player.volume')"
            @update:model-value="setVolume($event?.[0] ?? 0)"
          />
        </div>
      </div>
    </footer>
    <QueueDrawer v-model:open="queueOpen" />
  </div>
</template>
