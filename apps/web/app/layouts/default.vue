<script setup lang="ts">
import { useRoute, useState } from "#imports";
import { Icon } from "@iconify/vue/offline";
import logo from "@peridot/ui/assets/brand/logo.svg";
import { Button } from "@peridot/ui/components/ui/button";
import { Input } from "@peridot/ui/components/ui/input";
import { Slider } from "@peridot/ui/components/ui/slider";
import { Spinner } from "@peridot/ui/components/ui/spinner";
import { computed, onMounted, ref, watch } from "vue";
import LikeButton from "../components/LikeButton.vue";
import QueueDrawer from "../components/QueueDrawer.vue";
import { useLikes } from "../composables/use-likes";
import { useLibraryPlayer } from "../composables/use-library-player";
import { useLibraryTracks } from "../composables/use-library-tracks";
import { useServer } from "../composables/use-server";
import { useSession } from "../composables/use-session";
import { useUser } from "../composables/use-user";
import { gravatarUrl } from "../lib/gravatar";
import { icons } from "../lib/icons";
import { trackCoverUrl } from "../lib/library";

const route = useRoute();
const search = useState("library-search", () => "");
const mobileNavigation = ref(false);
const queueOpen = ref(false);
const { address } = useServer();
const { token } = useSession();
const { user } = useUser();
const avatarFailed = ref(false);
const avatarSrc = computed(() =>
  avatarFailed.value || !user.value?.email
    ? logo
    : gravatarUrl(user.value.email),
);
const { tracks, loading: libraryLoading, load } = useLibraryTracks();
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
  currentTrackId,
  elapsed,
  volume,
  loading,
  error,
  active,
  canGoNext,
  durationSeconds,
  loadQueue,
  next,
  previous,
  randomizeQueue,
  upcomingTracks,
  togglePlayback,
  seek,
  setVolume,
} = useLibraryPlayer();
const navigation = [
  { name: "Home", to: "/", icon: icons.home },
  { name: "Library", to: "/library", icon: icons.library },
  { name: "Albums", to: "/albums", icon: icons.music },
  { name: "Artists", to: "/artists", icon: icons.user },
  { name: "Liked songs", to: "/liked", icon: icons.heart },
  { name: "Playlists", to: "/playlists", icon: icons.playlist },
];
const currentPath = computed(() => route.path);
const isNavigationActive = (target: string) =>
  target === "/"
    ? currentPath.value === "/"
    : currentPath.value === target ||
      currentPath.value.startsWith(`${target}/`);
const clock = (seconds: number) =>
  `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
const likedTrackCount = computed(
  () =>
    tracks.value.filter((track) => likedTrackIds.value.includes(track.id))
      .length,
);
const currentTrackLikeTarget = computed(() =>
  currentTrackId.value
    ? ({ kind: "track", trackId: currentTrackId.value } as const)
    : null,
);
const coverFailed = ref(false);
const currentCoverUrl = computed(() =>
  trackCoverUrl(address.value ?? "", active.value?.coverUrl ?? null),
);
watch(currentCoverUrl, () => {
  coverFailed.value = false;
});

function toggleCurrentTrackLike() {
  if (currentTrackId.value)
    void toggleLike({ kind: "track", trackId: currentTrackId.value });
}

watch(currentPath, () => {
  mobileNavigation.value = false;
  search.value = "";
});

watch([address, token, () => user.value?.id], () => {
  clearLikes();
  void loadLikes();
});

onMounted(() => {
  void load();
  void loadLikes();
  void loadQueue();
});
</script>

<template>
  <div
    class="flex h-dvh flex-col overflow-hidden bg-background text-foreground"
  >
    <a href="#main-content" class="sr-only focus:not-sr-only focus:p-4"
      >Skip to content</a
    >
    <div class="flex min-h-0 flex-1 pb-48 md:pb-28">
      <aside
        id="sidebar"
        aria-label="Sidebar"
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
              ><img :src="logo" alt="" class="size-6" />peridot</NuxtLink
            ></Button
          >
          <Button
            variant="ghost"
            size="icon-sm"
            class="md:hidden"
            aria-label="Close navigation"
            @click="mobileNavigation = false"
            ><Icon :icon="icons.close" aria-hidden="true"
          /></Button>
        </div>
        <nav aria-label="Main navigation" class="space-y-1 p-3">
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
                item.name
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
          <p class="mb-3 text-xs font-medium text-muted-foreground">
            Your library
          </p>
          <Button
            as-child
            variant="ghost"
            class="h-auto w-full justify-start gap-3 px-0 py-2"
          >
            <NuxtLink to="/library"
              ><span
                aria-hidden="true"
                class="flex size-10 items-center justify-center rounded-md bg-muted text-muted-foreground"
                ><Icon
                  :icon="icons.music"
                  aria-hidden="true"
                  class="size-5" /></span
              ><span class="text-left"
                >All music<span class="block text-xs text-muted-foreground">{{
                  libraryLoading ? "Loading…" : `${tracks.length} tracks`
                }}</span></span
              ></NuxtLink
            >
          </Button>
          <Button
            as-child
            variant="ghost"
            class="h-auto w-full justify-start gap-3 px-0 py-2"
          >
            <NuxtLink to="/liked"
              ><span
                aria-hidden="true"
                class="flex size-10 items-center justify-center rounded-md bg-muted text-muted-foreground"
                ><Icon
                  :icon="icons.heart"
                  aria-hidden="true"
                  class="size-5" /></span
              ><span class="text-left"
                >Liked songs<span class="block text-xs text-muted-foreground"
                  >{{ likedTrackCount }} tracks</span
                ></span
              ></NuxtLink
            >
          </Button>
        </div>
        <div class="border-t border-sidebar-border p-3">
          <Button as-child variant="ghost" class="w-full justify-start">
            <NuxtLink to="/settings">
              <Icon
                :icon="icons.settings"
                aria-hidden="true"
                class="size-5"
              />Settings
            </NuxtLink>
          </Button>
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
            aria-label="Toggle navigation"
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
              v-model="search"
              type="search"
              aria-label="Search library"
              placeholder="Search your library"
              class="pl-9"
            />
          </div>
          <Button
            as-child
            variant="ghost"
            size="icon"
            class="ml-auto shrink-0 rounded-full"
          >
            <NuxtLink to="/settings/account" aria-label="Open account settings">
              <img
                :src="avatarSrc"
                alt=""
                class="size-8 rounded-full object-cover"
                @error="avatarFailed = true"
              />
            </NuxtLink>
          </Button>
        </header>
        <main
          id="main-content"
          tabindex="-1"
          class="min-h-0 flex-1 overflow-y-auto p-4 md:p-6"
        >
          <div class="mx-auto max-w-7xl space-y-8"><slot /></div>
        </main>
      </div>
    </div>

    <footer
      aria-label="Music player"
      class="fixed inset-x-0 bottom-0 z-30 flex h-48 flex-col justify-center gap-3 border-t bg-card px-4 text-card-foreground md:h-28 md:flex-row md:items-center md:gap-6 md:px-6"
    >
      <div class="flex min-w-0 items-center gap-3 md:flex-1">
        <div
          aria-hidden="true"
          class="flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-md bg-muted text-muted-foreground"
        >
          <img
            v-if="currentCoverUrl && !coverFailed"
            :src="currentCoverUrl"
            alt=""
            class="size-full object-cover"
            @error="coverFailed = true"
          />
          <Icon v-else :icon="icons.music" aria-hidden="true" class="size-6" />
        </div>
        <div class="min-w-0">
          <p class="truncate text-sm font-medium">
            {{ active?.title ?? "No track selected" }}
          </p>
          <p
            v-if="loading"
            role="status"
            class="truncate text-xs text-muted-foreground"
          >
            Preparing audio…
          </p>
          <p
            v-else-if="error"
            role="alert"
            class="truncate text-xs text-destructive"
          >
            {{ error }}
          </p>
          <p v-else class="truncate text-xs text-muted-foreground">
            <TrackArtistLinks v-if="active" :artists="active.artists" />
            <template v-else>Scan your library to get started</template>
          </p>
        </div>
        <LikeButton
          :liked="
            currentTrackLikeTarget
              ? likedTrackIds.includes(currentTrackLikeTarget.trackId)
              : false
          "
          :label="active?.title ?? 'current track'"
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
            aria-label="Randomize upcoming tracks"
            :disabled="upcomingTracks.length < 2"
            @click="randomizeQueue"
            ><Icon :icon="icons.shuffle" aria-hidden="true" class="size-6"
          /></Button>
          <Button
            variant="ghost"
            size="icon-lg"
            aria-label="Previous track"
            :disabled="!active"
            @click="previous"
            ><Icon :icon="icons.previous" aria-hidden="true" class="size-6"
          /></Button>
          <Button
            size="icon-lg"
            class="size-12 rounded-full"
            :disabled="!active"
            :aria-label="
              loading
                ? 'Cancel loading track'
                : playing
                  ? 'Pause track'
                  : 'Play track'
            "
            :aria-busy="loading"
            @click="togglePlayback"
            ><Spinner
              v-if="loading"
              label="Preparing audio"
              class="size-6" /><Icon
              v-else
              :icon="playing ? icons.pause : icons.play"
              aria-hidden="true"
              class="size-6"
          /></Button>
          <Button
            variant="ghost"
            size="icon-lg"
            aria-label="Next track"
            :disabled="!canGoNext"
            @click="next()"
            ><Icon :icon="icons.next" aria-hidden="true" class="size-6"
          /></Button>
          <Button
            variant="ghost"
            size="icon-lg"
            aria-label="Restart track"
            :disabled="!active"
            @click="seek(0)"
            ><Icon :icon="icons.restart" aria-hidden="true" class="size-6"
          /></Button>
        </div>
        <div
          class="flex items-center gap-3 text-xs tabular-nums text-muted-foreground"
        >
          <span>{{ clock(elapsed) }}</span
          ><Slider
            :model-value="[elapsed]"
            :min="0"
            :max="Math.max(durationSeconds, 1)"
            :step="1"
            :disabled="!active || durationSeconds <= 0"
            class="min-h-11 flex-1"
            thumb-label="Playback position"
            @update:model-value="seek($event?.[0] ?? 0)"
          /><span>{{ clock(durationSeconds) }}</span>
        </div>
      </div>
      <div class="flex min-w-0 flex-1 items-center justify-end gap-3">
        <Button
          variant="ghost"
          size="icon-lg"
          :aria-label="queueOpen ? 'Close queue' : 'Open queue'"
          aria-controls="queue-drawer"
          :aria-expanded="queueOpen"
          data-queue-toggle
          @click="queueOpen = !queueOpen"
        >
          <Icon :icon="icons.queue" aria-hidden="true" class="size-6" />
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
            thumb-label="Playback volume"
            @update:model-value="setVolume($event?.[0] ?? 0)"
          />
        </div>
      </div>
    </footer>
    <QueueDrawer v-model:open="queueOpen" />
  </div>
</template>
