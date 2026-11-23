<script setup lang="ts">
import { useI18n } from "#imports";
import type { TorznabImportStatus, TorznabRelease } from "@peridot/contracts";
import { Button } from "@peridot/ui/components/ui/button";
import { PeridotSpinner } from "@peridot/ui/components/ui/spinner";
import { computed } from "vue";
import TorznabReleaseRow from "./TorznabReleaseRow.vue";

const props = defineProps<{
  activeImportId: string;
  importBusy: boolean;
  importFailed: boolean;
  importStatus: TorznabImportStatus | null;
  loading: boolean;
  releases: readonly TorznabRelease[];
  searchError: string | null;
}>();
const emit = defineEmits<{ add: [release: TorznabRelease]; play: [] }>();
const { t } = useI18n();

const empty = computed(
  () => !props.loading && !props.searchError && props.releases.length === 0,
);
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
      {{ t("torznab.empty") }}
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
        :busy="importBusy && activeImportId === release.id"
        :imported="activeImportId === release.id"
        @add="emit('add', $event)"
      />
    </div>

    <template v-if="activeImportId && importStatus && !importFailed">
      <Button
        v-if="importStatus.trackIds.length"
        type="button"
        @click="emit('play')"
      >
        {{ t("torznab.play") }}
      </Button>
      <p v-else role="status" class="text-sm text-muted-foreground">
        {{
          importStatus.progress === 1
            ? t("torznab.indexing")
            : importStatus.state +
              " · " +
              Math.round(importStatus.progress * 100) +
              "%"
        }}
      </p>
    </template>
  </div>
</template>
