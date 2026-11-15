<script setup lang="ts">
import { definePageMeta, useHead, useI18n, useRoute } from "#imports";
import { computed } from "vue";
import MediaCollectionDetail from "../../components/MediaCollectionDetail.vue";

definePageMeta({ name: "audiobook-detail" });

const route = useRoute();
const { t } = useI18n();
const title = computed(() => {
  const value = route.params.book;
  return String(Array.isArray(value) ? (value[0] ?? "") : (value ?? ""));
});
const author = computed(() => {
  const value = route.query.author;
  return String(Array.isArray(value) ? (value[0] ?? "") : (value ?? ""));
});
const requestedId = computed(() => {
  const value = route.query.id;
  return String(Array.isArray(value) ? (value[0] ?? "") : (value ?? ""));
});
useHead(() => ({
  title: title.value
    ? t("page.audiobook.title", {
        audiobook: `${title.value} by ${author.value}`,
      })
    : t("page.audiobook.fallbackTitle"),
}));
</script>

<template>
  <MediaCollectionDetail
    media-type="audiobook"
    :title="title"
    :creator="author"
    :requested-id="requestedId"
  />
</template>
