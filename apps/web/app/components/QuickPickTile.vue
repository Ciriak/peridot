<script setup lang="ts">
import { useI18n } from "#imports";
import { type ResolvedQuickPickItem } from "../lib/quick-picks";
import { computed } from "vue";
import { useLibraryPlayer } from "../composables/use-library-player";
import { useOfflineTracks } from "../composables/use-offline-tracks";
import { useServer } from "../composables/use-server";
import { useServerConnection } from "../composables/use-server-connection";
import { useSession } from "../composables/use-session";
import { trackCoverUrl } from "../lib/library";
import { loadCollectionTracks } from "../lib/catalog-collections";
import { isTrackPlayable } from "../lib/offline-playback";
import AlbumContextMenu from "./AlbumContextMenu.vue";
import QuickPickTileContent from "./QuickPickTileContent.vue";
import TrackContextMenu from "./TrackContextMenu.vue";

const props = defineProps<{ item: ResolvedQuickPickItem }>();
const { t } = useI18n();
const { address } = useServer();
const { status: serverStatus } = useServerConnection();
const { token } = useSession();
const { active, playing, loading, play, playCollection, togglePlayback } =
  useLibraryPlayer();
const { savedTracks, tracksMatching } = useOfflineTracks();
const savedTrackIds = computed(
  () => new Set(savedTracks.value.map((saved) => saved.track.id)),
);
const coverUrl = computed(() =>
  trackCoverUrl(
    address.value ?? "",
    props.item.kind === "track"
      ? props.item.track.coverUrl
      : props.item.album.coverUrl,
  ),
);
const title = computed(() =>
  props.item.kind === "track" ? props.item.track.title : props.item.album.title,
);
const activeItem = computed(() => {
  const activeTrackId = active.value?.id;
  if (!activeTrackId) return false;
  return props.item.kind === "track"
    ? activeTrackId === props.item.track.id
    : active.value?.albumId === props.item.album.id;
});
const playable = computed(() => {
  const item = props.item;
  if (item.kind === "track") {
    return isTrackPlayable(item.track, {
      serverLost: serverStatus.value === "lost",
      savedTrackIds: savedTrackIds.value,
    });
  }
  if (serverStatus.value !== "lost") return Boolean(item.album.trackCount);
  return savedTracks.value.some(
    (saved) => saved.track.albumId === item.album.id,
  );
});
const playLabel = computed(() => {
  if (activeItem.value) {
    if (playing.value) {
      return t("quickPicks.pause", { title: title.value });
    }
    return props.item.kind === "album"
      ? t("quickPicks.playAlbum", { title: title.value })
      : t("quickPicks.resume", { title: title.value });
  }
  return props.item.kind === "album"
    ? t("quickPicks.playAlbum", { title: title.value })
    : t("quickPicks.playTrack", { title: title.value });
});

async function albumTracks() {
  if (!address.value || !token.value || props.item.kind !== "album") return [];
  const album = props.item.album;
  if (serverStatus.value === "lost") {
    return tracksMatching((track) => track.albumId === album.id);
  }
  return loadCollectionTracks(address.value, token.value, {
    albumId: album.id,
  });
}

async function toggleItemPlayback() {
  if (!playable.value) return;
  if (activeItem.value && playing.value) {
    togglePlayback();
    return;
  }
  if (props.item.kind === "track") {
    play(props.item.track);
    return;
  }
  playCollection(await albumTracks());
}
</script>

<template>
  <TrackContextMenu
    v-if="item.kind === 'track'"
    :track="item.track"
    @play="toggleItemPlayback"
  >
    <QuickPickTileContent
      :item="item"
      :cover-url="coverUrl"
      :active-item="activeItem"
      :playing="playing"
      :play-label="playLabel"
      :busy="activeItem && loading"
      :playable="playable"
      @play="toggleItemPlayback"
    />
  </TrackContextMenu>
  <AlbumContextMenu v-else :album="item.album">
    <QuickPickTileContent
      :item="item"
      :cover-url="coverUrl"
      :active-item="activeItem"
      :playing="playing"
      :play-label="playLabel"
      :busy="activeItem && loading"
      :playable="playable"
      @play="toggleItemPlayback"
    />
  </AlbumContextMenu>
</template>
