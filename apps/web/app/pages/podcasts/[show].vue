<script setup lang="ts">
import { definePageMeta, useHead, useI18n, useRoute } from "#imports";
import { computed } from "vue";
import MediaCollectionDetail from "../../components/MediaCollectionDetail.vue";

definePageMeta({ name: "podcast-detail" });

const route = useRoute();
const { t } = useI18n();
const title = computed(() => {
  const value = route.params.show;
  return String(Array.isArray(value) ? (value[0] ?? "") : (value ?? ""));
});
const publisher = computed(() => {
  const value = route.query.publisher;
  return String(Array.isArray(value) ? (value[0] ?? "") : (value ?? ""));
});
const requestedId = computed(() => {
  const value = route.query.id;
  return String(Array.isArray(value) ? (value[0] ?? "") : (value ?? ""));
});
useHead(() => ({
  title: title.value
    ? t("page.podcast.title", {
        podcast: `${title.value} by ${publisher.value}`,
      })
    : t("page.podcast.fallbackTitle"),
}));
</script>

<template>
  <MediaCollectionDetail
    media-type="podcast"
    :title="title"
    :creator="publisher"
    :requested-id="requestedId"
  />
</template>
