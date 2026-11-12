<script setup lang="ts">
import { useI18n } from "#imports";

const { t } = useI18n();
</script>

<template>
  <LibraryScreen :title="t('page.liked.title')" favorites />
</template>
