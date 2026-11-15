<script setup lang="ts">
import { useI18n } from "#imports";
import type { PlaylistDetailResponse } from "@peridot/contracts";
import { Icon } from "@iconify/vue/offline";
import { Button } from "@peridot/ui/components/ui/button";
import { ProgressCircle } from "@peridot/ui/components/ui/progress-circle";
import { computed } from "vue";
import { useOfflinePlaylist } from "../composables/use-offline-playlist";
import { icons } from "../lib/icons";

const props = withDefaults(
  defineProps<{
    playlist: PlaylistDetailResponse;
    compact?: boolean;
    overlay?: boolean;
  }>(),
  { compact: false, overlay: false },
);
const { t } = useI18n();
const { allSaved, pending, progress, canToggle, toggle } = useOfflinePlaylist(
  () => props.playlist,
);
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
</script>

<template>
  <Button
    type="button"
    :variant="overlay ? 'secondary' : 'ghost'"
    :size="compact ? 'icon-sm' : 'icon-lg'"
    class="hover:text-primary active:text-primary"
    :disabled="!canToggle"
    :aria-busy="pending"
    :aria-label="label"
    :title="label"
    :aria-pressed="allSaved"
    @click.stop="toggle"
    @dblclick.stop
  >
    <ProgressCircle
      v-if="pending"
      :value="progress ?? null"
      :label="label"
      :size="compact ? 'sm' : 'md'"
    />
    <Icon
      v-else
      :icon="allSaved ? icons.cloudCheck : icons.cloudDownload"
      aria-hidden="true"
      class="transition-colors"
      :class="[
        compact ? 'size-4' : 'size-6',
        allSaved ? 'text-primary' : 'text-muted-foreground',
      ]"
    />
  </Button>
</template>
