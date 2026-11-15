<script setup lang="ts">
import { useI18n } from "#imports";
import type { AlbumSummaryResponse } from "@peridot/contracts";
import { Icon } from "@iconify/vue/offline";
import { Button } from "@peridot/ui/components/ui/button";
import { ProgressCircle } from "@peridot/ui/components/ui/progress-circle";
import { computed } from "vue";
import { useOfflineAlbum } from "../composables/use-offline-album";
import { icons } from "../lib/icons";

const props = withDefaults(
  defineProps<{
    album: AlbumSummaryResponse;
    compact?: boolean;
    overlay?: boolean;
  }>(),
  {
    compact: false,
    overlay: false,
  },
);

const { t } = useI18n();
const { allSaved, pending, progress, canToggle, toggle } = useOfflineAlbum(
  () => props.album,
);

const actionLabel = computed(() => {
  if (pending.value) {
    return t("albumOffline.savingDescription", {
      album: props.album.title,
      artist: props.album.artist,
    });
  }
  if (allSaved.value) {
    return t("albumOffline.removeDescription", {
      album: props.album.title,
      artist: props.album.artist,
    });
  }
  return t("albumOffline.saveDescription", {
    album: props.album.title,
    artist: props.album.artist,
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
    :aria-label="actionLabel"
    :title="actionLabel"
    :aria-pressed="allSaved"
    @click.stop="toggle"
    @dblclick.stop
  >
    <ProgressCircle
      v-if="pending"
      :value="progress ?? null"
      :label="actionLabel"
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
