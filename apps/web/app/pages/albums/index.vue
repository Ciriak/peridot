<script setup lang="ts">
import { useHead, useI18n } from "#imports";
import { Badge } from "@peridot/ui/components/ui/badge";
import { Button } from "@peridot/ui/components/ui/button";
import { PeridotSpinner } from "@peridot/ui/components/ui/spinner";
import { onMounted } from "vue";
import AlbumCard from "../../components/AlbumCard.vue";
import AutoLoadMore from "../../components/AutoLoadMore.vue";
import { useCatalogAlbumQuery } from "../../composables/use-catalog-query";
import { useLikes } from "../../composables/use-likes";

const { t } = useI18n();
useHead({ title: t("page.albums.title") });

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
} = useCatalogAlbumQuery();
const { load: loadLikes } = useLikes();

onMounted(() => {
  void load();
  void loadLikes();
});
</script>

<template>
  <div class="space-y-2">
    <h1 class="text-2xl font-semibold tracking-tight">
      {{ t("navigation.albums") }}
    </h1>
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
    <div
      v-else-if="albums.length"
      class="grid grid-cols-2 gap-4 lg:grid-cols-3 xl:grid-cols-5"
      :aria-busy="loading"
    >
      <AlbumCard v-for="album in albums" :key="album.id" :album="album" />
      <AutoLoadMore
        class="col-span-full"
        :enabled="hasMore"
        :loading="loadingMore"
        :item-count="albums.length"
        :label="t('page.albums.loadingMore')"
        @load="loadMore"
      />
    </div>
    <p
      v-else
      role="status"
      class="rounded-lg border p-6 text-sm text-muted-foreground"
    >
      <template v-if="loaded">
        {{ t("page.albums.empty") }}
      </template>
      <template v-else>{{ t("page.albums.loading") }}…</template>
    </p>
  </section>
</template>
