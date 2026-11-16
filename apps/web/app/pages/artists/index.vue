<script setup lang="ts">
import { useHead, useI18n } from "#imports";
import { Badge } from "@peridot/ui/components/ui/badge";
import { Button } from "@peridot/ui/components/ui/button";
import { PeridotSpinner } from "@peridot/ui/components/ui/spinner";
import { onMounted } from "vue";
import ArtistCard from "../../components/ArtistCard.vue";
import AutoLoadMore from "../../components/AutoLoadMore.vue";
import { useCatalogArtistQuery } from "../../composables/use-catalog-query";
import { useLikes } from "../../composables/use-likes";

const { t } = useI18n();
useHead({ title: t("page.artists.title") });

const {
  items: artists,
  loading,
  loadingMore,
  error,
  loaded,
  hasMore,
  load,
  loadMore,
} = useCatalogArtistQuery();
const { load: loadLikes } = useLikes();

onMounted(() => {
  void load();
  void loadLikes();
});
</script>

<template>
  <div class="space-y-2">
    <h1 class="text-2xl font-semibold tracking-tight">
      {{ t("navigation.artists") }}
    </h1>
  </div>
  <section aria-labelledby="artists-heading" class="space-y-4">
    <div class="flex items-center justify-between gap-4">
      <h2 id="artists-heading" class="text-lg font-semibold">
        {{ t("page.artists.all") }}
      </h2>
      <Badge variant="secondary">
        {{
          loading
            ? t("common.loading")
            : `${artists.length}${hasMore ? "+" : ""}`
        }}
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
    <div
      v-else-if="artists.length"
      class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5"
      :aria-busy="loading"
    >
      <ArtistCard v-for="artist in artists" :key="artist.id" :artist="artist" />
      <AutoLoadMore
        class="col-span-full"
        :enabled="hasMore"
        :loading="loadingMore"
        :item-count="artists.length"
        :label="t('page.artists.loadingMore')"
        @load="loadMore"
      />
    </div>
    <p
      v-else
      role="status"
      class="rounded-lg border p-6 text-sm text-muted-foreground"
    >
      <template v-if="loaded">
        {{ t("page.artists.empty") }}
      </template>
      <template v-else>{{ t("page.artists.loading") }}…</template>
    </p>
  </section>
</template>
