<script setup lang="ts">
import { useHead, useI18n } from "#imports";
import { Badge } from "@peridot/ui/components/ui/badge";
import { Button } from "@peridot/ui/components/ui/button";
import { PeridotSpinner } from "@peridot/ui/components/ui/spinner";
import { onMounted } from "vue";
import ArtistCard from "../../components/ArtistCard.vue";
import AutoLoadMore from "../../components/AutoLoadMore.vue";
import ListSearchBar from "../../components/ListSearchBar.vue";
import VirtualCardGrid from "../../components/VirtualCardGrid.vue";
import { useCatalogArtistQuery } from "../../composables/use-catalog-query";
import { useListSearch } from "../../composables/use-list-search";
import { useLikes } from "../../composables/use-likes";

const { t } = useI18n();
useHead({ title: t("page.artists.title") });

const { query, searchQuery, clear } = useListSearch();
const {
  items: artists,
  loading,
  loadingMore,
  error,
  loaded,
  hasMore,
  totalCount,
  load,
  loadMore,
} = useCatalogArtistQuery(() => ({
  query: searchQuery.value || undefined,
  sort: "name",
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
      {{ t("navigation.artists") }}
    </h1>
    <ListSearchBar
      v-model="query"
      :label="
        t('components.listSearch.label', {
          collection: t('navigation.artists'),
        })
      "
      :clear-label="t('components.listSearch.clear')"
      class="w-full md:max-w-sm"
      @clear="clear"
    />
  </div>
  <section aria-labelledby="artists-heading" class="space-y-4">
    <div class="flex flex-wrap items-center gap-2">
      <h2 id="artists-heading" class="text-lg font-semibold">
        {{ t("page.artists.all") }}
      </h2>
      <Badge variant="secondary">
        {{ loading ? t("common.loading") : totalCount }}
      </Badge>
    </div>
    <div
      v-if="loading && !artists.length"
      role="status"
      class="flex items-center gap-3 rounded-lg border p-6 text-sm text-muted-foreground"
    >
      <PeridotSpinner :label="t('page.artists.loading')" />
      {{ t("page.artists.loading") }}…
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
      v-else-if="artists.length"
      :items="artists"
      layout="standard"
      :item-key="(artist) => artist.id"
      :estimate-row-height="92"
      :aria-busy="loading"
    >
      <template #default="{ item }">
        <ArtistCard :artist="item" />
      </template>
      <template #footer>
        <AutoLoadMore
          :enabled="hasMore"
          :loading="loadingMore"
          :item-count="artists.length"
          :label="t('page.artists.loadingMore')"
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
        {{
          searchQuery ? t("page.artists.noMatches") : t("page.artists.empty")
        }}
      </template>
      <template v-else>{{ t("page.artists.loading") }}…</template>
    </p>
  </section>
</template>
