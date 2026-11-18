<script setup lang="ts">
import { useHead, useI18n } from "#imports";

const { t } = useI18n();
useHead({ title: t("page.liked.title") });
</script>

<template>
  <LibraryScreen :title="t('navigation.likedSongs')" favorites />
</template>
