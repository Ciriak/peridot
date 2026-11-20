<script setup lang="ts">
import {
  definePageMeta,
  navigateTo,
  useHead,
  useI18n,
  useRoute,
  useState,
} from "#imports";
import type { PlaylistEntryResponse, TrackResponse } from "@peridot/contracts";
import { Icon } from "@iconify/vue/offline";
import { Badge } from "@peridot/ui/components/ui/badge";
import { Button } from "@peridot/ui/components/ui/button";
import { ScrollingText } from "@peridot/ui/components/ui/scrolling-text";
import { PeridotSpinner } from "@peridot/ui/components/ui/spinner";
import { computed, onMounted, ref } from "vue";
import AddTracksToPlaylistDialog from "../../components/AddTracksToPlaylistDialog.vue";
import BackButton from "../../components/BackButton.vue";
import ListSearchBar from "../../components/ListSearchBar.vue";
import LikeButton from "../../components/LikeButton.vue";
import PlaylistCover from "../../components/PlaylistCover.vue";
import PlaylistDeleteDialog from "../../components/PlaylistDeleteDialog.vue";
import PlaylistNameDialog from "../../components/PlaylistNameDialog.vue";
import PlaylistOfflineButton from "../../components/PlaylistOfflineButton.vue";
import PlaylistTrackList from "../../components/PlaylistTrackList.vue";
import ScrolledHeader from "../../components/ScrolledHeader.vue";
import { useLikes } from "../../composables/use-likes";
import { useLibraryPlayer } from "../../composables/use-library-player";
import { useListSearch } from "../../composables/use-list-search";
import { useOfflineTracks } from "../../composables/use-offline-tracks";
import {
  usePlaylist,
  usePlaylistActions,
} from "../../composables/use-playlists";
import { useServer } from "../../composables/use-server";
import { useServerConnection } from "../../composables/use-server-connection";
import { icons } from "../../lib/icons";
import { formatTrackDuration, trackCoverUrl } from "../../lib/library";
import {
  filterPlaylistEntries,
  playlistPlayableTracks,
} from "../../lib/playlists";

definePageMeta({ name: "playlist-detail" });

const route = useRoute();
const { t } = useI18n();
const { address } = useServer();
const { status } = useServerConnection();
const { playing, playCollection, togglePlayback } = useLibraryPlayer();
const { savedTracks } = useOfflineTracks();
const actions = usePlaylistActions();
const activePlaylistId = useState<string | null>(
  "player-active-playlist-id",
  () => null,
);
const playlistId = computed(() => String(route.params.playlist ?? ""));
const { playlist, loading, error, load } = usePlaylist(playlistId);
const { query, searchQuery, clear } = useListSearch();
const automatic = computed(() => playlist.value?.kind === "liked-tracks");
const {
  likedTrackIds,
  loaded: likesLoaded,
  toggle: toggleLike,
  isPending: isLikePending,
} = useLikes();
const addOpen = ref(false);
const renameOpen = ref(false);
const deleteOpen = ref(false);
const mutating = ref(false);
const actionError = ref<string | null>(null);
const coverUrls = computed(() =>
  (playlist.value?.coverUrls ?? []).flatMap((url) => {
    const resolved = trackCoverUrl(address.value ?? "", url);
    return resolved ? [resolved] : [];
  }),
);
const likeTarget = computed(() => ({
  kind: "playlist" as const,
  playlistId: playlist.value?.id ?? "",
  name: playlist.value?.name ?? "",
}));
const savedIds = computed(
  () => new Set(savedTracks.value.map((saved) => saved.track.id)),
);
const currentEntries = computed(() => {
  const entries = playlist.value?.entries ?? [];
  if (!automatic.value || !likesLoaded.value) return entries;
  const liked = new Set(likedTrackIds.value);
  return entries.filter((entry) => entry.track && liked.has(entry.track.id));
});
const filteredEntries = computed(() =>
  automatic.value
    ? filterPlaylistEntries(currentEntries.value, searchQuery.value)
    : currentEntries.value,
);
const playableTracks = computed(() =>
  playlistPlayableTracks(currentEntries.value, {
    serverLost: status.value === "lost",
    savedTrackIds: savedIds.value,
  }),
);
const playlistActive = computed(() =>
  Boolean(playlist.value && activePlaylistId.value === playlist.value.id),
);
const playlistTarget = computed(() => ({
  kind: "playlist" as const,
  id: playlist.value?.id ?? "",
}));
const playlistPlayLabel = computed(() =>
  playlist.value
    ? t("playlistCard.play", { playlist: playlist.value.name })
    : "",
);
const playlistPauseLabel = computed(() =>
  playlist.value
    ? t("playlistCard.pause", { playlist: playlist.value.name })
    : "",
);
useHead(() => ({
  title: playlist.value
    ? t("page.playlist.title", { playlist: playlist.value.name })
    : t("page.playlist.fallbackTitle"),
}));

function playFrom(track: TrackResponse) {
  if (!playlist.value || !playableTracks.value.length) return;
  activePlaylistId.value = playlist.value.id;
  playCollection(playableTracks.value, track.id, playlistTarget.value);
}

function togglePlaylistPlayback() {
  if (playlistActive.value && playing.value) {
    togglePlayback();
    return;
  }
  const first = playableTracks.value[0];
  if (first) playFrom(first);
}

async function rename(name: string) {
  if (!playlist.value) return;
  mutating.value = true;
  actionError.value = null;
  try {
    await actions.rename(playlist.value.id, name);
    renameOpen.value = false;
  } catch (reason) {
    actionError.value = actions.messageFor(reason, "error.playlistUpdate");
  } finally {
    mutating.value = false;
  }
}

async function removePlaylist() {
  if (!playlist.value) return;
  mutating.value = true;
  actionError.value = null;
  try {
    await actions.remove(playlist.value.id);
    deleteOpen.value = false;
    await navigateTo("/playlists");
  } catch (reason) {
    actionError.value = actions.messageFor(reason, "error.playlistDelete");
    deleteOpen.value = false;
  } finally {
    mutating.value = false;
  }
}

async function removeEntry(entry: PlaylistEntryResponse) {
  if (!playlist.value || status.value === "lost") return;
  mutating.value = true;
  actionError.value = null;
  try {
    await actions.removeItem(playlist.value.id, entry.id);
  } catch (reason) {
    actionError.value = actions.messageFor(reason, "error.playlistRemoveItem");
  } finally {
    mutating.value = false;
  }
}

async function reorder(itemIds: string[]) {
  if (!playlist.value || status.value === "lost") return;
  mutating.value = true;
  actionError.value = null;
  try {
    await actions.reorder(playlist.value.id, itemIds);
  } catch (reason) {
    actionError.value = actions.messageFor(reason, "error.playlistReorder");
    await load(true);
  } finally {
    mutating.value = false;
  }
}

onMounted(() => void load());
</script>

<template>
  <BackButton />

  <div
    v-if="loading"
    role="status"
    class="flex items-center gap-3 rounded-lg border p-6 text-sm text-muted-foreground"
  >
    <PeridotSpinner :label="t('page.playlist.loading')" />
    {{ t("page.playlist.loading") }}
  </div>
  <div
    v-else-if="error"
    role="alert"
    class="space-y-3 rounded-lg border p-6 text-sm"
  >
    <p>{{ error }}</p>
    <Button variant="outline" @click="load(true)">
      {{ t("common.tryAgain") }}
    </Button>
  </div>
  <template v-else-if="playlist">
    <p v-if="actionError" role="alert" class="mb-4 text-sm text-destructive">
      {{ actionError }}
    </p>
    <ScrolledHeader
      :title="playlist.name"
      :playable="playableTracks.length > 0"
      :playback-active="playlistActive && playing"
      :play-label="playlistPlayLabel"
      :pause-label="playlistPauseLabel"
      @play="togglePlaylistPlayback"
    >
      <section
        aria-labelledby="playlist-heading"
        class="relative flex flex-col gap-6 rounded-lg border bg-card p-6 text-card-foreground sm:flex-row sm:items-end"
      >
        <PlaylistOfflineButton
          :playlist="playlist"
          class="absolute right-4 top-4"
        />
        <div class="w-40 shrink-0">
          <PlaylistCover :cover-urls="coverUrls" :kind="playlist.kind" />
        </div>
        <div class="min-w-0 flex-1 space-y-3 pr-12">
          <p
            class="text-xs font-medium uppercase tracking-wide text-muted-foreground"
          >
            {{
              automatic
                ? t("page.playlist.automaticLabel")
                : t("page.playlist.label")
            }}
          </p>
          <h1
            id="playlist-heading"
            class="text-3xl font-semibold tracking-tight"
          >
            <ScrollingText class="w-full">{{ playlist.name }}</ScrollingText>
          </h1>
          <div class="flex flex-wrap items-center gap-3">
            <Button
              size="icon-lg"
              class="rounded-full"
              :disabled="!playableTracks.length"
              :aria-label="
                playlistActive && playing
                  ? playlistPauseLabel
                  : playlistPlayLabel
              "
              @click="togglePlaylistPlayback"
            >
              <Icon
                :icon="playlistActive && playing ? icons.pause : icons.play"
                aria-hidden="true"
                class="size-5"
              />
            </Button>
            <LikeButton
              v-if="!automatic"
              :liked="playlist.liked"
              :label="playlist.name"
              :pending="isLikePending(likeTarget)"
              :disabled="!likesLoaded || status === 'lost'"
              @toggle="toggleLike(likeTarget)"
            />
            <Button
              v-if="!automatic"
              variant="ghost"
              size="icon-lg"
              :disabled="status === 'lost'"
              :aria-label="t('page.playlist.rename')"
              :title="t('page.playlist.rename')"
              @click="renameOpen = true"
            >
              <Icon :icon="icons.edit" aria-hidden="true" class="size-5" />
            </Button>
            <Button
              v-if="!automatic"
              variant="ghost"
              size="icon-lg"
              :disabled="status === 'lost'"
              :aria-label="t('page.playlist.delete')"
              :title="t('page.playlist.delete')"
              @click="deleteOpen = true"
            >
              <Icon :icon="icons.trash" aria-hidden="true" class="size-5" />
            </Button>
            <Badge variant="secondary">
              {{
                t(
                  "count.track",
                  { count: currentEntries.length },
                  currentEntries.length,
                )
              }}
            </Badge>
            <Badge
              v-if="playlist.availableTrackCount < playlist.trackCount"
              variant="secondary"
            >
              {{
                t("page.playlist.unavailableCount", {
                  count: playlist.trackCount - playlist.availableTrackCount,
                })
              }}
            </Badge>
            <span class="text-sm text-muted-foreground">
              {{ formatTrackDuration(playlist.durationMs) }}
            </span>
          </div>
        </div>
      </section>
    </ScrolledHeader>

    <section aria-labelledby="playlist-tracks-heading" class="space-y-4">
      <div class="flex flex-wrap items-center justify-between gap-3">
        <h2 id="playlist-tracks-heading" class="text-lg font-semibold">
          {{ t("playlistTracks.heading") }}
        </h2>
        <ListSearchBar
          v-if="automatic && currentEntries.length"
          v-model="query"
          :label="
            t('components.listSearch.label', {
              collection: playlist.name,
            })
          "
          :clear-label="t('components.listSearch.clear')"
          class="w-full md:max-w-sm"
          @clear="clear"
        />
        <Button
          v-if="!automatic"
          variant="outline"
          :disabled="status === 'lost' || mutating"
          @click="addOpen = true"
        >
          <Icon :icon="icons.plus" aria-hidden="true" class="size-4" />
          {{ t("playlistTracks.add") }}
        </Button>
      </div>
      <PlaylistTrackList
        v-if="filteredEntries.length"
        :entries="filteredEntries"
        :editable="!automatic && status !== 'lost' && !mutating"
        :read-only="automatic"
        :show-track-likes="!automatic"
        @play="playFrom"
        @remove="removeEntry"
        @reorder="reorder"
      />
      <div
        v-else-if="automatic"
        role="status"
        class="space-y-2 rounded-lg border bg-card p-6 text-card-foreground"
      >
        <p class="font-medium">
          {{
            currentEntries.length
              ? t("page.playlist.noMatches")
              : t("page.playlist.automaticEmptyTitle")
          }}
        </p>
        <p class="text-sm text-muted-foreground">
          {{
            currentEntries.length
              ? t("page.playlist.automaticNoMatches")
              : t("page.playlist.automaticEmptyDescription")
          }}
        </p>
      </div>
      <div
        v-else
        class="space-y-4 rounded-lg border bg-card p-6 text-card-foreground"
      >
        <p class="font-medium">{{ t("playlistTracks.emptyTitle") }}</p>
        <p class="text-sm text-muted-foreground">
          {{ t("playlistTracks.emptyDescription") }}
        </p>
        <Button :disabled="status === 'lost'" @click="addOpen = true">
          {{ t("playlistTracks.add") }}
        </Button>
      </div>
    </section>

    <PlaylistNameDialog
      v-if="!automatic"
      v-model:open="renameOpen"
      mode="rename"
      :initial-name="playlist.name"
      :pending="mutating"
      :error="actionError"
      @submit="rename"
    />
    <PlaylistDeleteDialog
      v-if="!automatic"
      v-model:open="deleteOpen"
      :name="playlist.name"
      :pending="mutating"
      @confirm="removePlaylist"
    />
    <AddTracksToPlaylistDialog
      v-if="!automatic"
      v-model:open="addOpen"
      :playlist="playlist"
    />
  </template>
  <section
    v-else
    role="status"
    class="space-y-4 rounded-lg border p-6 text-sm text-muted-foreground"
  >
    <p>{{ t("page.playlist.unavailable") }}</p>
    <Button as-child variant="outline">
      <NuxtLink to="/playlists">{{ t("page.playlist.back") }}</NuxtLink>
    </Button>
  </section>
</template>
