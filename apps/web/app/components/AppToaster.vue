<script setup lang="ts">
import { useI18n } from "#imports";
import { Icon } from "@iconify/vue/offline";
import { Toaster } from "@peridot/ui/components/ui/sonner";
import { PeridotSpinner } from "@peridot/ui/components/ui/spinner";
import type { ToasterProps } from "vue-sonner";
import { computed } from "vue";
import { icons } from "../lib/icons";
import {
  TOAST_CLASSES,
  TOAST_MOBILE_OFFSET,
  TOAST_OFFSET,
  TOAST_POSITION,
  TOAST_SWIPE_DIRECTIONS,
} from "../lib/toast-options";

const { t } = useI18n();

const toastOptions = computed<NonNullable<ToasterProps["toastOptions"]>>(
  () => ({
    classes: TOAST_CLASSES,
    closeButtonAriaLabel: t("toast.dismiss"),
  }),
);
</script>

<template>
  <Toaster
    :position="TOAST_POSITION"
    theme="dark"
    :duration="5000"
    :visible-toasts="3"
    close-button
    :swipe-directions="TOAST_SWIPE_DIRECTIONS"
    :offset="TOAST_OFFSET"
    :mobile-offset="TOAST_MOBILE_OFFSET"
    :toast-options="toastOptions"
    :container-aria-label="t('toast.notifications')"
  >
    <template #success-icon>
      <Icon :icon="icons.check" aria-hidden="true" class="size-4" />
    </template>
    <template #info-icon>
      <Icon :icon="icons.info" aria-hidden="true" class="size-4" />
    </template>
    <template #warning-icon>
      <Icon :icon="icons.warning" aria-hidden="true" class="size-4" />
    </template>
    <template #error-icon>
      <Icon :icon="icons.cloudOff" aria-hidden="true" class="size-4" />
    </template>
    <template #loading-icon>
      <PeridotSpinner
        :label="t('toast.notifications')"
        aria-hidden="true"
        class="size-4"
      />
    </template>
    <template #close-icon>
      <Icon :icon="icons.close" aria-hidden="true" class="size-4" />
    </template>
  </Toaster>
</template>
