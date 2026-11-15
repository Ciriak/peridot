<script setup lang="ts">
import { useI18n } from "#imports";
import { ToastProvider } from "reka-ui";
import { appToastManager } from "../lib/toasts";
import AppToastList from "./AppToastList.vue";

const { t } = useI18n();
</script>

<template>
  <ToastProvider
    :toast-manager="appToastManager"
    :label="t('toast.notifications')"
    :duration="5000"
    :limit="3"
    swipe-direction="right"
  >
    <AppToastList />
  </ToastProvider>
</template>
