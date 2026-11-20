<script setup lang="ts">
import { navigateTo, useI18n, useRouter } from "#imports";
import { Icon } from "@iconify/vue/offline";
import { Button } from "@peridot/ui/components/ui/button";
import { icons } from "../lib/icons";
import { navigateBack } from "../lib/navigation";

withDefaults(defineProps<{ iconOnly?: boolean }>(), {
  iconOnly: false,
});

const router = useRouter();
const { t } = useI18n();

function goBack() {
  navigateBack(router, () => navigateTo("/"), window.history);
}
</script>

<template>
  <div :class="iconOnly ? undefined : 'mb-2'">
    <Button
      v-if="iconOnly"
      variant="ghost"
      size="icon"
      type="button"
      :aria-label="t('common.back')"
      @click="goBack"
    >
      <Icon :icon="icons.caretLeft" aria-hidden="true" class="size-6" />
    </Button>
    <Button
      v-else
      variant="ghost"
      size="lg"
      type="button"
      class="min-w-40 justify-start"
      :aria-label="t('common.back')"
      @click="goBack"
    >
      <Icon :icon="icons.caretLeft" aria-hidden="true" class="size-6" />
      {{ t("common.back") }}
    </Button>
  </div>
</template>
