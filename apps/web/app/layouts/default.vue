<script setup lang="ts">
import { useRoute, useState } from "#imports";
import { Icon } from "@iconify/vue/offline";
import logo from "@peridot/ui/assets/brand/logo.svg";
import { Button } from "@peridot/ui/components/ui/button";
import { Input } from "@peridot/ui/components/ui/input";
import { Slider } from "@peridot/ui/components/ui/slider";
import { computed, ref, watch } from "vue";
import { useDemoPlayer } from "../composables/use-demo-player";
import { useUser } from "../composables/use-user";
import { gravatarUrl } from "../lib/gravatar";
import { icons } from "../lib/icons";

const route = useRoute();
const search = useState("library-search", () => "");
const mobileNavigation = ref(false);
const { user } = useUser();
const avatarFailed = ref(false);
const avatarSrc = computed(() =>
  avatarFailed.value || !user.value?.email
    ? logo
    : gravatarUrl(user.value.email),
);
const { playing, current, elapsed, volume, liked, active, next, toggleLike } =
  useDemoPlayer();
const navigation = [
  { name: "Home", to: "/", icon: icons.home },
  { name: "Library", to: "/library", icon: icons.library },
  { name: "Liked songs", to: "/liked", icon: icons.heart },
  { name: "Playlists", to: "/playlists", icon: icons.playlist },
];
const currentPath = computed(() => route.path);
const clock = (seconds: number) =>
  `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;

watch(currentPath, () => {
  mobileNavigation.value = false;
  search.value = "";
});
</script>

<template>
  <div
    class="flex h-dvh flex-col overflow-hidden bg-background text-foreground"
  >
    <a href="#main-content" class="sr-only focus:not-sr-only focus:p-4"
      >Skip to content</a
    >
    <div class="flex min-h-0 flex-1 pb-40 md:pb-28">
      <aside
        id="sidebar"
        aria-label="Sidebar"
        :class="[
          'w-56 shrink-0 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground',
          mobileNavigation
            ? 'absolute inset-y-0 left-0 z-20 flex pb-40 md:static md:pb-0'
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
            ><NuxtLink to="/">peridot</NuxtLink></Button
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
              currentPath === item.to &&
                'bg-sidebar-accent text-sidebar-accent-foreground',
            ]"
          >
            <NuxtLink
              :to="item.to"
              :aria-current="currentPath === item.to ? 'page' : undefined"
            >
              <Icon :icon="item.icon" aria-hidden="true" class="size-5" />{{
                item.name
              }}
              <span
                v-if="item.to === '/liked'"
                class="ml-auto text-xs text-muted-foreground"
                >{{ liked.length }}</span
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
                >All music<span class="block text-xs text-muted-foreground"
                  >5 demo tracks</span
                ></span
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
                  >{{ liked.length }} tracks</span
                ></span
              ></NuxtLink
            >
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
              aria-label="Search demo library"
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
            <NuxtLink to="/settings" aria-label="Open settings">
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
      class="fixed inset-x-0 bottom-0 z-30 flex h-40 flex-col justify-center gap-3 border-t bg-card px-4 text-card-foreground md:h-28 md:flex-row md:items-center md:gap-6 md:px-6"
    >
      <div class="flex min-w-0 items-center gap-3 md:flex-1">
        <div
          aria-hidden="true"
          class="flex size-12 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground"
        >
          <Icon :icon="icons.music" aria-hidden="true" class="size-6" />
        </div>
        <div class="min-w-0">
          <p class="truncate text-sm font-medium">{{ active.title }}</p>
          <p class="truncate text-xs text-muted-foreground">
            {{ active.artist }}
          </p>
        </div>
        <Button
          variant="ghost"
          size="icon-lg"
          :class="liked.includes(current) && 'text-primary'"
          aria-label="Like current track"
          :aria-pressed="liked.includes(current)"
          @click="toggleLike(current)"
          ><Icon
            :icon="liked.includes(current) ? icons.heartFilled : icons.heart"
            aria-hidden="true"
            class="size-6"
        /></Button>
      </div>
      <div class="w-full space-y-2 md:max-w-lg md:flex-1">
        <div class="flex items-center justify-center gap-3">
          <Button
            variant="ghost"
            size="icon-lg"
            aria-label="Previous track"
            @click="next(-1)"
            ><Icon :icon="icons.previous" aria-hidden="true" class="size-6"
          /></Button>
          <Button
            size="icon-lg"
            class="size-12 rounded-full"
            :aria-label="playing ? 'Pause preview' : 'Play preview'"
            @click="playing = !playing"
            ><Icon
              :icon="playing ? icons.pause : icons.play"
              aria-hidden="true"
              class="size-6"
          /></Button>
          <Button
            variant="ghost"
            size="icon-lg"
            aria-label="Next track"
            @click="next()"
            ><Icon :icon="icons.next" aria-hidden="true" class="size-6"
          /></Button>
          <Button
            variant="ghost"
            size="icon-lg"
            aria-label="Restart track"
            @click="elapsed = 0"
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
            :max="active.duration"
            :step="1"
            class="flex-1"
            thumb-label="Playback position"
            @update:model-value="elapsed = $event?.[0] ?? 0"
          /><span>{{ clock(active.duration) }}</span>
        </div>
      </div>
      <div class="hidden min-w-0 flex-1 items-center justify-end gap-3 lg:flex">
        <label for="volume" class="text-xs text-muted-foreground">Volume</label
        ><Slider
          id="volume"
          :model-value="[volume]"
          :min="0"
          :max="100"
          :step="1"
          class="w-24"
          thumb-label="Demo volume"
          @update:model-value="volume = $event?.[0] ?? 0"
        />
      </div>
    </footer>
  </div>
</template>
