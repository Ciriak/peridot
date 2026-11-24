<script setup lang="ts">
import { useI18n } from "#imports";
import type { LibrarySourceKind } from "@peridot/contracts";
import { Icon } from "@iconify/vue/offline";
import { computed } from "vue";
import { sourceKindIcon, sourceKindLabelKey } from "../lib/source-label";

const props = defineProps<{
  sourceKinds?: readonly (LibrarySourceKind | "torznab")[] | null;
}>();
const { t } = useI18n();

const sources = computed(() =>
  [...new Set(props.sourceKinds ?? [])].flatMap((kind) => {
    const icon = sourceKindIcon(kind);
    const labelKey = sourceKindLabelKey(kind);
    return icon && labelKey ? [{ kind, icon, label: t(labelKey) }] : [];
  }),
);
const sourceLabel = computed(() => {
  const [source] = sources.value;
  if (!source) return undefined;
  if (sources.value.length > 1) {
    return t("page.search.sourcesMultiple");
  }
  return t("page.search.sourceProvided", { source: source.label });
});
</script>

<template>
  <span
    v-if="sourceLabel"
    role="img"
    :aria-label="sourceLabel"
    :title="sourceLabel"
    class="inline-flex shrink-0 items-center gap-1 text-muted-foreground"
  >
    <Icon
      v-for="source in sources"
      :key="source.kind"
      :icon="source.icon"
      aria-hidden="true"
      class="size-3.5"
    />
  </span>
</template>
