<script setup lang="ts">
import { useI18n } from "#imports";
import type { PlaylistDetailResponse, TrackResponse } from "@peridot/contracts";
import { Icon } from "@iconify/vue/offline";
import { Badge } from "@peridot/ui/components/ui/badge";
import { Button } from "@peridot/ui/components/ui/button";
import { ScrollingText } from "@peridot/ui/components/ui/scrolling-text";
import { Input } from "@peridot/ui/components/ui/input";
import { PeridotSpinner } from "@peridot/ui/components/ui/spinner";
import { useQuery } from "@tanstack/vue-query";
import {
  DialogContent,
  DialogDescription,
  DialogOverlay,
  DialogPortal,
  DialogRoot,
  DialogTitle,
} from "reka-ui";
import { computed, ref } from "vue";
import { useQueryScope } from "../composables/use-query-scope";
import { useSession } from "../composables/use-session";
import { usePlaylistActions } from "../composables/use-playlists";
import { icons } from "../lib/icons";
import { albumSummaryFromTrack, trackArtistNames } from "../lib/library";
import { listTracks } from "../lib/peridot-client";
import { queryKeys } from "../lib/query-keys";
import AlbumLink from "./AlbumLink.vue";
import TrackArtwork from "./TrackArtwork.vue";
import TrackArtistLinks from "./TrackArtistLinks.vue";

const props = defineProps<{
  open: boolean;
  playlist: PlaylistDetailResponse;
}>();
const emit = defineEmits<{
  "update:open": [open: boolean];
  added: [playlist: PlaylistDetailResponse];
}>();
const { t } = useI18n();
const { scope } = useQueryScope();
const { token } = useSession();
const actions = usePlaylistActions();
const search = ref("");
const addingId = ref("");
const error = ref<string | null>(null);
const query = useQuery({
  queryKey: computed(() =>
    scope.value
      ? queryKeys.tracks(scope.value, {
          query: search.value.trim() || undefined,
          limit: 30,
          sort: "title",
          direction: "asc",
        })
      : ["peridot", "unscoped", "playlist-add-tracks"],
  ),
  queryFn: () => {
    if (!scope.value || !token.value) {
      throw new Error("Peridot query scope is unavailable.");
    }
    return listTracks(scope.value.serverAddress, token.value, {
      query: search.value.trim() || undefined,
      limit: 30,
      sort: "title",
      direction: "asc",
    });
  },
  enabled: computed(() => Boolean(props.open && scope.value && token.value)),
  meta: { persist: false },
});
const tracks = computed(() => query.data.value?.items ?? []);
const existingIds = computed(
  () =>
    new Set(
      props.playlist.entries.flatMap((entry) =>
        entry.track ? [entry.track.id] : [],
      ),
    ),
);

async function add(track: TrackResponse) {
  if (addingId.value || existingIds.value.has(track.id)) return;
  addingId.value = track.id;
  error.value = null;
  try {
    const result = await actions.add(props.playlist.id, {
      kind: "catalog",
      trackId: track.id,
    });
    emit("added", result.playlist);
  } catch (reason) {
    error.value = actions.messageFor(reason, "error.playlistAdd");
  } finally {
    addingId.value = "";
  }
}
</script>

<template>
  <DialogRoot :open="open" @update:open="emit('update:open', $event)">
    <DialogPortal>
      <DialogOverlay class="fixed inset-0 z-50 bg-background/80" />
      <DialogContent
        class="fixed left-1/2 top-1/2 z-50 flex max-h-svh w-full max-w-2xl -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-lg border bg-card p-6 text-card-foreground shadow-lg"
      >
        <DialogTitle class="text-lg font-semibold">
          {{ t("playlistAdd.title", { playlist: playlist.name }) }}
        </DialogTitle>
        <DialogDescription class="mt-1 text-sm text-muted-foreground">
          {{ t("playlistAdd.description") }}
        </DialogDescription>
        <div class="relative mt-4">
          <Icon
            :icon="icons.search"
            aria-hidden="true"
            class="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            v-model="search"
            type="search"
            class="pl-9"
            :aria-label="t('playlistAdd.searchLabel')"
            :placeholder="t('playlistAdd.searchPlaceholder')"
            autofocus
          />
        </div>
        <p v-if="error" role="alert" class="mt-3 text-sm text-destructive">
          {{ error }}
        </p>
        <div class="mt-4 min-h-0 flex-1 overflow-y-auto">
          <div
            v-if="query.isPending.value"
            role="status"
            class="flex items-center gap-2 p-4 text-sm text-muted-foreground"
          >
            <PeridotSpinner :label="t('playlistAdd.loading')" class="size-4" />
            {{ t("playlistAdd.loading") }}
          </div>
          <p
            v-else-if="query.error.value"
            role="alert"
            class="rounded-md border p-4 text-sm"
          >
            {{ t("playlistAdd.loadError") }}
          </p>
          <p
            v-else-if="!tracks.length"
            class="rounded-md border p-4 text-sm text-muted-foreground"
          >
            {{ t("playlistAdd.noTracks") }}
          </p>
          <ul v-else class="space-y-2">
            <li
              v-for="track in tracks"
              :key="track.id"
              class="flex items-center gap-3 rounded-md border p-3"
            >
              <TrackArtwork
                :track="track"
                :server-address="scope?.serverAddress ?? ''"
              />
              <div class="min-w-0 flex-1">
                <ScrollingText class="w-full font-medium">
                  {{ track.title }}
                </ScrollingText>
                <p class="min-w-0 text-xs text-muted-foreground">
                  <ScrollingText class="w-full">
                    <TrackArtistLinks :artists="trackArtistNames(track)" />
                    <template v-if="track.album">
                      ·
                      <AlbumLink :album="albumSummaryFromTrack(track)" />
                    </template>
                  </ScrollingText>
                </p>
              </div>
              <Badge v-if="existingIds.has(track.id)" variant="secondary">
                {{ t("playlistAdd.added") }}
              </Badge>
              <Button
                v-else
                type="button"
                size="sm"
                variant="outline"
                :disabled="Boolean(addingId)"
                :aria-busy="addingId === track.id"
                @click="add(track)"
              >
                {{
                  addingId === track.id ? t("common.adding") : t("common.add")
                }}
              </Button>
            </li>
          </ul>
        </div>
        <div class="mt-4 flex justify-end">
          <Button
            type="button"
            variant="outline"
            @click="emit('update:open', false)"
          >
            {{ t("common.close") }}
          </Button>
        </div>
      </DialogContent>
    </DialogPortal>
  </DialogRoot>
</template>
