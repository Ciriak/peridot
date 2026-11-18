<script setup lang="ts">
import type { PluginResponse } from "@peridot/contracts";
import { Button } from "@peridot/ui/components/ui/button";
import { computed, ref } from "vue";
import { useI18n } from "#imports";
import { useLocalizedMessage } from "../composables/use-localized-message";
import { useServer } from "../composables/use-server";
import { useSession } from "../composables/use-session";
import {
  isAuthenticationRedirectError,
  runPluginTask,
} from "../lib/peridot-client";

const props = defineProps<{ plugin: PluginResponse }>();
const { t } = useI18n();
const { translate, errorMessage } = useLocalizedMessage();
const { address } = useServer();
const { token } = useSession();
const runningTask = ref<string | null>(null);
const error = ref("");
const tasks = computed(() =>
  props.plugin.contributions.flatMap((contribution) =>
    contribution.kind === "data-processor" ? contribution.tasks : [],
  ),
);

async function run(taskId: string) {
  if (!address.value || !token.value || runningTask.value) return;
  runningTask.value = taskId;
  error.value = "";
  try {
    await runPluginTask(address.value, token.value, props.plugin.id, taskId);
  } catch (reason) {
    if (isAuthenticationRedirectError(reason)) return;
    error.value = errorMessage(reason, "settings.plugins.taskStartError");
  } finally {
    runningTask.value = null;
  }
}
</script>

<template>
  <div v-if="tasks.length" class="mt-4 space-y-3 border-t pt-4">
    <h5 class="text-sm font-semibold">
      {{ t("settings.plugins.tasks") }}
    </h5>
    <div class="flex flex-wrap gap-2">
      <Button
        v-for="task in tasks"
        :key="task.id"
        type="button"
        variant="outline"
        size="sm"
        :disabled="runningTask !== null || !plugin.settings.configured"
        @click="run(task.id)"
      >
        {{
          runningTask === task.id
            ? t("settings.plugins.startingTask")
            : translate(task.titleMessage, task.id)
        }}
      </Button>
    </div>
    <p v-if="error" role="alert" class="text-sm text-destructive">
      {{ error }}
    </p>
  </div>
</template>
