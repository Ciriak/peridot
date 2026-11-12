<script setup lang="ts">
import { definePageMeta, useI18n } from "#imports";

definePageMeta({ layout: "settings" });
const { t } = useI18n();
</script>

<template>
  <div class="space-y-2">
    <h2 class="text-2xl font-semibold tracking-tight">
      {{ t("settings.plugins") }}
    </h2>
    <p class="text-sm text-muted-foreground">
      {{ t("settings.plugins.description") }}
    </p>
  </div>
  <section
    :aria-label="t('settings.plugins')"
    class="rounded-lg border bg-card p-6 text-card-foreground"
  >
    <h3 class="text-lg font-semibold">
      {{ t("settings.plugins.optional") }}
    </h3>
    <p class="mt-2 text-sm text-muted-foreground">
      {{ t("settings.plugins.descriptionDetail") }}
    </p>
  </section>
</template>
