<script setup lang="ts">
import { useState } from "#imports";
import { Icon } from "@iconify/vue/offline";
import { Badge } from "@peridot/ui/components/ui/badge";
import { Button } from "@peridot/ui/components/ui/button";
import { computed } from "vue";
import { useDemoPlayer } from "../composables/use-demo-player";
import { findAlbums } from "../lib/demo-library";
import { icons } from "../lib/icons";

const props = withDefaults(
  defineProps<{ title: string; home?: boolean; favorites?: boolean }>(),
  { home: false, favorites: false },
);
const search = useState("library-search", () => "");
const { playing, current, liked, play, toggleLike } = useDemoPlayer();
const visible = computed(() =>
  findAlbums(search.value, props.favorites ? liked.value : undefined),
);
const clock = (seconds: number) =>
  `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
</script>

<template>
  <div class="space-y-2">
    <h1 class="text-2xl font-semibold tracking-tight">
      {{ search ? "Search results" : title }}
    </h1>
    <p class="text-sm text-muted-foreground">
      Fictional music for this preview. Audio playback is not connected.
    </p>
  </div>
  <section aria-labelledby="collection-heading" class="space-y-4">
    <div class="flex items-center justify-between gap-4">
      <h2 id="collection-heading" class="text-lg font-semibold">
        {{ home && !search ? "Made for your rotation" : "Your collection" }}
      </h2>
      <Button v-if="home" as-child variant="ghost" size="sm"
        ><NuxtLink to="/library">View library</NuxtLink></Button
      >
      <Badge v-else variant="secondary">{{ visible.length }} tracks</Badge>
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
          ><span aria-hidden="true" class="text-muted-foreground"
            ><Icon
              :icon="icons.music"
              aria-hidden="true"
              class="size-5" /></span
          ><span class="text-sm">{{ album.title }}</span></Button
        >
        <div class="flex items-center justify-between gap-2">
          <div class="min-w-0">
            <h3 class="truncate text-sm font-medium">{{ album.title }}</h3>
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
                liked.includes(album.index) ? icons.heartFilled : icons.heart
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
    <h2 id="tracks-heading" class="text-lg font-semibold">Tracks</h2>
    <div class="overflow-x-auto rounded-lg border">
      <table class="w-full text-left text-sm">
        <thead class="border-b text-muted-foreground">
          <tr>
            <th scope="col" class="p-3 font-medium">Title</th>
            <th scope="col" class="hidden p-3 font-medium sm:table-cell">
              Artist
            </th>
            <th scope="col" class="p-3 text-right font-medium">Duration</th>
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
                /><span class="truncate">{{ album.title }}</span></Button
              >
            </td>
            <td class="hidden p-3 text-muted-foreground sm:table-cell">
              {{ album.artist }}
            </td>
            <td class="p-3 text-right tabular-nums text-muted-foreground">
              {{ clock(album.duration) }}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </section>
</template>
