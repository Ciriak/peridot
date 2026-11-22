<script setup lang="ts">
import type { MessageDescriptor } from "@peridot/contracts";
import { useLocalizedMessage } from "../composables/use-localized-message";

defineProps<{
  message: MessageDescriptor;
}>();

const { translate } = useLocalizedMessage();
</script>

<template>
  {{ translate(message) }}
</template>
