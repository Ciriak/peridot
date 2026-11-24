<script setup lang="ts">
import { useI18n } from "#imports";
import { Badge } from "@peridot/ui/components/ui/badge";
import { Button } from "@peridot/ui/components/ui/button";
import { PeridotSpinner } from "@peridot/ui/components/ui/spinner";
import { computed, onMounted, ref } from "vue";
import ListSearchBar from "./ListSearchBar.vue";
import TrackTable from "./TrackTable.vue";
import { useCatalogTrackQuery } from "../composables/use-catalog-query";
import { useListSearch } from "../composables/use-list-search";
import { useLikes } from "../composables/use-likes";
import { filterTracks, type TrackSort } from "../lib/library";

const props = withDefaults(
  defineProps<{ title: string; favorites?: boolean }>(),
  { favorites: false },
);
const { t } = useI18n();
const sort = ref<TrackSort | null>({ field: "title", direction: "asc" });
const { query, searchQuery, clear } = useListSearch();
const queryOptions = computed(() => ({
  sort:
    sort.value?.field === "number"
      ? ("track" as const)
      : (sort.value?.field ?? "title"),
  direction: sort.value?.direction ?? ("asc" as const),
  query: searchQuery.value || undefined,
  ...(props.favorites ? { liked: true, availability: "all" as const } : {}),
}));
const {
  tracks,
  loading,
  loadingMore,
  error,
  loaded,
  hasMore,
  totalCount,
  load,
  loadMore,
} = useCatalogTrackQuery(() => queryOptions.value);
const { likedTrackIds, loaded: likesLoaded, load: loadLikes } = useLikes();
const visibleTracks = computed(() =>
  props.favorites && likesLoaded.value
    ? filterTracks(tracks.value, "", likedTrackIds.value)
    : tracks.value,
);

function setSort(next: TrackSort | null) {
  sort.value = next ?? { field: "title", direction: "asc" };
}

onMounted(() => {
  void load();
  void loadLikes();
});
</script>

<template>
  <div class="flex flex-wrap items-center gap-4">
    <h1 class="text-2xl font-semibold tracking-tight">{{ title }}</h1>
    <ListSearchBar
      v-model="query"
      :label="
        t('components.listSearch.label', {
          collection: title,
        })
      "
      :clear-label="t('components.listSearch.clear')"
      class="w-full md:max-w-sm"
      @clear="clear"
    />
  </div>
  <section aria-labelledby="tracks-heading" class="space-y-4">
    <div class="flex flex-wrap items-center gap-2">
      <h2 id="tracks-heading" class="text-lg font-semibold">
        {{ t("components.tracks.label") }}
      </h2>
      <Badge variant="secondary">
        {{
          loading
            ? t("common.loading")
            : t("count.track", { count: totalCount }, totalCount)
        }}
      </Badge>
    </div>
    <div
      v-if="loading && !tracks.length"
      role="status"
      class="flex items-center gap-3 rounded-lg border p-6 text-sm text-muted-foreground"
    >
      <PeridotSpinner :label="t('components.library.loading')" />
      {{ t("components.library.loading") }}
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
    <TrackTable
      v-else-if="visibleTracks.length"
      :tracks="visibleTracks"
      variant="library"
      :sort="sort ?? undefined"
      :has-more="hasMore"
      :loading-more="loadingMore"
      :total-count="totalCount"
      @sort-change="setSort"
      @load-more="loadMore"
    />
    <p
      v-else
      role="status"
      class="rounded-lg border p-6 text-sm text-muted-foreground"
    >
      <template v-if="favorites">
        {{
          searchQuery
            ? t("page.liked.noMatches")
            : t("components.library.noFavorites")
        }}
      </template>
      <template v-else-if="loaded">
        {{ t("components.library.empty") }}
      </template>
      <template v-else>{{ t("components.library.loading") }}</template>
    </p>
  </section>
</template>
