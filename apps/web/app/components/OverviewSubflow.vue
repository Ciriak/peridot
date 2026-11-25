<script setup lang="ts">
import { useI18n } from "#imports";
import { Icon } from "@iconify/vue/offline";
import type { NodeProps } from "@xyflow/vue";
import { computed } from "vue";
import {
  type OverviewSubflowNode,
  type OverviewSubflowNodeData,
} from "../lib/overview-flow";
import { icons } from "../lib/icons";

const props = defineProps<NodeProps<OverviewSubflowNode>>();
const data = computed(() => props.data as OverviewSubflowNodeData);
const { t } = useI18n();
const isMetadataProviders = computed(
  () => data.value.view === "metadata-provider-subflow",
);
const isDownloadClients = computed(
  () => data.value.view === "download-client-subflow",
);
const isReleaseIndexers = computed(
  () => data.value.view === "release-indexer-subflow",
);
const title = computed(() =>
  isReleaseIndexers.value
    ? t("settings.connectors.releaseIndexers")
    : isDownloadClients.value
      ? t("settings.connectors.downloadClients")
      : isMetadataProviders.value
        ? t("settings.connectors.metadataProviders")
        : t("settings.sources.heading"),
);
const icon = computed(() =>
  isReleaseIndexers.value
    ? icons.globe
    : isDownloadClients.value
      ? icons.download
      : isMetadataProviders.value
        ? icons.metadata
        : icons.library,
);
</script>

<template>
  <section
    class="pointer-events-none flex h-full w-full flex-col rounded-xl border border-dashed border-border bg-muted/30 p-4"
    :aria-label="
      t('settings.overview.subflowLabel', {
        title: title,
      })
    "
  >
    <header class="flex items-center gap-2">
      <span
        class="flex size-8 items-center justify-center rounded-md bg-muted text-muted-foreground"
      >
        <Icon :icon="icon" aria-hidden="true" class="size-4" />
      </span>
      <div class="min-w-0">
        <p class="truncate text-sm font-semibold">{{ title }}</p>
      </div>
    </header>
  </section>
</template>
