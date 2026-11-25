<script setup lang="ts">
import { useI18n } from "#imports";
import { Badge } from "@peridot/ui/components/ui/badge";
import { PeridotSpinner } from "@peridot/ui/components/ui/spinner";
import { computed } from "vue";
import { useTasks } from "../composables/use-tasks";
import { hasRunningLibraryScan } from "../lib/task-progress";

const { t } = useI18n();
const { tasks } = useTasks();
const indexing = computed(() => hasRunningLibraryScan(tasks.value));
</script>

<template>
  <Badge
    v-if="indexing"
    variant="outline"
    aria-live="polite"
    class="select-none"
  >
    <PeridotSpinner :label="t('page.catalog.indexing')" class="size-3" />
    {{ t("page.catalog.indexing") }}
  </Badge>
</template>
