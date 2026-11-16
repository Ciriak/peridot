<script setup lang="ts">
import { definePageMeta, useI18n } from "#imports";
import { Icon } from "@iconify/vue/offline";
import { Switch } from "@peridot/ui/components/ui/switch";
import { computed } from "vue";
import { useLibrarySettings } from "../../composables/use-library-settings";
import { useOfflineCatalog } from "../../composables/use-offline-catalog";
import { icons } from "../../lib/icons";
import { OFFLINE_CATALOG_MAX_TRACKS } from "../../lib/offline-catalog";

definePageMeta({ layout: "settings" });
const { t, n } = useI18n();
const { likedTitlesOffline, setLikedTitlesOffline } = useLibrarySettings();
const { syncStatus } = useOfflineCatalog();
const likedTitlesOfflineModel = computed({
  get: () => likedTitlesOffline.value,
  set: setLikedTitlesOffline,
});
</script>

<template>
  <div class="space-y-6">
    <h2 class="text-2xl font-semibold tracking-tight">
      {{ t("settings.library") }}
    </h2>
    <section
      aria-labelledby="liked-titles-offline-label"
      class="rounded-lg border bg-card p-4 text-card-foreground"
    >
      <div class="flex items-start gap-3">
        <div
          class="flex size-10 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground"
        >
          <Icon :icon="icons.cloudDownload" aria-hidden="true" class="size-5" />
        </div>
        <div class="min-w-0 flex-1 space-y-1">
          <p id="liked-titles-offline-label" class="text-sm font-medium">
            {{ t("settings.library.likedTitlesOffline") }}
          </p>
          <p class="text-sm text-muted-foreground">
            {{ t("settings.library.likedTitlesOfflineHelp") }}
          </p>
        </div>
        <Switch
          id="liked-titles-offline"
          v-model="likedTitlesOfflineModel"
          :aria-labelledby="'liked-titles-offline-label'"
        />
      </div>
    </section>
    <p
      v-if="syncStatus === 'too-large'"
      role="status"
      class="rounded-lg border bg-card p-4 text-sm text-muted-foreground"
    >
      {{
        t("settings.library.largeCatalogOfflineUnavailable", {
          limit: n(OFFLINE_CATALOG_MAX_TRACKS, "integer"),
        })
      }}
    </p>
  </div>
</template>
