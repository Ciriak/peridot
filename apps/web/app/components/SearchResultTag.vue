<script setup lang="ts">
import { useI18n } from "#imports";
import type { SourceKind } from "@peridot/contracts";
import { Icon } from "@iconify/vue/offline";
import { Badge } from "@peridot/ui/components/ui/badge";
import { computed } from "vue";
import {
  searchResultTypeLabelKey,
  type SearchResultType,
} from "../lib/search-results";
import { sourceKindIcon, sourceKindLabelKey } from "../lib/source-label";

const props = defineProps<{
  type: SearchResultType;
  sourceKind?: SourceKind | null;
}>();
const { t } = useI18n();

const icon = computed(() => sourceKindIcon(props.sourceKind));
const labelKey = computed(() => sourceKindLabelKey(props.sourceKind));
const label = computed(() => (labelKey.value ? t(labelKey.value) : undefined));
const typeLabel = computed(() =>
  t(searchResultTypeLabelKey(props.type)),
);
</script>

<template>
  <span class="inline-flex shrink-0 items-center gap-1.5">
    <span
      v-if="icon && label"
      role="img"
      :aria-label="label"
      :title="label"
      class="inline-flex text-muted-foreground"
    >
      <Icon :icon="icon" aria-hidden="true" class="size-3.5" />
    </span>
    <Badge variant="secondary">{{ typeLabel }}</Badge>
  </span>
</template>
