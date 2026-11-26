<script setup lang="ts">
import { useHead, useI18n } from "#imports";
import {
  LIKED_TRACKS_PLAYLIST_ID,
  RECENTLY_ADDED_PLAYLIST_ID,
} from "@peridot/contracts";
import { Button } from "@peridot/ui/components/ui/button";
import { PeridotSpinner } from "@peridot/ui/components/ui/spinner";
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import CatalogCard from "../components/CatalogCard.vue";
import { useInteractionFrozenList } from "../composables/use-interaction-frozen-list";
import { usePlaylistList } from "../composables/use-playlists";
import { useQuickPicks } from "../composables/use-quick-picks";
import { useUser } from "../composables/use-user";
import {
  catalogCardKey,
  playlistCatalogCard,
  type CatalogCardItem,
} from "../lib/catalog-cards";
import { HOME_GREETING_KEYS, homeGreetingPeriod } from "../lib/home-greeting";

const { t } = useI18n();
const { user } = useUser();
useHead({ title: t("page.home.title") });
const now = ref(new Date());
const greeting = computed(() =>
  t(HOME_GREETING_KEYS[homeGreetingPeriod(now.value)], {
    username: user.value?.displayName ?? "",
  }),
);

const {
  items: playlists,
  loading: playlistsLoading,
  error: playlistsError,
  loaded: playlistsLoaded,
  load: loadPlaylists,
} = usePlaylistList({ limit: 2 });
const {
  items: quickPickItems,
  loading: quickPicksLoading,
  error: quickPicksError,
  loaded: quickPicksLoaded,
  load: loadQuickPicks,
} = useQuickPicks();
const {
  items: visibleQuickPickItems,
  beginPointerInteraction,
  endPointerInteraction,
  beginFocusInteraction,
  endFocusInteraction,
} = useInteractionFrozenList(quickPickItems);

const likedPlaylist = computed(
  () =>
    playlists.value.find(
      (playlist) => playlist.id === LIKED_TRACKS_PLAYLIST_ID,
    ) ?? null,
);
const recentlyAddedPlaylist = computed(
  () =>
    playlists.value.find(
      (playlist) => playlist.id === RECENTLY_ADDED_PLAYLIST_ID,
    ) ?? null,
);
const contentItems = computed<CatalogCardItem[]>(() => {
  const items: CatalogCardItem[] = [];
  if (likedPlaylist.value) {
    items.push(playlistCatalogCard(likedPlaylist.value));
  }
  if (recentlyAddedPlaylist.value) {
    items.push(playlistCatalogCard(recentlyAddedPlaylist.value));
  }
  items.push(...visibleQuickPickItems.value);
  return items;
});
const contentCount = computed(() => contentItems.value.length);
const contentLoading = computed(
  () => playlistsLoading.value || quickPicksLoading.value,
);
const contentLoaded = computed(
  () => playlistsLoaded.value && quickPicksLoaded.value,
);
const contentError = computed(
  () => playlistsError.value ?? quickPicksError.value,
);

function retryContent() {
  void loadPlaylists(true);
  void loadQuickPicks(true);
}

function handleQuickPickFocusOut(event: FocusEvent) {
  const currentTarget = event.currentTarget;
  const nextTarget = event.relatedTarget;
  if (
    currentTarget instanceof Node &&
    nextTarget instanceof Node &&
    currentTarget.contains(nextTarget)
  ) {
    return;
  }
  endFocusInteraction();
}

let greetingClock: ReturnType<typeof setInterval> | undefined;

onMounted(() => {
  greetingClock = setInterval(() => {
    now.value = new Date();
  }, 60_000);
  void loadPlaylists();
  void loadQuickPicks();
});

onBeforeUnmount(() => {
  if (greetingClock !== undefined) clearInterval(greetingClock);
});
</script>

<template>
  <div class="space-y-6">
    <header>
      <h1 class="text-2xl font-semibold tracking-tight">
        {{ greeting }}
      </h1>
    </header>

    <section
      aria-labelledby="home-suggestions-heading"
      class="space-y-4"
      :aria-busy="contentLoading"
    >
      <h2 id="home-suggestions-heading" class="text-lg font-semibold">
        {{ t("page.home.suggestions") }}
      </h2>
      <div
        v-if="contentLoading && !contentCount"
        role="status"
        class="flex items-center gap-3 rounded-lg border p-6 text-sm text-muted-foreground"
      >
        <PeridotSpinner :label="t('page.home.loadingSuggestions')" />
        {{ t("page.home.loadingSuggestions") }}
      </div>
      <div
        v-else-if="contentError && !contentCount"
        role="alert"
        class="space-y-3 rounded-lg border p-6 text-sm"
      >
        <p>{{ contentError }}</p>
        <Button variant="outline" @click="retryContent">
          {{ t("common.tryAgain") }}
        </Button>
      </div>
      <div
        v-else-if="contentCount"
        class="grid grid-cols-2 gap-4 lg:grid-cols-3 xl:grid-cols-5"
        @pointerenter="beginPointerInteraction"
        @pointerleave="endPointerInteraction"
        @focusin="beginFocusInteraction"
        @focusout="handleQuickPickFocusOut"
      >
        <CatalogCard
          v-for="item in contentItems"
          :key="catalogCardKey(item)"
          :item="item"
        />
      </div>
      <p
        v-else
        role="status"
        class="rounded-lg border p-6 text-sm text-muted-foreground"
      >
        {{
          contentLoaded
            ? t("page.home.noSuggestions")
            : t("page.home.loadingSuggestions")
        }}
      </p>
    </section>
  </div>
</template>
