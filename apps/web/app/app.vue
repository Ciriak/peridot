<script setup lang="ts">
import { useHead } from "#imports";
import favicon from "@peridot/ui/assets/brand/favicon.png";
import { useLibraryPlayer } from "./composables/use-library-player";
import AppNotifications from "./components/AppNotifications.vue";
import AppToaster from "./components/AppToaster.vue";

useHead({
  link: [{ rel: "icon", type: "image/png", href: favicon }],
});

useLibraryPlayer({ audio: true });
</script>

<template>
  <NuxtLayout>
    <NuxtPage />
  </NuxtLayout>
  <AppToaster />
  <AppNotifications />
</template>
