<script setup lang="ts">
import { useI18n } from "#imports";
import type {
  ApplyArtistMetadataRequest,
  ArtistMetadataCandidateResponse,
  ArtistSummaryResponse,
  LikeTarget,
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
  ContextMenuTrigger,
} from "@peridot/ui/components/ui/context-menu";
import { Input } from "@peridot/ui/components/ui/input";
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
import { useCatalogRevision } from "../composables/use-catalog-query";
import { useLikes } from "../composables/use-likes";
import { useLibraryPlayer } from "../composables/use-library-player";
import { useLocalizedMessage } from "../composables/use-localized-message";
import { useOfflineTracks } from "../composables/use-offline-tracks";
import { useQueryScope } from "../composables/use-query-scope";
import { useServer } from "../composables/use-server";
import { useServerConnection } from "../composables/use-server-connection";
import { useSession } from "../composables/use-session";
import { loadCollectionTracks } from "../lib/catalog-collections";
import { icons } from "../lib/icons";
import { artistRoute, trackArtistNames } from "../lib/library";
import { queryKeys } from "../lib/query-keys";
import {
  applyArtistMetadata,
  isAuthenticationRedirectError,
  isPeridotNetworkError,
  listArtistMetadataCandidates,
  revertArtistMetadata,
} from "../lib/peridot-client";
import {
  notifyArtistMetadataMatched,
  notifyArtistMetadataReverted,
  notifyMetadataUpdateFailed,
  notifyOfflineTrackFailed,
} from "../lib/toasts";

const props = defineProps<{
  artist: ArtistSummaryResponse;
}>();
const { t } = useI18n();
const { errorMessage } = useLocalizedMessage();
const { address } = useServer();
const { scope } = useQueryScope();
const queryClient = useQueryClient();
const { status: serverStatus } = useServerConnection();
const serverLost = computed(() => serverStatus.value === "lost");
const { token } = useSession();
const { playCollection } = useLibraryPlayer();
const { savedTracks, tracksMatching } = useOfflineTracks();
const { invalidate: invalidateCatalog } = useCatalogRevision();
const {
  loaded: likesLoaded,
  toggle: toggleLike,
  isTargetLiked,
  isPending: isLikePending,
} = useLikes();
const metadataOpen = ref(false);
const metadataQuery = ref("");
const candidates = ref<ArtistMetadataCandidateResponse[]>([]);
const metadataLoading = ref(false);
const metadataError = ref("");
const applyingMetadataId = ref("");
const revertingMetadata = ref(false);
const target = computed<LikeTarget>(() => ({
  kind: "artist",
  name: props.artist.localName,
}));
const playable = computed(() => {
  if (!props.artist.trackCount) return false;
  if (!serverLost.value) return true;
  const localName = props.artist.localName.trim().toLowerCase();
  return savedTracks.value.some((saved) =>
    trackArtistNames(saved.track).some(
      (name) => name.trim().toLowerCase() === localName,
    ),
  );
});

async function playArtist() {
  if (!address.value || !token.value || !playable.value) return;
  const playSaved = async () => {
    const localName = props.artist.localName.trim().toLowerCase();
    const saved = await tracksMatching((track) =>
      trackArtistNames(track).some(
        (name) => name.trim().toLowerCase() === localName,
      ),
    );
    if (saved.length) {
      playCollection(saved);
    } else {
      notifyOfflineTrackFailed(
        props.artist.name,
        t("error.offlineCollectionEmpty"),
      );
    }
  };
  if (serverLost.value) {
    await playSaved();
    return;
  }
  try {
    playCollection(
      await loadCollectionTracks(address.value, token.value, {
        artistId: props.artist.id,
      }),
    );
  } catch (reason) {
    if (isPeridotNetworkError(reason)) await playSaved();
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
      queryKey: queryKeys.artistMetadataCandidates(
        scope.value,
        props.artist.id,
        queryValue,
      ),
      queryFn: () =>
        listArtistMetadataCandidates(
          scope.value!.serverAddress,
          token.value!,
          props.artist.id,
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

async function chooseMetadata(candidate: ArtistMetadataCandidateResponse) {
  applyingMetadataId.value = candidate.externalArtistId;
  metadataError.value = "";
  const body: ApplyArtistMetadataRequest = {
    providerId: candidate.providerId,
    externalArtistId: candidate.externalArtistId,
    name: candidate.name,
    sourceUrl: candidate.sourceUrl,
    portraitAvailable: candidate.portraitAvailable,
  };
  try {
    await applyArtistMetadata(
      address.value ?? "",
      token.value ?? "",
      props.artist.id,
      body,
    );
    metadataOpen.value = false;
    notifyArtistMetadataMatched(props.artist.name);
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
    await revertArtistMetadata(
      address.value ?? "",
      token.value ?? "",
      props.artist.id,
    );
    notifyArtistMetadataReverted(props.artist.name);
    invalidateCatalog();
  } catch (reason) {
    if (isAuthenticationRedirectError(reason)) return;
    notifyMetadataUpdateFailed(
      props.artist.name,
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
    <ContextMenuContent class="w-64">
      <ContextMenuLabel>
        <ScrollingText class="w-full">{{ artist.name }}</ScrollingText>
      </ContextMenuLabel>
      <ContextMenuSeparator />
      <ContextMenuItem :disabled="!playable" @select="playArtist">
        <Icon :icon="icons.play" aria-hidden="true" />
        {{ t("context.playArtist") }}
      </ContextMenuItem>
      <ContextMenuItem
        :disabled="!likesLoaded || isLikePending(target)"
        @select="toggleLike(target)"
      >
        <Icon
          :icon="isTargetLiked(target) ? icons.heartFilled : icons.heart"
          aria-hidden="true"
        />
        {{
          isTargetLiked(target)
            ? t("context.unlikeArtist")
            : t("context.likeArtist")
        }}
      </ContextMenuItem>
      <ContextMenuItem as-child>
        <NuxtLink :to="artistRoute(artist)">
          <Icon :icon="icons.user" aria-hidden="true" />
          {{ t("context.openArtist", { artist: artist.name }) }}
        </NuxtLink>
      </ContextMenuItem>
      <ContextMenuItem :disabled="serverLost" @select="openMetadataDialog">
        <Icon :icon="icons.edit" aria-hidden="true" />
        {{
          artist.metadata
            ? t("context.artistMetadataCorrect")
            : t("context.artistMetadataMatch")
        }}
      </ContextMenuItem>
      <template v-if="artist.metadata">
        <ContextMenuLabel class="text-xs">
          {{
            t("context.matchedWith", {
              provider: artist.metadata.name.providerName,
            })
          }}
        </ContextMenuLabel>
        <ContextMenuItem as-child>
          <a
            :href="artist.metadata.name.sourceUrl"
            target="_blank"
            rel="noreferrer"
          >
            <Icon :icon="icons.externalLink" aria-hidden="true" />
            {{ t("context.viewMetadataSource") }}
          </a>
        </ContextMenuItem>
        <ContextMenuItem
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
      </template>
    </ContextMenuContent>
  </ContextMenu>

  <DialogRoot v-model:open="metadataOpen">
    <DialogPortal>
      <DialogOverlay class="fixed inset-0 z-50 bg-background/80" />
      <DialogContent
        class="fixed left-1/2 top-1/2 z-50 max-h-svh w-full max-w-2xl -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-lg border bg-card p-6 text-card-foreground shadow-lg"
      >
        <DialogTitle class="text-lg font-semibold">
          {{ t("context.artistMetadataDialogTitle") }}
        </DialogTitle>
        <DialogDescription class="mt-1 text-sm text-muted-foreground">
          {{
            t("context.artistMetadataDialogDescription", {
              artist: artist.name,
            })
          }}
        </DialogDescription>
        <form class="mt-4 flex gap-2" @submit.prevent="searchMetadata">
          <Input
            v-model="metadataQuery"
            type="search"
            :aria-label="t('context.artistMetadataSearchLabel')"
            :placeholder="t('context.artistMetadataSearchPlaceholder')"
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
            :key="`${candidate.providerId}:${candidate.externalArtistId}`"
            class="flex items-center gap-3 rounded-md border p-3"
          >
            <div class="min-w-0 flex-1">
              <div class="flex items-center gap-2">
                <ScrollingText class="min-w-0 flex-1 text-sm font-medium">
                  {{ candidate.name }}
                </ScrollingText>
                <Badge variant="secondary" class="shrink-0">
                  {{ candidate.providerName }}
                </Badge>
              </div>
              <p
                v-if="candidate.disambiguation"
                class="min-w-0 text-sm text-muted-foreground"
              >
                <ScrollingText class="w-full">
                  {{ candidate.disambiguation }}
                </ScrollingText>
              </p>
              <p class="mt-1 text-xs text-muted-foreground">
                {{
                  candidate.portraitAvailable
                    ? t("context.artistPortraitAvailable")
                    : t("context.artistPortraitUnavailable")
                }}
              </p>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              :disabled="
                serverLost || applyingMetadataId === candidate.externalArtistId
              "
              @click="chooseMetadata(candidate)"
            >
              {{
                applyingMetadataId === candidate.externalArtistId
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
          {{ t("context.artistMetadataNoCandidates") }}
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
