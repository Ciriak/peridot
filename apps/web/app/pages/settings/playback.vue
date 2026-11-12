<script setup lang="ts">
import { definePageMeta, useI18n } from "#imports";

definePageMeta({ layout: "settings" });
const { t } = useI18n();
</script>

<template>
  <div class="space-y-2">
    <h2 class="text-2xl font-semibold tracking-tight">
      {{ t("settings.playback") }}
    </h2>
    <p class="text-sm text-muted-foreground">
      {{ t("settings.placeholder.playback") }}
    </p>
  </div>
</template>
