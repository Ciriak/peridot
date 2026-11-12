<script setup lang="ts">
import { useHead, useI18n } from "#imports";
import { Button } from "@peridot/ui/components/ui/button";
import { PeridotSpinner } from "@peridot/ui/components/ui/spinner";
import { onMounted } from "vue";
import AlbumCard from "../components/AlbumCard.vue";
import { useCatalogAlbumQuery } from "../composables/use-catalog-query";
import { useLikes } from "../composables/use-likes";

const { t } = useI18n();
useHead({ title: t("page.home.title") });

const {
  items: albums,
  loading,
  loadingMore,
  error,
  loaded,
  hasMore,
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
      {{ t("page.home.heading") }}
    </h1>
    <p class="text-sm text-muted-foreground">
      {{ t("page.home.description") }}
    </p>
  </div>
  <section aria-labelledby="suggestions-heading" class="space-y-4">
    <h2 id="suggestions-heading" class="text-lg font-semibold">
      {{ t("page.home.fromLibrary") }}
    </h2>
    <div
      v-if="loading && !albums.length"
      role="status"
      class="flex items-center gap-3 rounded-lg border p-6 text-sm text-muted-foreground"
    >
      <PeridotSpinner :label="t('page.home.suggestionsLoading')" />
      {{ t("page.home.loading") }}
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
      class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5"
      :aria-busy="loading"
    >
      <AlbumCard v-for="album in albums" :key="album.id" :album="album" />
      <div v-if="hasMore" class="col-span-full flex justify-center">
        <Button
          type="button"
          variant="outline"
          :disabled="loadingMore"
          @click="loadMore"
        >
          {{
            loadingMore
              ? t("page.home.loadingMoreSuggestions")
              : t("page.home.loadMoreSuggestions")
          }}
        </Button>
      </div>
    </div>
    <p
      v-else
      role="status"
      class="rounded-lg border p-6 text-sm text-muted-foreground"
    >
      <template v-if="loaded">
        {{ t("page.home.empty") }}
      </template>
      <template v-else>{{ t("page.home.loading") }}</template>
    </p>
  </section>
</template>
