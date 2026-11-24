<script setup lang="ts">
import { useI18n } from "#imports";
import type { TorznabRelease } from "@peridot/contracts";
import { Button } from "@peridot/ui/components/ui/button";
import { PeridotSpinner } from "@peridot/ui/components/ui/spinner";
import { computed } from "vue";
import type { TorznabImportRowState } from "../lib/torznab-import-status";
import TorznabReleaseRow from "./TorznabReleaseRow.vue";

const props = defineProps<{
  emptyMessage: string;
  importStates: Readonly<Record<string, TorznabImportRowState>>;
  loading: boolean;
  playableTrackIds: readonly string[];
  releases: readonly TorznabRelease[];
  searchError: string | null;
}>();
const emit = defineEmits<{ add: [release: TorznabRelease]; play: [] }>();
const { t } = useI18n();

const empty = computed(
  () => !props.loading && !props.searchError && props.releases.length === 0,
);

function importStateFor(release: TorznabRelease): TorznabImportRowState | null {
  const local = props.importStates[release.id];
  if (local) return local;
  const torrent = release.torrentStatus;
  if (!torrent) return null;
  if (torrent.progress >= 1) {
    return { kind: "already-added" };
  }
  return {
    kind: "tracking",
    status: {
      state: torrent.state,
      progress: torrent.progress,
      trackIds: [],
    },
  };
}
</script>

<template>
  <div class="space-y-3">
    <p
      v-if="loading"
      role="status"
      class="flex items-center gap-3 rounded-lg border p-6 text-sm text-muted-foreground"
    >
      <PeridotSpinner :label="t('torznab.loading')" />
      {{ t("torznab.loading") }}
    </p>
    <p v-if="searchError" role="alert" class="rounded-lg border p-6 text-sm">
      {{ searchError }}
    </p>
    <p
      v-if="empty"
      role="status"
      class="rounded-lg border p-6 text-sm text-muted-foreground"
    >
      {{ emptyMessage }}
    </p>

    <div
      v-if="releases.length"
      role="list"
      class="divide-y overflow-hidden rounded-lg border"
    >
      <TorznabReleaseRow
        v-for="release in releases"
        :key="release.id"
        :release="release"
        :import-state="importStateFor(release)"
        @add="emit('add', $event)"
      />
    </div>

    <Button v-if="playableTrackIds.length" type="button" @click="emit('play')">
      {{ t("torznab.play") }}
    </Button>
  </div>
</template>
