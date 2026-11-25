<script setup lang="ts">
import { useHead, useI18n } from "#imports";
import { Badge } from "@peridot/ui/components/ui/badge";
import { Button } from "@peridot/ui/components/ui/button";
import { PeridotSpinner } from "@peridot/ui/components/ui/spinner";
import { onMounted } from "vue";
import AlbumCardPlaceholder from "../../components/AlbumCardPlaceholder.vue";
import CatalogUpdateBadge from "../../components/CatalogUpdateBadge.vue";
import ListSearchBar from "../../components/ListSearchBar.vue";
import MediaCollectionCard from "../../components/MediaCollectionCard.vue";
import VirtualCardGrid from "../../components/VirtualCardGrid.vue";
import { useListSearch } from "../../composables/use-list-search";
import { useLikes } from "../../composables/use-likes";
import { useVirtualPodcasts } from "../../composables/use-virtual-catalog";

const { t } = useI18n();
useHead({ title: t("page.podcasts.title") });

const { query, searchQuery, clear } = useListSearch();
const {
  items: podcasts,
  loading,
  loadingMore,
  error,
  loaded,
  hasMore,
  totalCount,
  loadedCount,
  load,
  setVisibleRange,
} = useVirtualPodcasts(() => ({
  query: searchQuery.value || undefined,
}));
const { load: loadLikes } = useLikes();

onMounted(() => {
  void load();
  void loadLikes();
});
</script>

<template>
  <div class="flex flex-wrap items-center gap-4">
    <h1 class="text-2xl font-semibold tracking-tight">
      {{ t("navigation.podcasts") }}
    </h1>
    <ListSearchBar
      v-model="query"
      :label="
        t('components.listSearch.label', {
          collection: t('navigation.podcasts'),
        })
      "
      :clear-label="t('components.listSearch.clear')"
      class="w-full md:max-w-sm"
      @clear="clear"
    />
  </div>
  <section aria-labelledby="podcasts-heading" class="space-y-4">
    <div class="flex flex-wrap items-center gap-2">
      <h2 id="podcasts-heading" class="text-lg font-semibold">
        {{ t("page.podcasts.all") }}
      </h2>
      <Badge variant="secondary">
        {{ loading ? t("common.loading") : totalCount }}
      </Badge>
      <CatalogUpdateBadge />
    </div>
    <div
      v-if="loading && !podcasts.length"
      role="status"
      class="flex items-center gap-3 rounded-lg border p-6 text-sm text-muted-foreground"
    >
      <PeridotSpinner :label="t('page.podcasts.loading')" />
      {{ t("page.podcasts.loading") }}…
    </div>
    <div
      v-else-if="error"
      role="alert"
      class="space-y-3 rounded-lg border p-6 text-sm"
    >
      <p>{{ error }}</p>
      <Button variant="outline" @click="load(true)">{{
        t("common.tryAgain")
      }}</Button>
    </div>
    <VirtualCardGrid
      v-else-if="podcasts.length"
      :items="podcasts"
      layout="standard"
      :item-key="(podcast) => podcast.id"
      :estimate-row-height="340"
      :total-count="totalCount"
      :loaded-count="loadedCount"
      :has-more="hasMore"
      :loading-more="loadingMore"
      paging-mode="window"
      :aria-busy="loading"
      @visible-range="setVisibleRange"
    >
      <template #default="{ item }">
        <MediaCollectionCard :collection="item" />
      </template>
      <template #placeholder>
        <AlbumCardPlaceholder />
      </template>
    </VirtualCardGrid>
    <p
      v-else
      role="status"
      class="rounded-lg border p-6 text-sm text-muted-foreground"
    >
      <template v-if="loaded">
        {{
          searchQuery ? t("page.podcasts.noMatches") : t("page.podcasts.empty")
        }}
      </template>
      <template v-else>{{ t("page.podcasts.loading") }}…</template>
    </p>
  </section>
</template>
