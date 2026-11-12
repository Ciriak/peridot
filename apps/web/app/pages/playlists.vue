<script setup lang="ts">
import { useI18n } from "#imports";
import { Button } from "@peridot/ui/components/ui/button";

const { t } = useI18n();
</script>

<template>
  <div class="space-y-2">
    <h1 class="text-2xl font-semibold tracking-tight">
      {{ t("navigation.playlists") }}
    </h1>
    <p class="text-sm text-muted-foreground">
      {{ t("page.playlists.description") }}
    </p>
  </div>
  <section
    :aria-label="t('navigation.playlists')"
    class="rounded-lg border bg-card p-6 text-card-foreground"
  >
    <h2 class="text-lg font-semibold">
      {{ t("page.playlists.emptyTitle") }}
    </h2>
    <p class="mt-2 text-sm text-muted-foreground">
      {{ t("page.playlists.placeholder") }}
    </p>
    <Button as-child variant="outline" class="mt-4"
      ><NuxtLink to="/library">{{
        t("page.playlists.browse")
      }}</NuxtLink></Button
    >
  </section>
</template>
