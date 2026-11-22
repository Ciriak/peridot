<script setup lang="ts">
import { useI18n } from "#imports";
import { Badge } from "@peridot/ui/components/ui/badge";
import { computed } from "vue";
import {
  searchResultTypeLabelKey,
  type SearchResultType,
} from "../lib/search-results";

const props = defineProps<{
  type: SearchResultType;
}>();
const { t } = useI18n();

const typeLabel = computed(() => t(searchResultTypeLabelKey(props.type)));
</script>

<template>
  <Badge variant="secondary">{{ typeLabel }}</Badge>
</template>
