<script setup lang="ts">
import { useHead } from "#imports";
import favicon from "@peridot/ui/assets/brand/favicon.png";
import AppNotifications from "./components/AppNotifications.vue";
import AppToaster from "./components/AppToaster.vue";

useHead({
  link: [{ rel: "icon", type: "image/png", href: favicon }],
});
</script>

<template>
  <NuxtLayout>
    <NuxtPage />
  </NuxtLayout>
  <AppToaster />
  <AppNotifications />
</template>
