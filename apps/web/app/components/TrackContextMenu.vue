<script setup lang="ts">
import type {
  ApplyTrackMetadataRequest,
  MetadataCandidateResponse,
  TrackResponse,
} from "@peridot/contracts";
import { Icon } from "@iconify/vue/offline";
import { Button } from "@peridot/ui/components/ui/button";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuLabel,
  ContextMenuSeparator,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuTrigger,
} from "@peridot/ui/components/ui/context-menu";
import { Input } from "@peridot/ui/components/ui/input";
import {
  DialogContent,
  DialogDescription,
  DialogOverlay,
  DialogPortal,
  DialogRoot,
  DialogTitle,
} from "reka-ui";
import { computed, ref } from "vue";
import { useLikes } from "../composables/use-likes";
import { useLibraryPlayer } from "../composables/use-library-player";
import { useLibraryTracks } from "../composables/use-library-tracks";
import { useServer } from "../composables/use-server";
import { useSession } from "../composables/use-session";
import { icons } from "../lib/icons";
import { artistRoute, trackAlbumRoute, trackArtistNames } from "../lib/library";
import {
  applyTrackMetadata,
  listMetadataCandidates,
  revertTrackMetadata,
} from "../lib/peridot-client";
import {
  notifyAddedToQueue,
  notifyMetadataMatched,
  notifyMetadataReverted,
  notifyMetadataUpdateFailed,
} from "../lib/toasts";

const props = defineProps<{ track: TrackResponse }>();
const emit = defineEmits<{ play: [] }>();
const { addToQueue, downloadTrack, queueLoaded } = useLibraryPlayer();
const { reload: reloadLibraryTracks } = useLibraryTracks();
const { address } = useServer();
const { token } = useSession();
const {
  likedTrackIds,
  loaded: likesLoaded,
  toggle: toggleLike,
  isPending: isLikePending,
} = useLikes();
const downloading = ref(false);
const addingToQueue = ref(false);
const metadataOpen = ref(false);
const metadataQuery = ref("");
const candidates = ref<MetadataCandidateResponse[]>([]);
const metadataLoading = ref(false);
const metadataError = ref("");
const applyingMetadataId = ref("");
const revertingMetadata = ref(false);
const artists = computed(() => trackArtistNames(props.track));
const albumRouteValue = computed(() =>
  props.track.album?.trim() && artists.value.length
    ? trackAlbumRoute(props.track)
    : null,
);

async function download() {
  if (downloading.value) return;
  downloading.value = true;
  try {
    await downloadTrack(props.track.id);
  } finally {
    downloading.value = false;
  }
}

async function addNext() {
  if (addingToQueue.value) return;
  addingToQueue.value = true;
  try {
    if (await addToQueue(props.track.id)) notifyAddedToQueue(props.track.title);
  } finally {
    addingToQueue.value = false;
  }
}

async function openMetadataDialog() {
  metadataOpen.value = true;
  metadataQuery.value = "";
  await searchMetadata();
}

async function searchMetadata() {
  metadataLoading.value = true;
  metadataError.value = "";
  try {
    const result = await listMetadataCandidates(
      address.value ?? "",
      token.value ?? "",
      props.track.id,
      metadataQuery.value || undefined,
    );
    candidates.value = result.items;
  } catch (reason) {
    candidates.value = [];
    metadataError.value =
      reason instanceof Error
        ? reason.message
        : "Could not search for metadata matches.";
  } finally {
    metadataLoading.value = false;
  }
}

async function chooseMetadata(candidate: MetadataCandidateResponse) {
  applyingMetadataId.value = candidate.recordingId;
  metadataError.value = "";
  const body: ApplyTrackMetadataRequest = {
    providerId: candidate.providerId,
    recordingId: candidate.recordingId,
    releaseId: candidate.releaseId,
    title: candidate.title,
    artist: candidate.artist,
    artists: candidate.artists,
    album: candidate.album,
    discNumber: candidate.discNumber,
    trackNumber: candidate.trackNumber,
  };
  try {
    await applyTrackMetadata(
      address.value ?? "",
      token.value ?? "",
      props.track.id,
      body,
    );
    metadataOpen.value = false;
    notifyMetadataMatched(props.track.title);
    await reloadLibraryTracks();
  } catch (reason) {
    metadataError.value =
      reason instanceof Error
        ? reason.message
        : "Could not apply this metadata match.";
  } finally {
    applyingMetadataId.value = "";
  }
}

async function revertMetadata() {
  revertingMetadata.value = true;
  try {
    await revertTrackMetadata(
      address.value ?? "",
      token.value ?? "",
      props.track.id,
    );
    notifyMetadataReverted(props.track.title);
    await reloadLibraryTracks();
  } catch (reason) {
    notifyMetadataUpdateFailed(
      props.track.title,
      reason instanceof Error
        ? reason.message
        : "Could not restore the file metadata.",
    );
  } finally {
    revertingMetadata.value = false;
  }
}
</script>

<template>
  <ContextMenu>
    <ContextMenuTrigger as-child>
      <slot />
    </ContextMenuTrigger>
    <ContextMenuContent class="w-56">
      <ContextMenuLabel class="truncate">{{ track.title }}</ContextMenuLabel>
      <ContextMenuSeparator />
      <ContextMenuItem @select="emit('play')">
        <Icon :icon="icons.play" aria-hidden="true" />
        Play
      </ContextMenuItem>
      <ContextMenuItem
        :disabled="!queueLoaded || addingToQueue"
        @select="addNext"
      >
        <Icon :icon="icons.addToQueue" aria-hidden="true" />
        {{ addingToQueue ? "Adding…" : "Add to queue" }}
      </ContextMenuItem>
      <ContextMenuItem
        :disabled="
          !likesLoaded || isLikePending({ kind: 'track', trackId: track.id })
        "
        @select="toggleLike({ kind: 'track', trackId: track.id })"
      >
        <Icon
          :icon="
            likedTrackIds.includes(track.id) ? icons.heartFilled : icons.heart
          "
          aria-hidden="true"
        />
        {{ likedTrackIds.includes(track.id) ? "Unlike" : "Like" }}
      </ContextMenuItem>
      <ContextMenuItem :disabled="downloading" @select="download">
        <Icon :icon="icons.download" aria-hidden="true" />
        {{ downloading ? "Downloading…" : "Download" }}
      </ContextMenuItem>
      <ContextMenuSeparator />
      <ContextMenuItem v-if="albumRouteValue" as-child>
        <NuxtLink :to="albumRouteValue">
          <Icon :icon="icons.music" aria-hidden="true" />
          Go to album
        </NuxtLink>
      </ContextMenuItem>
      <ContextMenuItem v-else disabled>
        <Icon :icon="icons.music" aria-hidden="true" />
        Go to album
      </ContextMenuItem>
      <ContextMenuItem v-if="artists.length === 1" as-child>
        <NuxtLink :to="artistRoute({ name: artists[0]! })">
          <Icon :icon="icons.user" aria-hidden="true" />
          Go to artist
        </NuxtLink>
      </ContextMenuItem>
      <ContextMenuSub v-else-if="artists.length > 1">
        <ContextMenuSubTrigger>
          <Icon :icon="icons.user" aria-hidden="true" />
          Go to artists
          <Icon :icon="icons.caretRight" aria-hidden="true" class="ml-auto" />
        </ContextMenuSubTrigger>
        <ContextMenuSubContent>
          <ContextMenuItem v-for="artist in artists" :key="artist" as-child>
            <NuxtLink :to="artistRoute({ name: artist })">
              <Icon :icon="icons.user" aria-hidden="true" />
              {{ artist }}
            </NuxtLink>
          </ContextMenuItem>
        </ContextMenuSubContent>
      </ContextMenuSub>
      <ContextMenuItem v-else disabled>
        <Icon :icon="icons.user" aria-hidden="true" />
        Go to artist
      </ContextMenuItem>
      <ContextMenuSeparator />
      <ContextMenuLabel v-if="track.metadata" class="text-xs">
        Matched with {{ track.metadata.providerName }}
      </ContextMenuLabel>
      <ContextMenuItem v-if="track.metadata" as-child>
        <a :href="track.metadata.sourceUrl" target="_blank" rel="noreferrer">
          <Icon :icon="icons.plugins" aria-hidden="true" />
          View metadata source
        </a>
      </ContextMenuItem>
      <ContextMenuItem @select="openMetadataDialog">
        <Icon :icon="icons.search" aria-hidden="true" />
        {{ track.metadata ? "Correct metadata match…" : "Match metadata…" }}
      </ContextMenuItem>
      <ContextMenuItem
        v-if="track.metadata"
        :disabled="revertingMetadata"
        @select="revertMetadata"
      >
        <Icon :icon="icons.restart" aria-hidden="true" />
        {{ revertingMetadata ? "Restoring…" : "Use file metadata" }}
      </ContextMenuItem>
    </ContextMenuContent>
  </ContextMenu>

  <DialogRoot v-model:open="metadataOpen">
    <DialogPortal>
      <DialogOverlay class="fixed inset-0 z-50 bg-background/80" />
      <DialogContent
        class="fixed left-1/2 top-1/2 z-50 max-h-svh w-full max-w-2xl -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-lg border bg-card p-6 text-card-foreground shadow-lg"
      >
        <DialogTitle class="text-lg font-semibold">
          Match metadata
        </DialogTitle>
        <DialogDescription class="mt-1 text-sm text-muted-foreground">
          Search MusicBrainz and choose the release metadata for
          {{ track.title }}.
        </DialogDescription>
        <form class="mt-4 flex gap-2" @submit.prevent="searchMetadata">
          <Input
            v-model="metadataQuery"
            type="search"
            aria-label="Search MusicBrainz"
            placeholder="Track or artist"
            class="min-w-0 flex-1"
          />
          <Button type="submit" :disabled="metadataLoading">
            <Icon :icon="icons.search" aria-hidden="true" class="size-4" />
            {{ metadataLoading ? "Searching…" : "Search" }}
          </Button>
        </form>
        <p
          v-if="metadataError"
          role="alert"
          class="mt-4 text-sm text-destructive"
        >
          {{ metadataError }}
        </p>
        <ul v-if="candidates.length" class="mt-4 space-y-2">
          <li
            v-for="candidate in candidates"
            :key="`${candidate.providerId}:${candidate.recordingId}:${candidate.releaseId ?? ''}`"
            class="flex items-center gap-3 rounded-md border p-3"
          >
            <div class="min-w-0 flex-1">
              <p class="truncate text-sm font-medium">{{ candidate.title }}</p>
              <p class="truncate text-sm text-muted-foreground">
                {{ candidate.artist }}
                <template v-if="candidate.album">
                  · {{ candidate.album }}
                </template>
              </p>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              :disabled="applyingMetadataId === candidate.recordingId"
              @click="chooseMetadata(candidate)"
            >
              {{
                applyingMetadataId === candidate.recordingId
                  ? "Applying…"
                  : "Use match"
              }}
            </Button>
          </li>
        </ul>
        <p
          v-else-if="!metadataLoading && !metadataError"
          class="mt-4 text-sm text-muted-foreground"
        >
          No matching recordings were found.
        </p>
        <div class="mt-6 flex justify-end">
          <Button type="button" variant="outline" @click="metadataOpen = false">
            Close
          </Button>
        </div>
      </DialogContent>
    </DialogPortal>
  </DialogRoot>
</template>
