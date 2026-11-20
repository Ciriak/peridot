<script setup lang="ts">
import { useHead, useI18n } from "#imports";
import { Badge } from "@peridot/ui/components/ui/badge";
import { Button } from "@peridot/ui/components/ui/button";
import { PeridotSpinner } from "@peridot/ui/components/ui/spinner";
import { onMounted } from "vue";
import AutoLoadMore from "../../components/AutoLoadMore.vue";
import CatalogCard from "../../components/CatalogCard.vue";
import ListSearchBar from "../../components/ListSearchBar.vue";
import VirtualCardGrid from "../../components/VirtualCardGrid.vue";
import { useCatalogAlbumQuery } from "../../composables/use-catalog-query";
import { useListSearch } from "../../composables/use-list-search";
import { useLikes } from "../../composables/use-likes";
import { albumCatalogCard } from "../../lib/catalog-cards";

const { t } = useI18n();
useHead({ title: t("page.albums.title") });

const { query, searchQuery, clear } = useListSearch();
const {
  items: albums,
  loading,
  loadingMore,
  error,
  loaded,
  hasMore,
  totalCount,
  load,
  loadMore,
} = useCatalogAlbumQuery(() => ({
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
      {{ t("navigation.albums") }}
    </h1>
    <ListSearchBar
      v-model="query"
      :label="
        t('components.listSearch.label', {
          collection: t('navigation.albums'),
        })
      "
      :clear-label="t('components.listSearch.clear')"
      class="w-full md:max-w-sm"
      @clear="clear"
    />
  </div>
  <section aria-labelledby="albums-heading" class="space-y-4">
    <div class="flex flex-wrap items-center gap-2">
      <h2 id="albums-heading" class="text-lg font-semibold">
        {{ t("page.albums.all") }}
      </h2>
      <Badge variant="secondary">
        {{ loading ? t("common.loading") : totalCount }}
      </Badge>
    </div>
    <div
      v-if="loading && !albums.length"
      role="status"
      class="flex items-center gap-3 rounded-lg border p-6 text-sm text-muted-foreground"
    >
      <PeridotSpinner :label="t('page.albums.loading')" />
      {{ t("page.albums.loading") }}…
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
      v-else-if="albums.length"
      :items="albums"
      layout="wide"
      :item-key="(album) => album.id"
      :estimate-row-height="300"
      :aria-busy="loading"
    >
      <template #default="{ item }">
        <CatalogCard :item="albumCatalogCard(item)" />
      </template>
      <template #footer>
        <AutoLoadMore
          :enabled="hasMore"
          :loading="loadingMore"
          :item-count="albums.length"
          :label="t('page.albums.loadingMore')"
          @load="loadMore"
        />
      </template>
    </VirtualCardGrid>
    <p
      v-else
      role="status"
      class="rounded-lg border p-6 text-sm text-muted-foreground"
    >
      <template v-if="loaded">
        {{ searchQuery ? t("page.albums.noMatches") : t("page.albums.empty") }}
      </template>
      <template v-else>{{ t("page.albums.loading") }}…</template>
    </p>
  </section>
</template>
