<script setup lang="ts">
import { navigateTo, useI18n, useRouter } from "#imports";
import { Icon } from "@iconify/vue/offline";
import { Button } from "@peridot/ui/components/ui/button";
import { icons } from "../lib/icons";
import { navigateBack } from "../lib/navigation";

const router = useRouter();
const { t } = useI18n();

function goBack() {
  navigateBack(router, () => navigateTo("/"), window.history);
}
</script>

<template>
  <div class="mb-2">
    <Button
      variant="ghost"
      size="lg"
      type="button"
      class="min-w-40 justify-start"
      @click="goBack"
    >
      <Icon :icon="icons.arrowLeft" aria-hidden="true" />
      {{ t("common.back") }}
    </Button>
  </div>
</template>
