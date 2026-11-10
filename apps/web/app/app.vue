<script setup lang="ts">
import { Button } from "@peridot/ui/components/ui/button";
import { Input } from "@peridot/ui/components/ui/input";
import { Slider } from "@peridot/ui/components/ui/slider";
import { Badge } from "@peridot/ui/components/ui/badge";
import { Icon } from "@iconify/vue/offline";
import { icons } from "./lib/icons";
import { computed, onMounted, onUnmounted, ref } from "vue";
import { albums, findAlbums, toggleFavorite } from "./lib/demo-library";

const section = ref("Home");
const search = ref("");
const playing = ref(false);
const current = ref(0);
const elapsed = ref(0);
const volume = ref(72);
const liked = ref<number[]>([1, 3]);
const mobileNavigation = ref(false);
const navigation = [
  { name: "Home", icon: icons.home },
  { name: "Library", icon: icons.library },
  { name: "Liked songs", icon: icons.heart },
  { name: "Playlists", icon: icons.playlist },
  { name: "Plugins", icon: icons.plugins },
];
const active = computed(() => albums[current.value]!);
const visible = computed(() =>
  findAlbums(
    search.value,
    section.value === "Liked songs" ? liked.value : undefined,
  ),
);
const clock = (seconds: number) =>
  `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
function navigate(name: string) {
  section.value = name;
  search.value = "";
  mobileNavigation.value = false;
}
function play(index: number) {
  current.value = index;
  elapsed.value = 0;
  playing.value = true;
}
function next(offset = 1) {
  play((current.value + offset + albums.length) % albums.length);
}
function toggleLike(index: number) {
  liked.value = toggleFavorite(liked.value, index);
}
let timer: ReturnType<typeof setInterval>;
onMounted(() => {
  timer = setInterval(() => {
    if (playing.value) {
      if (elapsed.value >= active.value.duration) next();
      else elapsed.value++;
    }
  }, 1000);
});
onUnmounted(() => clearInterval(timer));
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
            variant="ghost"
            class="text-lg font-semibold"
            @click="navigate('Home')"
            >peridot</Button
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
            :key="item.name"
            variant="ghost"
            :aria-current="section === item.name ? 'page' : undefined"
            :class="[
              'w-full justify-start',
              section === item.name &&
                'bg-sidebar-accent text-sidebar-accent-foreground',
            ]"
            @click="navigate(item.name)"
          >
            <Icon :icon="item.icon" aria-hidden="true" class="size-5" />
            {{ item.name }}
            <span
              v-if="item.name === 'Liked songs'"
              class="ml-auto text-xs text-muted-foreground"
              >{{ liked.length }}</span
            >
          </Button>
        </nav>
        <div
          class="min-h-0 flex-1 overflow-y-auto border-t border-sidebar-border p-4"
        >
          <p class="mb-3 text-xs font-medium text-muted-foreground">
            Your library
          </p>
          <Button
            variant="ghost"
            class="h-auto w-full justify-start gap-3 px-0 py-2"
            @click="navigate('Library')"
          >
            <span
              aria-hidden="true"
              class="flex size-10 items-center justify-center rounded-md bg-muted text-muted-foreground"
              ><Icon :icon="icons.music" aria-hidden="true" class="size-5"
            /></span>
            <span class="text-left"
              >All music<span class="block text-xs text-muted-foreground"
                >{{ albums.length }} demo tracks</span
              ></span
            >
          </Button>
          <Button
            variant="ghost"
            class="h-auto w-full justify-start gap-3 px-0 py-2"
            @click="navigate('Liked songs')"
          >
            <span
              aria-hidden="true"
              class="flex size-10 items-center justify-center rounded-md bg-muted text-muted-foreground"
              ><Icon :icon="icons.heart" aria-hidden="true" class="size-5"
            /></span>
            <span class="text-left"
              >Liked songs<span class="block text-xs text-muted-foreground"
                >{{ liked.length }} tracks</span
              ></span
            >
          </Button>
        </div>
        <div class="border-t border-sidebar-border p-4 text-sm">
          <p class="font-medium">Personal library</p>
          <p class="text-xs text-muted-foreground">Self-hosted. Your music.</p>
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
          <Badge
            variant="secondary"
            class="ml-auto hidden shrink-0 sm:inline-flex"
            >Demo</Badge
          >
        </header>

        <main
          id="main-content"
          tabindex="-1"
          class="min-h-0 flex-1 overflow-y-auto p-4 md:p-6"
        >
          <div class="mx-auto max-w-7xl space-y-8">
            <div class="space-y-2">
              <h1 class="text-2xl font-semibold tracking-tight">
                {{ search ? "Search results" : section }}
              </h1>
              <p class="text-sm text-muted-foreground">
                Fictional music for this preview. Audio playback is not
                connected.
              </p>
            </div>

            <section
              v-if="section === 'Plugins'"
              aria-label="Plugins"
              class="rounded-lg border bg-card p-6 text-card-foreground"
            >
              <h2 class="text-lg font-semibold">Optional connections</h2>
              <p class="mt-2 text-sm text-muted-foreground">
                Plugins will use your own credentials and services. No
                integrations are connected.
              </p>
            </section>
            <section
              v-else-if="section === 'Playlists'"
              aria-label="Playlists"
              class="rounded-lg border bg-card p-6 text-card-foreground"
            >
              <h2 class="text-lg font-semibold">No playlists yet</h2>
              <p class="mt-2 text-sm text-muted-foreground">
                Playlist creation will be available when your library is
                connected.
              </p>
              <Button
                variant="outline"
                class="mt-4"
                @click="navigate('Library')"
                >Browse library</Button
              >
            </section>
            <template v-else>
              <section aria-labelledby="collection-heading" class="space-y-4">
                <div class="flex items-center justify-between gap-4">
                  <h2 id="collection-heading" class="text-lg font-semibold">
                    {{
                      section === "Home" && !search
                        ? "Made for your rotation"
                        : "Your collection"
                    }}
                  </h2>
                  <Button
                    v-if="section === 'Home'"
                    variant="ghost"
                    size="sm"
                    @click="navigate('Library')"
                    >View library</Button
                  >
                  <Badge v-else variant="secondary"
                    >{{ visible.length }} tracks</Badge
                  >
                </div>
                <div
                  class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5"
                >
                  <article
                    v-for="album in visible"
                    :key="album.index"
                    class="min-w-0 space-y-3 rounded-lg border bg-card p-3 text-card-foreground"
                  >
                    <Button
                      variant="secondary"
                      :aria-label="`Play ${album.title}`"
                      class="aspect-square h-auto w-full flex-col gap-3 whitespace-normal rounded-md"
                      @click="play(album.index)"
                    >
                      <span aria-hidden="true" class="text-muted-foreground"
                        ><Icon
                          :icon="icons.music"
                          aria-hidden="true"
                          class="size-5"
                      /></span>
                      <span class="text-sm">{{ album.title }}</span>
                    </Button>
                    <div class="flex items-center justify-between gap-2">
                      <div class="min-w-0">
                        <h3 class="truncate text-sm font-medium">
                          {{ album.title }}
                        </h3>
                        <p class="truncate text-xs text-muted-foreground">
                          {{ album.artist }} · {{ album.genre }}
                        </p>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon-lg"
                        :class="liked.includes(album.index) && 'text-primary'"
                        :aria-label="`${liked.includes(album.index) ? 'Unlike' : 'Like'} ${album.title}`"
                        :aria-pressed="liked.includes(album.index)"
                        @click="toggleLike(album.index)"
                        ><Icon
                          :icon="
                            liked.includes(album.index)
                              ? icons.heartFilled
                              : icons.heart
                          "
                          aria-hidden="true"
                          class="size-6"
                      /></Button>
                    </div>
                  </article>
                </div>
                <p
                  v-if="!visible.length"
                  role="status"
                  class="rounded-lg border p-6 text-sm text-muted-foreground"
                >
                  No tracks found. Try another title, artist, or genre.
                </p>
              </section>

              <section aria-labelledby="tracks-heading" class="space-y-4">
                <h2 id="tracks-heading" class="text-lg font-semibold">
                  Tracks
                </h2>
                <div class="overflow-x-auto rounded-lg border">
                  <table class="w-full text-left text-sm">
                    <thead class="border-b text-muted-foreground">
                      <tr>
                        <th scope="col" class="p-3 font-medium">Title</th>
                        <th
                          scope="col"
                          class="hidden p-3 font-medium sm:table-cell"
                        >
                          Artist
                        </th>
                        <th scope="col" class="p-3 text-right font-medium">
                          Duration
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr
                        v-for="album in visible"
                        :key="album.index"
                        class="border-b last:border-0 hover:bg-muted/50"
                      >
                        <td class="p-2">
                          <Button
                            variant="ghost"
                            class="max-w-full justify-start"
                            :aria-label="`Play track ${album.title}`"
                            @click="play(album.index)"
                            ><Icon
                              :icon="
                                current === album.index && playing
                                  ? icons.pause
                                  : icons.play
                              "
                              aria-hidden="true"
                              :class="
                                current === album.index && playing
                                  ? 'text-primary'
                                  : 'text-muted-foreground'
                              "
                            /><span class="truncate">{{
                              album.title
                            }}</span></Button
                          >
                        </td>
                        <td
                          class="hidden p-3 text-muted-foreground sm:table-cell"
                        >
                          {{ album.artist }}
                        </td>
                        <td
                          class="p-3 text-right tabular-nums text-muted-foreground"
                        >
                          {{ clock(album.duration) }}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </section>
            </template>
          </div>
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
          <span>{{ clock(elapsed) }}</span>
          <Slider
            :model-value="[elapsed]"
            :min="0"
            :max="active.duration"
            :step="1"
            class="flex-1"
            thumb-label="Playback position"
            @update:model-value="elapsed = $event?.[0] ?? 0"
          />
          <span>{{ clock(active.duration) }}</span>
        </div>
      </div>
      <div class="hidden min-w-0 flex-1 items-center justify-end gap-3 lg:flex">
        <label for="volume" class="text-xs text-muted-foreground">Volume</label>
        <Slider
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
