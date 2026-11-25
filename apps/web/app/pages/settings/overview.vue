<script setup lang="ts">
import { definePageMeta, navigateTo, useHead, useI18n } from "#imports";
import { Button } from "@peridot/ui/components/ui/button";
import { PeridotSpinner } from "@peridot/ui/components/ui/spinner";
import {
  Background,
  setupVueFlow,
  VueFlow,
  type NodeMouseEvent,
} from "@xyflow/vue";
import "@xyflow/vue/style.css";
import { usePreferredReducedMotion } from "@vueuse/core";
import { computed, markRaw, shallowRef, watch } from "vue";
import AnimationEdge from "../../components/AnimationEdge.vue";
import OverviewNode from "../../components/OverviewNode.vue";
import OverviewSubflow from "../../components/OverviewSubflow.vue";
import { useOverviewQuery } from "../../composables/use-overview-query";
import { useServer } from "../../composables/use-server";
import { useServerConnection } from "../../composables/use-server-connection";
import {
  overviewEdges,
  overviewNodeSettingsPath,
  overviewNodes,
  safeOverviewHost,
  type OverviewDiagramNode,
  type OverviewFlowEdge,
} from "../../lib/overview-flow";

definePageMeta({ layout: "settings" });

const { t } = useI18n();
useHead({ title: t("settings.overview.title") });

const { address } = useServer();
const { status: connectionStatus } = useServerConnection();
const preferredMotion = usePreferredReducedMotion();
const overview = useOverviewQuery();
const { fitView } = setupVueFlow();
const nodeTypes = {
  overview: markRaw(OverviewNode),
  subflow: markRaw(OverviewSubflow),
};
const nodes = shallowRef<OverviewDiagramNode[]>([]);
const edges = shallowRef<OverviewFlowEdge[]>([]);
const peridotStatus = computed(() =>
  connectionStatus.value === "connected"
    ? "online"
    : connectionStatus.value === "lost"
      ? "offline"
      : "unknown",
);
const connectionCount = computed(
  () =>
    (overview.data.value?.librarySources.length ?? 0) +
    (overview.data.value?.metadataProviders.length ?? 0) +
    (overview.data.value?.releaseIndexers.length ?? 0) +
    (overview.data.value?.downloadClients.length ?? 0),
);
const animated = computed(() => preferredMotion.value !== "reduce");

watch(
  [
    () => overview.data.value?.librarySources ?? [],
    () => overview.data.value?.metadataProviders ?? [],
    () => overview.data.value?.releaseIndexers ?? [],
    () => overview.data.value?.downloadClients ?? [],
    () => overview.data.value?.counts,
    address,
    peridotStatus,
    animated,
  ],
  ([sources, providers, indexers, clients, counts]) => {
    nodes.value = overviewNodes(
      sources,
      providers,
      indexers,
      clients,
      counts ?? { albums: 0, playlists: 0, podcasts: 0, audiobooks: 0 },
      safeOverviewHost(address.value),
      peridotStatus.value,
    );
    edges.value = overviewEdges(
      sources,
      providers,
      indexers,
      clients,
      animated.value,
    );
  },
  { immediate: true },
);

function fitOverview() {
  void fitView({
    padding: 0.35,
    minZoom: 0.1,
    maxZoom: 1,
    duration: animated.value ? 200 : 0,
  });
}

function openNodeSettings(event: NodeMouseEvent<OverviewDiagramNode>) {
  const path = overviewNodeSettingsPath(event.node);
  if (path) void navigateTo(path);
}
</script>

<template>
  <div class="flex h-full min-h-0 flex-col gap-4 p-4 md:p-6">
    <header class="shrink-0 space-y-1">
      <div class="flex items-center gap-2">
        <h2 class="text-2xl font-semibold tracking-tight">
          {{ t("settings.overview.title") }}
        </h2>
        <span class="text-sm text-muted-foreground">
          {{
            t(
              "count.overviewConnection",
              { count: connectionCount },
              connectionCount,
            )
          }}
        </span>
      </div>
      <p class="text-sm text-muted-foreground">
        {{ t("settings.overview.description") }}
      </p>
    </header>

    <p
      v-if="overview.error.value"
      role="alert"
      class="flex shrink-0 flex-wrap items-center gap-3 rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive"
    >
      <span class="min-w-0 flex-1">{{ overview.error.value }}</span>
      <Button variant="outline" size="sm" @click="overview.refresh">
        {{ t("common.tryAgain") }}
      </Button>
    </p>

    <div
      class="relative min-h-0 flex-1 overflow-hidden rounded-xl border bg-card"
      role="region"
      :aria-label="t('settings.overview.graphLabel')"
      :aria-busy="overview.loading.value"
    >
      <div
        v-if="overview.loading.value"
        role="status"
        class="absolute inset-0 z-10 flex items-center justify-center gap-3 bg-card/80 text-sm text-muted-foreground"
      >
        <PeridotSpinner
          :label="t('settings.overview.loading')"
          class="size-5"
        />
        {{ t("settings.overview.loading") }}
      </div>
      <VueFlow
        v-if="!overview.loading.value"
        :nodes="nodes"
        :edges="edges"
        :node-types="nodeTypes"
        :node-origin="[0.5, 0.5]"
        :nodes-draggable="false"
        :nodes-connectable="false"
        :elements-selectable="false"
        :edges-updatable="false"
        :delete-key-code="null"
        :fit-view="true"
        :fit-view-options="{ padding: 0.35, minZoom: 0.1, maxZoom: 1 }"
        :default-viewport="{ x: 0, y: 0, zoom: 0.9 }"
        :min-zoom="0.1"
        :max-zoom="1"
        :pan-on-drag="true"
        :zoom-on-scroll="true"
        :zoom-on-pinch="true"
        :prevent-scrolling="true"
        @nodes-initialized="fitOverview"
        @node-double-click="openNodeSettings"
        class="h-full w-full"
      >
        <Background variant="dots" :gap="20" :size="1" />
        <template #edge-animation="props">
          <AnimationEdge v-bind="props" />
        </template>
      </VueFlow>
      <p
        v-if="overview.loaded.value && connectionCount === 0"
        class="pointer-events-none absolute inset-x-0 bottom-4 z-10 text-center text-sm text-muted-foreground"
      >
        {{ t("settings.overview.empty") }}
      </p>
      <span
        v-if="overview.refreshing.value && !overview.loading.value"
        role="status"
        class="absolute right-3 top-3 z-10 flex items-center gap-2 rounded-full border bg-card/90 px-3 py-1 text-xs text-muted-foreground"
      >
        <PeridotSpinner
          :label="t('settings.overview.refreshing')"
          class="size-3"
        />
        {{ t("settings.overview.refreshing") }}
      </span>
    </div>
  </div>
</template>
