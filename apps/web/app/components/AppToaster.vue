<script setup lang="ts">
import { ToastProvider } from "reka-ui";
import { appToastManager } from "../lib/toasts";
import AppToastList from "./AppToastList.vue";
</script>

<template>
  <ToastProvider
    :toast-manager="appToastManager"
    label="Peridot notifications"
    :duration="5000"
    :limit="3"
    swipe-direction="right"
  >
    <AppToastList />
  </ToastProvider>
</template>
