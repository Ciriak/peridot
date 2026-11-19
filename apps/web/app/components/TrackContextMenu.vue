<script setup lang="ts">
import { useI18n } from "#imports";
import type {
  ApplyTrackMetadataRequest,
  MetadataCandidateResponse,
  TrackResponse,
} from "@peridot/contracts";
import { Icon } from "@iconify/vue/offline";
import { Badge } from "@peridot/ui/components/ui/badge";
import { Button } from "@peridot/ui/components/ui/button";
import { ScrollingText } from "@peridot/ui/components/ui/scrolling-text";
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
import { ProgressCircle } from "@peridot/ui/components/ui/progress-circle";
import { useQueryClient } from "@tanstack/vue-query";
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
import { useCatalogRevision } from "../composables/use-catalog-query";
import { useLocalizedMessage } from "../composables/use-localized-message";
import { useOfflineTracks } from "../composables/use-offline-tracks";
import { useQueryScope } from "../composables/use-query-scope";
import { useServer } from "../composables/use-server";
import { useServerConnection } from "../composables/use-server-connection";
import { useSession } from "../composables/use-session";
import { icons } from "../lib/icons";
import { artistRoute, trackAlbumRoute, trackArtistNames } from "../lib/library";
import { isTrackPlayable } from "../lib/offline-playback";
import { queryKeys } from "../lib/query-keys";
import {
  applyTrackMetadata,
  isAuthenticationRedirectError,
  listMetadataCandidates,
  revertTrackMetadata,
} from "../lib/peridot-client";
import {
  notifyAddedToQueue,
  notifyMetadataMatched,
  notifyMetadataReverted,
  notifyMetadataUpdateFailed,
  notifyOfflineTrackFailed,
  notifyOfflineTrackSaved,
} from "../lib/toasts";
import AddTrackToPlaylistDialog from "./AddTrackToPlaylistDialog.vue";
import DownloadProgressTooltip from "./DownloadProgressTooltip.vue";

const props = defineProps<{ track: TrackResponse }>();
const emit = defineEmits<{ play: [] }>();
const { t } = useI18n();
const { translate, errorMessage } = useLocalizedMessage();
const { addToQueue, downloadTrack, queueLoaded } = useLibraryPlayer();
const { invalidate: invalidateCatalog } = useCatalogRevision();
const { address } = useServer();
const { scope } = useQueryScope();
const queryClient = useQueryClient();
const { status: serverStatus } = useServerConnection();
const serverLost = computed(() => serverStatus.value === "lost");
const {
  savedTracks,
  canSave: canSaveOffline,
  error: offlineError,
  isSaved: isSavedOffline,
  isPending: isOfflinePending,
  progressFor: offlineProgressFor,
  save: saveOffline,
  remove: removeOffline,
} = useOfflineTracks();
const playable = computed(() =>
  isTrackPlayable(props.track, {
    serverLost: serverLost.value,
    savedTrackIds: new Set(savedTracks.value.map((saved) => saved.track.id)),
  }),
);
const { token } = useSession();
const {
  likedTrackIds,
  loaded: likesLoaded,
  toggle: toggleLike,
  isPending: isLikePending,
} = useLikes();
const downloading = ref(false);
const addingToQueue = ref(false);
const playlistOpen = ref(false);
const metadataOpen = ref(false);
const metadataQuery = ref("");
const candidates = ref<MetadataCandidateResponse[]>([]);
const metadataLoading = ref(false);
const metadataError = ref("");
const applyingMetadataId = ref("");
const revertingMetadata = ref(false);
const artists = computed(() => trackArtistNames(props.track));
const music = computed(() => props.track.mediaType === "music");
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

async function toggleOffline() {
  if (isOfflinePending(props.track.id)) return;
  if (isSavedOffline(props.track.id)) {
    const removed = await removeOffline(props.track.id);
    if (!removed) {
      notifyOfflineTrackFailed(
        props.track.title,
        offlineError.value ?? t("error.apiUnavailable"),
      );
    }
    return;
  }
  if (await saveOffline(props.track)) {
    notifyOfflineTrackSaved(props.track.title);
  } else {
    notifyOfflineTrackFailed(
      props.track.title,
      offlineError.value ?? t("error.apiUnavailable"),
    );
  }
}

function offlineActionLabel(): string {
  if (isOfflinePending(props.track.id) && !isSavedOffline(props.track.id)) {
    return t("context.makingAvailableOffline");
  }
  return isSavedOffline(props.track.id)
    ? t("context.removeOfflineCopy")
    : t("context.makeAvailableOffline");
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
    if (!scope.value || !token.value) {
      throw new Error("Peridot query scope is unavailable.");
    }
    const queryValue = metadataQuery.value || undefined;
    const result = await queryClient.fetchQuery({
      queryKey: queryKeys.metadataCandidates(
        scope.value,
        props.track.id,
        queryValue,
      ),
      queryFn: () =>
        listMetadataCandidates(
          scope.value!.serverAddress,
          token.value!,
          props.track.id,
          queryValue,
        ),
      staleTime: 0,
      meta: { persist: false },
    });
    candidates.value = result.items;
  } catch (reason) {
    candidates.value = [];
    if (isAuthenticationRedirectError(reason)) return;
    metadataError.value = errorMessage(
      reason,
      "components.metadata.searchError",
    );
  } finally {
    metadataLoading.value = false;
  }
}

async function chooseMetadata(candidate: MetadataCandidateResponse) {
  applyingMetadataId.value = candidate.externalTrackId;
  metadataError.value = "";
  const body: ApplyTrackMetadataRequest = {
    providerId: candidate.providerId,
    externalTrackId: candidate.externalTrackId,
    externalReleaseId: candidate.externalReleaseId,
    title: candidate.title,
    artist: candidate.artist,
    artists: candidate.artists,
    albumArtists: candidate.albumArtists,
    album: candidate.album,
    genres: candidate.genres,
    discNumber: candidate.discNumber,
    trackNumber: candidate.trackNumber,
    sourceUrl: candidate.sourceUrl,
    details: candidate.details,
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
    invalidateCatalog();
  } catch (reason) {
    if (isAuthenticationRedirectError(reason)) return;
    metadataError.value = errorMessage(
      reason,
      "components.metadata.applyError",
    );
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
    invalidateCatalog();
  } catch (reason) {
    if (isAuthenticationRedirectError(reason)) return;
    notifyMetadataUpdateFailed(
      props.track.title,
      errorMessage(reason, "components.metadata.restoreError"),
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
      <ContextMenuLabel>
        <ScrollingText class="w-full">{{ track.title }}</ScrollingText>
      </ContextMenuLabel>
      <ContextMenuSeparator />
      <ContextMenuItem :disabled="!playable" @select="emit('play')">
        <Icon :icon="icons.play" aria-hidden="true" />
        {{ t("context.play") }}
      </ContextMenuItem>
      <ContextMenuItem
        :disabled="!playable || !queueLoaded || addingToQueue"
        @select="addNext"
      >
        <Icon :icon="icons.addToQueue" aria-hidden="true" />
        {{ addingToQueue ? t("common.adding") : t("context.addToQueue") }}
      </ContextMenuItem>
      <ContextMenuItem :disabled="serverLost" @select="playlistOpen = true">
        <Icon :icon="icons.plus" aria-hidden="true" />
        {{ t("context.addToPlaylist") }}
      </ContextMenuItem>
      <ContextMenuItem
        v-if="music"
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
        {{
          likedTrackIds.includes(track.id)
            ? t("context.unlike")
            : t("context.like")
        }}
      </ContextMenuItem>
      <DownloadProgressTooltip
        :active="isOfflinePending(track.id) && !isSavedOffline(track.id)"
        :label="offlineActionLabel()"
        :progress="offlineProgressFor(track.id) ?? null"
        :title="track.title"
        type="track"
      >
        <ContextMenuItem
          :disabled="
            isOfflinePending(track.id) ||
            (!isSavedOffline(track.id) && (!canSaveOffline || !track.available))
          "
          :aria-busy="isOfflinePending(track.id)"
          @select="toggleOffline"
        >
          <ProgressCircle
            v-if="isOfflinePending(track.id) && !isSavedOffline(track.id)"
            :value="offlineProgressFor(track.id) ?? null"
            :label="offlineActionLabel()"
            size="sm"
          />
          <Icon
            v-else
            :icon="
              isSavedOffline(track.id) ? icons.cloudCheck : icons.cloudDownload
            "
            aria-hidden="true"
          />
          {{ offlineActionLabel() }}
        </ContextMenuItem>
      </DownloadProgressTooltip>
      <ContextMenuItem
        :disabled="downloading || serverLost || !track.available"
        @select="download"
      >
        <Icon :icon="icons.download" aria-hidden="true" />
        {{ downloading ? t("common.downloading") : t("common.download") }}
      </ContextMenuItem>
      <ContextMenuSeparator />
      <ContextMenuItem v-if="albumRouteValue" as-child>
        <NuxtLink :to="albumRouteValue">
          <Icon :icon="icons.album" aria-hidden="true" />
          {{
            t(
              track.mediaType === "audiobook"
                ? "context.goToAudiobook"
                : track.mediaType === "podcast"
                  ? "context.goToPodcast"
                  : "context.goToAlbum",
            )
          }}
        </NuxtLink>
      </ContextMenuItem>
      <ContextMenuItem v-else-if="music" disabled>
        <Icon :icon="icons.album" aria-hidden="true" />
        {{ t("context.goToAlbum") }}
      </ContextMenuItem>
      <ContextMenuItem v-if="music && artists.length === 1" as-child>
        <NuxtLink :to="artistRoute({ name: artists[0]! })">
          <Icon :icon="icons.user" aria-hidden="true" />
          {{ t("context.goToArtist") }}
        </NuxtLink>
      </ContextMenuItem>
      <ContextMenuSub v-else-if="music && artists.length > 1">
        <ContextMenuSubTrigger>
          <Icon :icon="icons.user" aria-hidden="true" />
          {{ t("context.goToArtists") }}
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
      <ContextMenuItem v-else-if="music" disabled>
        <Icon :icon="icons.user" aria-hidden="true" />
        {{ t("context.goToArtist") }}
      </ContextMenuItem>
      <ContextMenuSeparator />
      <ContextMenuLabel v-if="music && track.metadata" class="text-xs">
        {{
          t("context.matchedWith", { provider: track.metadata.providerName })
        }}
      </ContextMenuLabel>
      <ContextMenuLabel
        v-if="music && track.metadata?.details.length"
        class="truncate text-xs"
      >
        {{
          track.metadata.details
            .slice(0, 2)
            .map(
              (detail) => `${translate(detail.labelMessage)}: ${detail.value}`,
            )
            .join(" · ")
        }}
      </ContextMenuLabel>
      <ContextMenuLabel
        v-if="music && track.genres.length"
        class="truncate text-xs"
      >
        {{ t("context.genres", { genres: track.genres.join(", ") }) }}
      </ContextMenuLabel>
      <ContextMenuItem v-if="music && track.metadata" as-child>
        <a :href="track.metadata.sourceUrl" target="_blank" rel="noreferrer">
          <Icon :icon="icons.externalLink" aria-hidden="true" />
          {{ t("context.viewMetadataSource") }}
        </a>
      </ContextMenuItem>
      <ContextMenuItem
        v-if="music"
        :disabled="serverLost"
        @select="openMetadataDialog"
      >
        <Icon :icon="icons.search" aria-hidden="true" />
        {{
          track.metadata
            ? t("context.metadataCorrect")
            : t("context.metadataMatch")
        }}
      </ContextMenuItem>
      <ContextMenuItem
        v-if="music && track.metadata"
        :disabled="revertingMetadata || serverLost"
        @select="revertMetadata"
      >
        <Icon :icon="icons.restart" aria-hidden="true" />
        {{
          revertingMetadata
            ? t("context.metadataRestoring")
            : t("context.metadataRestore")
        }}
      </ContextMenuItem>
    </ContextMenuContent>
  </ContextMenu>

  <AddTrackToPlaylistDialog v-model:open="playlistOpen" :track="track" />

  <DialogRoot v-model:open="metadataOpen">
    <DialogPortal>
      <DialogOverlay class="fixed inset-0 z-50 bg-background/80" />
      <DialogContent
        class="fixed left-1/2 top-1/2 z-50 max-h-svh w-full max-w-2xl -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-lg border bg-card p-6 text-card-foreground shadow-lg"
      >
        <DialogTitle class="text-lg font-semibold">
          {{ t("context.metadataDialogTitle") }}
        </DialogTitle>
        <DialogDescription class="mt-1 text-sm text-muted-foreground">
          {{ t("context.metadataDialogDescription", { track: track.title }) }}
        </DialogDescription>
        <form class="mt-4 flex gap-2" @submit.prevent="searchMetadata">
          <Input
            v-model="metadataQuery"
            type="search"
            :aria-label="t('context.metadataSearchLabel')"
            :placeholder="t('context.metadataSearchPlaceholder')"
            class="min-w-0 flex-1"
          />
          <Button type="submit" :disabled="metadataLoading">
            <Icon :icon="icons.search" aria-hidden="true" class="size-4" />
            {{ metadataLoading ? t("common.searching") : t("common.search") }}
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
            :key="`${candidate.providerId}:${candidate.externalTrackId}:${candidate.externalReleaseId ?? ''}`"
            class="flex items-center gap-3 rounded-md border p-3"
          >
            <div class="min-w-0 flex-1">
              <div class="flex items-center gap-2">
                <ScrollingText class="min-w-0 flex-1 text-sm font-medium">
                  {{ candidate.title }}
                </ScrollingText>
                <Badge variant="secondary" class="shrink-0">
                  {{ candidate.providerName }}
                </Badge>
              </div>
              <p class="min-w-0 text-sm text-muted-foreground">
                <ScrollingText class="w-full">
                  {{ candidate.artist }}
                  <template v-if="candidate.album">
                    · {{ candidate.album }}
                  </template>
                </ScrollingText>
              </p>
              <p
                v-if="candidate.details.length"
                class="mt-1 line-clamp-2 text-xs text-muted-foreground"
              >
                {{
                  candidate.details
                    .map(
                      (detail) =>
                        `${translate(detail.labelMessage)}: ${detail.value}`,
                    )
                    .join(" · ")
                }}
              </p>
              <p
                v-if="candidate.genres.length"
                class="mt-1 truncate text-xs text-muted-foreground"
              >
                {{
                  t("context.metadataGenres", {
                    genres: candidate.genres.join(", "),
                  })
                }}
              </p>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              :disabled="
                serverLost || applyingMetadataId === candidate.externalTrackId
              "
              @click="chooseMetadata(candidate)"
            >
              {{
                applyingMetadataId === candidate.externalTrackId
                  ? t("context.metadataApplying")
                  : t("context.metadataUse")
              }}
            </Button>
          </li>
        </ul>
        <p
          v-else-if="!metadataLoading && !metadataError"
          class="mt-4 text-sm text-muted-foreground"
        >
          {{ t("context.metadataNoCandidates") }}
        </p>
        <div class="mt-6 flex justify-end">
          <Button type="button" variant="outline" @click="metadataOpen = false">
            {{ t("common.close") }}
          </Button>
        </div>
      </DialogContent>
    </DialogPortal>
  </DialogRoot>
</template>
