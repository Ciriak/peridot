<script setup lang="ts">
import { definePageMeta, useI18n } from "#imports";
import { Icon } from "@iconify/vue/offline";
import { icons } from "../../../lib/icons";

definePageMeta({ layout: "settings" });
const { t } = useI18n();
const sections = [
  {
    labelKey: "settings.connectors.librarySources",
    descriptionKey: "settings.connectors.librarySourcesDescription",
    to: "/settings/connectors/library-sources",
    icon: icons.folder,
  },
  {
    labelKey: "settings.connectors.releaseIndexers",
    descriptionKey: "settings.connectors.releaseIndexersDescription",
    to: "/settings/connectors/release-indexers",
    icon: icons.globe,
  },
  {
    labelKey: "settings.connectors.downloadClients",
    descriptionKey: "settings.connectors.downloadClientsDescription",
    to: "/settings/connectors/download-clients",
    icon: icons.download,
  },
  {
    labelKey: "settings.connectors.metadataProviders",
    descriptionKey: "settings.connectors.metadataProvidersDescription",
    to: "/settings/connectors/metadata-providers",
    icon: icons.metadata,
  },
] as const;
</script>

<template>
  <div class="space-y-4">
    <div class="space-y-2">
      <h2 class="text-2xl font-semibold tracking-tight">
        {{ t("settings.connectors.title") }}
      </h2>
      <p class="text-sm text-muted-foreground">
        {{ t("settings.connectors.description") }}
      </p>
    </div>
    <div class="grid gap-3 md:grid-cols-2">
      <NuxtLink
        v-for="section in sections"
        :key="section.to"
        :to="section.to"
        class="rounded-lg border bg-card p-5 text-card-foreground transition-colors hover:bg-accent"
      >
        <span class="flex items-center gap-3 font-medium">
          <Icon :icon="section.icon" aria-hidden="true" class="size-5" />
          {{ t(section.labelKey) }}
        </span>
        <span class="mt-2 block text-sm text-muted-foreground">
          {{ t(section.descriptionKey) }}
        </span>
      </NuxtLink>
    </div>
  </div>
</template>
