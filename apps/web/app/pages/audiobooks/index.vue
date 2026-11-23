<script setup lang="ts">
import { useHead, useI18n } from "#imports";
import { Badge } from "@peridot/ui/components/ui/badge";
import { Button } from "@peridot/ui/components/ui/button";
import { PeridotSpinner } from "@peridot/ui/components/ui/spinner";
import { onMounted } from "vue";
import ListSearchBar from "../../components/ListSearchBar.vue";
import MediaCollectionCard from "../../components/MediaCollectionCard.vue";
import VirtualCardGrid from "../../components/VirtualCardGrid.vue";
import { useCatalogAudiobookQuery } from "../../composables/use-catalog-query";
import { useListSearch } from "../../composables/use-list-search";
import { useLikes } from "../../composables/use-likes";

const { t } = useI18n();
useHead({ title: t("page.audiobooks.title") });

const { query, searchQuery, clear } = useListSearch();
const {
  items: audiobooks,
  loading,
  loadingMore,
  error,
  loaded,
  hasMore,
  totalCount,
  load,
  loadMore,
} = useCatalogAudiobookQuery(() => ({
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
      {{ t("navigation.audiobooks") }}
    </h1>
    <ListSearchBar
      v-model="query"
      :label="
        t('components.listSearch.label', {
          collection: t('navigation.audiobooks'),
        })
      "
      :clear-label="t('components.listSearch.clear')"
      class="w-full md:max-w-sm"
      @clear="clear"
    />
  </div>
  <section aria-labelledby="audiobooks-heading" class="space-y-4">
    <div class="flex flex-wrap items-center gap-2">
      <h2 id="audiobooks-heading" class="text-lg font-semibold">
        {{ t("page.audiobooks.all") }}
      </h2>
      <Badge variant="secondary">
        {{ loading ? t("common.loading") : totalCount }}
      </Badge>
    </div>
    <div
      v-if="loading && !audiobooks.length"
      role="status"
      class="flex items-center gap-3 rounded-lg border p-6 text-sm text-muted-foreground"
    >
      <PeridotSpinner :label="t('page.audiobooks.loading')" />
      {{ t("page.audiobooks.loading") }}…
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
      v-else-if="audiobooks.length"
      :items="audiobooks"
      layout="standard"
      :item-key="(book) => book.id"
      :estimate-row-height="340"
      :total-count="totalCount"
      :has-more="hasMore"
      :loading-more="loadingMore"
      :aria-busy="loading"
      @load-more="loadMore"
    >
      <template #default="{ item }">
        <MediaCollectionCard :collection="item" />
      </template>
    </VirtualCardGrid>
    <p
      v-else
      role="status"
      class="rounded-lg border p-6 text-sm text-muted-foreground"
    >
      <template v-if="loaded">
        {{
          searchQuery
            ? t("page.audiobooks.noMatches")
            : t("page.audiobooks.empty")
        }}
      </template>
      <template v-else>{{ t("page.audiobooks.loading") }}…</template>
    </p>
  </section>
</template>
