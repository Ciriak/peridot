<script setup lang="ts">
import { useI18n, useState } from "#imports";
import type {
  LikeTarget,
  PlaylistDetailResponse,
  LibrarySourceKind,
} from "@peridot/contracts";
import { Icon } from "@iconify/vue/offline";
import { Button } from "@peridot/ui/components/ui/button";
import { ScrollingText } from "@peridot/ui/components/ui/scrolling-text";
import {
  TooltipContent,
  TooltipPortal,
  TooltipProvider,
  TooltipRoot,
  TooltipTrigger,
} from "reka-ui";
import { useQueryClient } from "@tanstack/vue-query";
import { computed, ref } from "vue";
import { useCachedArtwork } from "../composables/use-cached-artwork";
import { useLikes } from "../composables/use-likes";
import { useLibraryPlayer } from "../composables/use-library-player";
import { useOfflineTracks } from "../composables/use-offline-tracks";
import { useQueryScope } from "../composables/use-query-scope";
import { useServer } from "../composables/use-server";
import { useServerConnection } from "../composables/use-server-connection";
import { useSession } from "../composables/use-session";
import { loadCollectionTracks } from "../lib/catalog-collections";
import type { CatalogCardItem } from "../lib/catalog-cards";
import { icons } from "../lib/icons";
import {
  albumRoute,
  artistRoute,
  trackAlbumTitleRoute,
  trackArtistNames,
  trackCoverUrl,
} from "../lib/library";
import { isTrackPlayable } from "../lib/offline-playback";
import {
  trackSearchResultType,
  type SearchResultType,
} from "../lib/search-results";
import { fetchPlaylist, isPeridotNetworkError } from "../lib/peridot-client";
import { playlistPlayableTracks } from "../lib/playlists";
import { queryKeys } from "../lib/query-keys";
import AlbumContextMenu from "./AlbumContextMenu.vue";
import FadeInImage from "./FadeInImage.vue";
import LikeButton from "./LikeButton.vue";
import PlaylistContextMenu from "./PlaylistContextMenu.vue";
import PlaylistCover from "./PlaylistCover.vue";
import SearchResultTag from "./SearchResultTag.vue";
import SearchSourceIcons from "./SearchSourceIcons.vue";
import TrackArtistLinks from "./TrackArtistLinks.vue";
import TrackContextMenu from "./TrackContextMenu.vue";

const props = withDefaults(
  defineProps<{
    item: CatalogCardItem;
    compact?: boolean;
    layout?: "card" | "row";
  }>(),
  { compact: false, layout: "card" },
);
const emit = defineEmits<{ open: [] }>();
const { t } = useI18n();
const { address } = useServer();
const { scope } = useQueryScope();
const { token } = useSession();
const queryClient = useQueryClient();
const {
  active,
  playing,
  loading,
  unavailableTrackIdSet,
  play,
  retryUnavailableTrack,
  toggleCollectionPlayback,
  togglePlayback,
  isPlaybackTargetActive,
} = useLibraryPlayer();
const { savedTracks, tracksMatching } = useOfflineTracks();
const { status: serverStatus } = useServerConnection();
const activePlaylistId = useState<string | null>(
  "player-active-playlist-id",
  () => null,
);
const {
  likedAlbumIds,
  likedTrackIds,
  loaded: likesLoaded,
  toggle: toggleLike,
  isPending: isLikePending,
} = useLikes();
const album = computed(() =>
  props.item.kind === "album" ? props.item.album : null,
);
const track = computed(() =>
  props.item.kind === "media" ? props.item.media : null,
);
const playlist = computed(() =>
  props.item.kind === "playlist" ? props.item.playlist : null,
);
const resultType = computed<SearchResultType>(() => {
  if (album.value) return "album";
  if (playlist.value) return "playlist";
  return trackSearchResultType(track.value!.mediaType);
});
const searchLibrarySourceKinds = computed<LibrarySourceKind[]>(() => {
  if (album.value) return album.value.sourceKinds ?? [];
  return track.value?.sourceKind ? [track.value.sourceKind] : [];
});
const playlistTarget = computed(() =>
  playlist.value ? { kind: "playlist" as const, id: playlist.value.id } : null,
);
const playlistActive = computed(() =>
  Boolean(playlist.value && activePlaylistId.value === playlist.value.id),
);
const playlistPlayable = computed(() =>
  Boolean(playlist.value?.availableTrackCount),
);
const playlistControlEnabled = computed(
  () => playlistPlayable.value || (playlistActive.value && playing.value),
);
const playlistPlaybackActive = computed(
  () =>
    Boolean(
      playlistTarget.value && isPlaybackTargetActive(playlistTarget.value),
    ) ||
    (playlistActive.value && playing.value),
);
const title = computed(() => {
  if (album.value) return album.value.title;
  if (track.value) return track.value.title;
  return playlist.value?.name ?? "";
});
const titleRoute = computed(() => {
  if (album.value) return albumRoute(album.value);
  if (track.value) {
    return (
      trackAlbumTitleRoute(track.value) ??
      artistRoute({ name: track.value.artist })
    );
  }
  return playlist.value ? `/playlists/${playlist.value.id}` : "/";
});
const openLabel = computed(() => {
  if (album.value) {
    return t("card.openAlbum", {
      album: album.value.title,
      artist: album.value.artist,
    });
  }
  if (track.value) {
    return t("card.openTrack", {
      track: track.value.title,
      artist: track.value.artist,
    });
  }
  return t("playlistCard.open", { playlist: title.value });
});
const coverSource = computed(() => {
  if (album.value) {
    return trackCoverUrl(address.value ?? "", album.value.coverUrl);
  }
  if (track.value) {
    return trackCoverUrl(address.value ?? "", track.value.coverUrl);
  }
  return null;
});
const {
  artworkUrl: coverImageUrl,
  failed: coverFailed,
  fromCache: coverFromCache,
} = useCachedArtwork(coverSource);
const playlistCoverUrls = computed(() =>
  (playlist.value?.coverUrls ?? []).flatMap((url) => {
    const resolved = trackCoverUrl(address.value ?? "", url);
    return resolved ? [resolved] : [];
  }),
);
const fallbackIcon = computed(() => (track.value ? icons.music : icons.album));
const artistNames = computed(() =>
  track.value ? trackArtistNames(track.value) : [],
);
const savedTrackIds = computed(
  () => new Set(savedTracks.value.map((saved) => saved.track.id)),
);
const albumActive = computed(() =>
  Boolean(album.value && active.value?.albumId === album.value.id),
);
const albumTarget = computed(() =>
  album.value ? { kind: "album" as const, id: album.value.id } : null,
);
const albumFullySaved = computed(() => {
  if (!album.value) return false;
  const savedCount = savedTracks.value.filter(
    (saved) => saved.track.albumId === album.value!.id,
  ).length;
  return (
    Boolean(album.value.trackCount) && savedCount >= album.value.trackCount
  );
});
const albumPlayable = computed(
  () =>
    Boolean(album.value?.trackCount) &&
    (albumFullySaved.value ||
      (serverStatus.value !== "lost" && Boolean(album.value?.available))),
);
const trackActive = computed(() =>
  Boolean(track.value && active.value?.id === track.value.id),
);
const trackPlayable = computed(
  () =>
    Boolean(track.value) &&
    isTrackPlayable(track.value!, {
      serverLost: serverStatus.value === "lost",
      savedTrackIds: savedTrackIds.value,
      unavailableTrackIds: unavailableTrackIdSet.value,
    }),
);
const playable = computed(() => {
  if (album.value) return albumPlayable.value;
  if (track.value) return trackPlayable.value;
  return playlistPlayable.value;
});
const activePlaying = computed(() => {
  if (album.value) return albumActive.value && playing.value;
  if (track.value) return trackActive.value && playing.value;
  return playlistActive.value && playing.value;
});
const controlEnabled = computed(() => {
  if (album.value) return albumPlayable.value || activePlaying.value;
  if (track.value) return trackPlayable.value || activePlaying.value;
  return playlistControlEnabled.value;
});
const playbackActive = computed(() => {
  if (albumTarget.value) {
    return (
      isPlaybackTargetActive(albumTarget.value) ||
      (albumActive.value && playing.value)
    );
  }
  if (track.value) return trackActive.value && playing.value;
  return playlistPlaybackActive.value;
});
const playLabel = computed(() => {
  if (playbackActive.value) {
    if (album.value) {
      return t("card.pauseAlbum", {
        album: album.value.title,
        artist: album.value.artist,
      });
    }
    if (track.value) {
      return t("quickPicks.pause", { title: track.value.title });
    }
    return t("playlistCard.pause", { playlist: title.value });
  }
  if (album.value) {
    return t("card.playAlbum", {
      album: album.value.title,
      artist: album.value.artist,
    });
  }
  if (track.value) {
    return activePlaying.value
      ? t("quickPicks.resume", { title: track.value.title })
      : t("quickPicks.playTrack", { title: track.value.title });
  }
  return t("playlistCard.play", { playlist: title.value });
});
const likeTarget = computed<LikeTarget | null>(() => {
  if (album.value) {
    return {
      kind: "album",
      albumId: album.value.id,
      title: album.value.title,
      artist: album.value.artist,
    };
  }
  if (track.value?.mediaType === "music") {
    return { kind: "media", mediaId: track.value.id };
  }
  return null;
});
const liked = computed(() => {
  if (album.value) {
    return likedAlbumIds.value.includes(album.value.id) || album.value.liked;
  }
  if (track.value) {
    return likesLoaded.value
      ? likedTrackIds.value.includes(track.value.id)
      : track.value.liked;
  }
  return false;
});
const menuComponent = computed(() => {
  if (album.value) return AlbumContextMenu;
  if (track.value) return TrackContextMenu;
  return PlaylistContextMenu;
});
const playlistActionError = ref<string | null>(null);
const menuBindings = computed(() => {
  if (album.value) return { album: album.value };
  if (track.value) {
    return { track: track.value, onPlay: toggleCardPlayback };
  }
  return {
    playlist: playlist.value!,
    controlEnabled: playlistControlEnabled.value,
    playbackActive: playlistPlaybackActive.value,
    onPlay: toggleCardPlayback,
    onActionError: (message: string) => {
      playlistActionError.value = message;
    },
  };
});

async function toggleAlbumPlayback(retryUnavailable = false) {
  if (!album.value || !albumTarget.value) return;
  if (
    albumActive.value &&
    playing.value &&
    !isPlaybackTargetActive(albumTarget.value)
  ) {
    togglePlayback();
    return;
  }
  try {
    await toggleCollectionPlayback(
      albumTarget.value,
      async () => {
        const saved = await tracksMatching(
          (candidate) => candidate.albumId === album.value!.id,
        );
        if (serverStatus.value === "lost" || !address.value || !token.value) {
          return saved;
        }
        try {
          return await loadCollectionTracks(address.value, token.value, {
            albumId: album.value!.id,
          });
        } catch (reason) {
          if (isPeridotNetworkError(reason)) return saved;
          throw reason;
        }
      },
      retryUnavailable,
    );
  } catch {
    // The shared player exposes playback failures.
  }
}

async function loadPlaylistDetail(): Promise<PlaylistDetailResponse | null> {
  if (!playlist.value || !scope.value || !token.value) return null;
  const key = queryKeys.playlist(scope.value, playlist.value.id);
  const cached = queryClient.getQueryData<PlaylistDetailResponse>(key);
  if (cached) return cached;
  if (serverStatus.value === "lost") return null;
  const playlistId = playlist.value.id;
  return queryClient.fetchQuery({
    queryKey: key,
    queryFn: () =>
      fetchPlaylist(scope.value!.serverAddress, token.value!, playlistId),
    meta: { persist: true },
  });
}

async function togglePlaylistPlayback(retryUnavailable = false) {
  if (!playlistTarget.value) return;
  if (
    playlistActive.value &&
    playing.value &&
    !isPlaybackTargetActive(playlistTarget.value)
  ) {
    togglePlayback();
    return;
  }
  try {
    await toggleCollectionPlayback(
      playlistTarget.value,
      async () => {
        const detail = await loadPlaylistDetail();
        if (!detail) return [];
        const savedIds = new Set(
          savedTracks.value.map((saved) => saved.track.id),
        );
        return playlistPlayableTracks(detail.entries, {
          serverLost: serverStatus.value === "lost",
          savedTrackIds: savedIds,
          unavailableTrackIds: retryUnavailable
            ? undefined
            : unavailableTrackIdSet.value,
        });
      },
      retryUnavailable,
    );
  } catch {
    // The shared player exposes playback failures.
  }
}

function toggleTrackPlayback() {
  if (!track.value) return;
  if (trackActive.value && playing.value) {
    togglePlayback();
    return;
  }
  if (trackPlayable.value) {
    play(track.value);
    return;
  }
  retryUnavailableTrack(track.value);
}

async function toggleCardPlayback() {
  if (album.value) {
    await toggleAlbumPlayback(!albumPlayable.value);
    return;
  }
  if (track.value) {
    toggleTrackPlayback();
    return;
  }
  await togglePlaylistPlayback(!playlistControlEnabled.value);
}

function toggleCardLike() {
  if (likeTarget.value) void toggleLike(likeTarget.value);
}
</script>

<template>
  <component :is="menuComponent" v-bind="menuBindings">
    <article
      :role="layout === 'row' ? 'listitem' : undefined"
      class="group relative min-w-0 text-card-foreground"
      :class="
        layout === 'row'
          ? 'flex min-h-14 items-center gap-2 px-2 py-1'
          : ['border bg-card', compact ? 'rounded-sm p-1' : 'rounded-lg p-3']
      "
    >
      <template v-if="layout === 'row'">
        <div class="group/catalog-cover relative size-10 shrink-0">
          <NuxtLink
            :to="titleRoute"
            class="block size-10 overflow-hidden rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            :aria-label="openLabel"
            @click="emit('open')"
          >
            <PlaylistCover
              v-if="playlist"
              :cover-urls="playlistCoverUrls"
              :kind="playlist.kind"
              compact
            />
            <div
              v-else
              aria-hidden="true"
              class="relative flex size-10 items-center justify-center overflow-hidden rounded-md bg-muted text-muted-foreground group-hover:text-foreground"
            >
              <Icon :icon="fallbackIcon" class="size-5" />
              <FadeInImage
                v-if="coverImageUrl && !coverFailed"
                :src="coverImageUrl"
                :fade-in="!coverFromCache"
                class="absolute inset-0"
                @error="coverFailed = true"
              />
            </div>
          </NuxtLink>
          <Button
            v-if="album || track"
            variant="ghost"
            size="icon-sm"
            class="absolute inset-0 size-full cursor-pointer rounded-md bg-background/70 opacity-0 transition-opacity hover:bg-background/70 hover:text-foreground focus-visible:opacity-100 group-hover/catalog-cover:opacity-100 group-focus-within/catalog-cover:opacity-100 dark:hover:bg-background/70"
            :aria-busy="(albumActive || trackActive) && loading"
            :aria-label="
              controlEnabled ? playLabel : t('trackTable.retryUnavailable')
            "
            @click.prevent.stop="toggleCardPlayback"
          >
            <Icon
              :icon="
                !controlEnabled
                  ? icons.cloudOff
                  : playbackActive
                    ? icons.pause
                    : icons.play
              "
              aria-hidden="true"
              class="text-foreground"
            />
          </Button>
        </div>
        <div class="min-w-0 flex-1">
          <div class="flex min-w-0 items-center gap-2">
            <NuxtLink
              :to="titleRoute"
              class="min-w-0 flex-1 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              :aria-label="openLabel"
              @click="emit('open')"
            >
              <h3 class="text-sm font-medium">
                <ScrollingText
                  class="w-full"
                  :class="!playable && 'opacity-60'"
                  :title="
                    !playable ? t('trackTable.unavailableTitle') : undefined
                  "
                  >{{ title }}</ScrollingText
                >
              </h3>
            </NuxtLink>
            <SearchResultTag class="shrink-0" :type="resultType" />
          </div>
          <ScrollingText class="w-full text-xs text-muted-foreground">
            <template v-if="album">
              <TrackArtistLinks :artists="album.artists" /> ·
              {{
                t("count.track", { count: album.trackCount }, album.trackCount)
              }}
            </template>
            <TrackArtistLinks v-else-if="track" :artists="artistNames" />
            <template v-else-if="playlist">
              {{
                t(
                  "count.track",
                  { count: playlist.trackCount },
                  playlist.trackCount,
                )
              }}
            </template>
          </ScrollingText>
        </div>
        <div class="ml-auto flex shrink-0 items-center gap-2">
          <SearchSourceIcons :source-kinds="searchLibrarySourceKinds" />
          <TooltipProvider v-if="playlist" :delay-duration="150">
            <TooltipRoot :disabled="controlEnabled">
              <TooltipTrigger as-child>
                <Button
                  variant="default"
                  size="icon-sm"
                  class="shrink-0 rounded-full shadow-sm"
                  :class="
                    !controlEnabled &&
                    'bg-muted text-muted-foreground hover:bg-muted'
                  "
                  :aria-busy="trackActive && loading"
                  :aria-label="
                    controlEnabled
                      ? playLabel
                      : t('trackTable.retryUnavailable')
                  "
                  @click.prevent.stop="toggleCardPlayback"
                >
                  <Icon
                    :icon="
                      !controlEnabled
                        ? icons.cloudOff
                        : playbackActive
                          ? icons.pause
                          : icons.play
                    "
                    aria-hidden="true"
                    class="size-4"
                  />
                </Button>
              </TooltipTrigger>
              <TooltipPortal>
                <TooltipContent
                  v-if="!controlEnabled"
                  :side-offset="6"
                  class="z-50 rounded-md border bg-popover px-3 py-2 text-sm text-popover-foreground shadow-md"
                >
                  {{ t("trackTable.unavailable") }}
                </TooltipContent>
              </TooltipPortal>
            </TooltipRoot>
          </TooltipProvider>
          <LikeButton
            v-if="likeTarget"
            class="shrink-0"
            compact
            :liked="liked"
            :label="title"
            :pending="isLikePending(likeTarget)"
            :disabled="!likesLoaded"
            @toggle="toggleCardLike"
          />
        </div>
      </template>

      <template v-else>
        <div :class="compact ? 'space-y-1' : 'space-y-3'">
          <div class="relative">
            <NuxtLink
              :to="titleRoute"
              class="block rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              :aria-label="openLabel"
              @click="emit('open')"
            >
              <PlaylistCover
                v-if="playlist"
                :cover-urls="playlistCoverUrls"
                :kind="playlist.kind"
              />
              <div
                v-else
                aria-hidden="true"
                class="relative flex aspect-square items-center justify-center overflow-hidden rounded-md bg-muted text-muted-foreground group-hover:text-foreground"
              >
                <Icon
                  :icon="fallbackIcon"
                  :class="compact ? 'size-4' : 'size-10'"
                />
                <FadeInImage
                  v-if="coverImageUrl && !coverFailed"
                  :src="coverImageUrl"
                  :fade-in="!coverFromCache"
                  class="absolute inset-0"
                  @error="coverFailed = true"
                />
              </div>
            </NuxtLink>
            <TooltipProvider :delay-duration="150">
              <TooltipRoot :disabled="controlEnabled">
                <TooltipTrigger as-child>
                  <Button
                    variant="default"
                    :size="compact ? 'icon-sm' : 'icon'"
                    class="pointer-events-none absolute z-10 cursor-pointer rounded-full opacity-0 shadow-md transition-opacity group-hover:pointer-events-auto group-hover:opacity-100 focus-visible:pointer-events-auto focus-visible:opacity-100 max-sm:pointer-events-auto max-sm:size-11 max-sm:opacity-100"
                    :class="[
                      compact ? 'bottom-1 right-1' : 'bottom-2 right-2',
                      !controlEnabled &&
                        'bg-muted text-muted-foreground hover:bg-muted',
                    ]"
                    :aria-busy="trackActive && loading"
                    :aria-label="
                      controlEnabled
                        ? playLabel
                        : t('trackTable.retryUnavailable')
                    "
                    @click.prevent.stop="toggleCardPlayback"
                  >
                    <Icon
                      :icon="
                        !controlEnabled
                          ? icons.cloudOff
                          : playbackActive
                            ? icons.pause
                            : icons.play
                      "
                      aria-hidden="true"
                      :class="
                        compact
                          ? 'size-4 max-sm:size-5'
                          : 'size-5 max-sm:size-6'
                      "
                    />
                  </Button>
                </TooltipTrigger>
                <TooltipPortal>
                  <TooltipContent
                    v-if="!controlEnabled"
                    :side-offset="6"
                    class="z-50 rounded-md border bg-popover px-3 py-2 text-sm text-popover-foreground shadow-md"
                  >
                    {{ t("trackTable.unavailable") }}
                  </TooltipContent>
                </TooltipPortal>
              </TooltipRoot>
            </TooltipProvider>
          </div>
          <div class="min-w-0 flex-1" :class="compact ? 'pr-6' : 'pr-12'">
            <NuxtLink
              :to="titleRoute"
              class="block rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              :aria-label="openLabel"
              @click="emit('open')"
            >
              <h3 :class="compact ? 'text-xs' : 'text-sm'" class="font-medium">
                <ScrollingText
                  class="w-full"
                  :class="!playable && 'opacity-60'"
                  :title="
                    !playable ? t('trackTable.unavailableTitle') : undefined
                  "
                  >{{ title }}</ScrollingText
                >
              </h3>
            </NuxtLink>
            <ScrollingText class="w-full text-xs text-muted-foreground">
              <template v-if="album">
                <TrackArtistLinks :artists="album.artists" /> ·
                {{
                  t(
                    "count.track",
                    { count: album.trackCount },
                    album.trackCount,
                  )
                }}
              </template>
              <TrackArtistLinks v-else-if="track" :artists="artistNames" />
              <template v-else-if="playlist">
                {{
                  t(
                    "count.track",
                    { count: playlist.trackCount },
                    playlist.trackCount,
                  )
                }}
                <template
                  v-if="playlist.availableTrackCount < playlist.trackCount"
                >
                  ·
                  {{
                    t("playlistCard.unavailableCount", {
                      count: playlist.trackCount - playlist.availableTrackCount,
                    })
                  }}
                </template>
              </template>
            </ScrollingText>
          </div>
        </div>
        <LikeButton
          v-if="likeTarget"
          class="absolute"
          :class="compact ? 'bottom-0 right-0' : 'bottom-1 right-1'"
          :compact="compact"
          :liked="liked"
          :label="title"
          :pending="isLikePending(likeTarget)"
          :disabled="!likesLoaded"
          @toggle="toggleCardLike"
        />
      </template>
      <p
        v-if="playlistActionError && layout === 'card'"
        role="alert"
        class="mt-2 line-clamp-2 text-xs text-destructive"
      >
        {{ playlistActionError }}
      </p>
    </article>
  </component>
</template>
