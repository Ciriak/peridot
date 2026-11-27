<script setup lang="ts">
import { useI18n } from "#imports";
import { Icon } from "@iconify/vue/offline";
import type { NodeProps } from "@xyflow/vue";
import { Handle, Position } from "@xyflow/vue";
import logo from "@peridot/ui/assets/brand/logo.svg";
import { computed } from "vue";
import {
  type OverviewFlowNode,
  type OverviewNodeData,
} from "../lib/overview-flow";
import { icons } from "../lib/icons";
import { sourceKindIcon, sourceKindLabelKey } from "../lib/source-label";

const props = defineProps<NodeProps<OverviewFlowNode>>();
const data = computed(() => props.data as OverviewNodeData);
const { t, n } = useI18n();
const isPeridot = computed(() => data.value.view === "peridot");
const icon = computed(() => {
  if (isPeridot.value) return null;
  if (data.value.kind === "musicbrainz") return icons.musicbrainz;
  if (data.value.kind === "discogs") return icons.discogs;
  if (data.value.kind === "qbittorrent") return icons.qbittorrent;
  if (data.value.kind === "torznab") return icons.globe;
  return sourceKindIcon(data.value.kind) ?? icons.library;
});
const typeLabel = computed(() => {
  if (isPeridot.value) return t("settings.overview.platform");
  if (data.value.kind === "musicbrainz" || data.value.kind === "discogs") {
    return t("settings.overview.metadataProvider");
  }
  if (data.value.kind === "qbittorrent") {
    return t("settings.overview.downloadClient");
  }
  if (data.value.kind === "torznab") {
    return t("settings.overview.releaseIndexer");
  }
  const key = sourceKindLabelKey(data.value.kind);
  return key ? t(key) : t("settings.sources.heading");
});
const statusLabel = computed(() =>
  t(`settings.overview.status.${data.value.status}`, {
    name: data.value.name,
  }),
);
const fileLabel = computed(() =>
  data.value.fileCount === null
    ? ""
    : t("count.file", { count: data.value.fileCount }, data.value.fileCount),
);
const statusDotClass = computed(() =>
  data.value.status === "online"
    ? "bg-success"
    : data.value.status === "offline"
      ? "bg-destructive"
      : "bg-muted-foreground",
);
const serviceCountRows = computed(() => {
  const counts = data.value.serviceCounts;
  if (!counts) return [];
  return [
    {
      key: "albums",
      label: t("settings.overview.albums"),
      value: counts.albums,
    },
    {
      key: "playlists",
      label: t("settings.overview.playlists"),
      value: counts.playlists,
    },
    {
      key: "podcasts",
      label: t("settings.overview.podcasts"),
      value: counts.podcasts,
    },
    {
      key: "audiobooks",
      label: t("settings.overview.audiobooks"),
      value: counts.audiobooks,
    },
  ];
});
const targetPositions = [
  { id: "peridot-top", position: Position.Top },
  { id: "peridot-right", position: Position.Right },
  { id: "peridot-bottom", position: Position.Bottom },
  { id: "peridot-left", position: Position.Left },
];
</script>

<template>
  <div class="relative" :class="isPeridot ? 'w-64' : 'w-56'">
    <article
      class="w-full overflow-hidden rounded-xl border bg-card text-card-foreground shadow-md"
      :class="isPeridot ? 'border-primary/40' : ''"
      :aria-label="`${data.name}, ${typeLabel}, ${statusLabel}`"
    >
      <header
        class="flex min-h-10 items-center gap-2 border-b border-border px-3 py-2"
      >
        <span
          class="flex size-6 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground"
        >
          <img
            v-if="isPeridot"
            :src="logo"
            alt=""
            aria-hidden="true"
            class="size-4"
          />
          <Icon
            v-else-if="icon"
            :icon="icon"
            aria-hidden="true"
            class="size-4"
          />
        </span>
        <p class="min-w-0 flex-1 truncate text-sm font-semibold">
          {{ data.name }}
        </p>
        <span
          class="relative flex size-5 shrink-0 items-center justify-center"
          role="img"
          :aria-label="statusLabel"
          :title="statusLabel"
        >
          <span
            v-if="data.status === 'online'"
            aria-hidden="true"
            class="absolute size-3 animate-ping rounded-full bg-success/40 motion-reduce:hidden"
          />
          <span
            aria-hidden="true"
            class="size-2.5 rounded-full border border-background"
            :class="statusDotClass"
          />
        </span>
      </header>
      <div
        v-if="data.view !== 'metadata-provider'"
        class="flex min-h-9 items-center justify-between gap-3 px-3 py-2 text-xs text-muted-foreground"
      >
        <span class="min-w-0 truncate" :title="data.address">
          {{ data.address }}
        </span>
        <span v-if="fileLabel" class="shrink-0 font-medium text-foreground">{{
          fileLabel
        }}</span>
      </div>
      <dl
        v-if="isPeridot"
        class="grid grid-cols-2 gap-x-3 gap-y-1 border-t px-3 py-2 text-xs"
      >
        <div
          v-for="row in serviceCountRows"
          :key="row.key"
          class="flex items-center justify-between gap-2"
        >
          <dt class="truncate text-muted-foreground">{{ row.label }}</dt>
          <dd class="font-semibold text-foreground">
            {{ n(row.value, "integer") }}
          </dd>
        </div>
      </dl>
    </article>

    <template v-if="isPeridot">
      <Handle
        v-for="handle in targetPositions"
        :id="handle.id"
        :key="handle.id"
        type="target"
        :position="handle.position"
        :is-connectable="false"
        class="pointer-events-none size-3 border-2 border-background bg-muted-foreground"
        :class="
          data.targetHandles.includes(handle.id) ? 'opacity-100' : 'invisible'
        "
      />
      <Handle
        v-if="data.sourceHandles.includes('peridot-download-client')"
        id="peridot-download-client"
        type="source"
        :position="Position.Bottom"
        :is-connectable="false"
        class="pointer-events-none size-3 border-2 border-background bg-muted-foreground opacity-100"
      />
    </template>
    <template v-else>
      <Handle
        v-if="data.handleType"
        :id="data.handleType === 'target' ? 'download-client' : 'source'"
        :type="data.handleType"
        :position="data.sourcePosition ?? Position.Right"
        :is-connectable="false"
        class="pointer-events-none size-3 border-2 border-background bg-muted-foreground opacity-100"
      />
      <Handle
        v-if="data.sourceHandles.includes('download-destination')"
        id="download-destination"
        type="source"
        :position="Position.Left"
        :is-connectable="false"
        class="pointer-events-none size-3 border-2 border-background bg-muted-foreground opacity-100"
      />
      <Handle
        v-if="data.targetHandles.includes('download-destination')"
        id="download-destination"
        type="target"
        :position="Position.Bottom"
        :is-connectable="false"
        class="pointer-events-none size-3 border-2 border-background bg-muted-foreground opacity-100"
      />
      <Handle
        v-if="data.targetHandles.includes('release-indexer')"
        id="release-indexer"
        type="target"
        :position="Position.Right"
        :is-connectable="false"
        class="pointer-events-none size-3 border-2 border-background bg-muted-foreground opacity-100"
      />
    </template>
  </div>
</template>
