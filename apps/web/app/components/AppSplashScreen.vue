<script setup lang="ts">
import { useI18n } from "#imports";
import { PeridotSpinner } from "@peridot/ui/components/ui/spinner";
import { onBeforeUnmount, onMounted, ref } from "vue";

const { t } = useI18n();
const splashVisible = ref(true);
const SPLASH_DURATION_MS = 500;
let hideTimer: ReturnType<typeof setTimeout> | undefined;

onMounted(() => {
  hideTimer = setTimeout(() => {
    splashVisible.value = false;
  }, SPLASH_DURATION_MS);
});

onBeforeUnmount(() => {
  if (hideTimer !== undefined) clearTimeout(hideTimer);
});
</script>

<template>
  <Transition
    leave-active-class="motion-safe:transition-opacity motion-safe:duration-200 motion-safe:ease-out"
    leave-to-class="motion-safe:opacity-0"
  >
    <div
      v-if="splashVisible"
      class="fixed inset-0 z-50 grid place-items-center bg-black"
    >
      <PeridotSpinner :label="t('common.loading')" class="size-20" />
    </div>
  </Transition>
</template>
