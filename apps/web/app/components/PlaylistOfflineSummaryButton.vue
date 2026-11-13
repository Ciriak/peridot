<script setup lang="ts">
import { useI18n } from "#imports";
import type {
  PlaylistDetailResponse,
  PlaylistSummaryResponse,
} from "@peridot/contracts";
import { Icon } from "@iconify/vue/offline";
import { Button } from "@peridot/ui/components/ui/button";
import { ProgressCircle } from "@peridot/ui/components/ui/progress-circle";
import { useQueryClient } from "@tanstack/vue-query";
import { computed, nextTick, ref } from "vue";
import { useOfflinePlaylist } from "../composables/use-offline-playlist";
import { useQueryScope } from "../composables/use-query-scope";
import { useServerConnection } from "../composables/use-server-connection";
import { useSession } from "../composables/use-session";
import { icons } from "../lib/icons";
import { fetchPlaylist } from "../lib/peridot-client";
import { queryKeys } from "../lib/query-keys";

const props = defineProps<{ playlist: PlaylistSummaryResponse }>();
const { t } = useI18n();
const { scope } = useQueryScope();
const { token } = useSession();
const { status } = useServerConnection();
const queryClient = useQueryClient();
const detail = ref<PlaylistDetailResponse | null>(null);
const loadingDetail = ref(false);
const {
  allSaved,
  pending: offlinePending,
  progress,
  canToggle,
  toggle,
} = useOfflinePlaylist(detail);
const pending = computed(() => loadingDetail.value || offlinePending.value);
const label = computed(() => {
  if (pending.value) {
    return t("playlistOffline.savingDescription", {
      playlist: props.playlist.name,
    });
  }
  return allSaved.value
    ? t("playlistOffline.removeDescription", {
        playlist: props.playlist.name,
      })
    : t("playlistOffline.saveDescription", {
        playlist: props.playlist.name,
      });
});

async function ensureDetail(): Promise<PlaylistDetailResponse | null> {
  if (detail.value) return detail.value;
  if (!scope.value) return null;
  const key = queryKeys.playlist(scope.value, props.playlist.id);
  const cached = queryClient.getQueryData<PlaylistDetailResponse>(key);
  if (cached) {
    detail.value = cached;
    return cached;
  }
  if (!token.value || status.value === "lost") return null;
  loadingDetail.value = true;
  try {
    detail.value = await queryClient.fetchQuery({
      queryKey: key,
      queryFn: () =>
        fetchPlaylist(
          scope.value!.serverAddress,
          token.value!,
          props.playlist.id,
        ),
      meta: { persist: true },
    });
    return detail.value;
  } finally {
    loadingDetail.value = false;
  }
}

async function toggleOffline() {
  await ensureDetail();
  await nextTick();
  if (canToggle.value) await toggle();
}
</script>

<template>
  <Button
    type="button"
    variant="ghost"
    size="icon-sm"
    class="hover:text-primary active:text-primary"
    :disabled="
      !playlist.availableTrackCount ||
      pending ||
      (status === 'lost' && !allSaved)
    "
    :aria-busy="pending"
    :aria-label="label"
    :title="label"
    :aria-pressed="allSaved"
    @click.stop="toggleOffline"
    @dblclick.stop
  >
    <ProgressCircle
      v-if="pending"
      :value="progress ?? null"
      :label="label"
      size="sm"
    />
    <Icon
      v-else
      :icon="allSaved ? icons.cloudCheck : icons.cloudDownload"
      aria-hidden="true"
      class="size-4"
      :class="allSaved ? 'text-primary' : 'text-muted-foreground'"
    />
  </Button>
</template>
