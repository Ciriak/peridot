<script setup lang="ts">
import { definePageMeta, useI18n } from "#imports";
import { Icon } from "@iconify/vue/offline";
import { Button } from "@peridot/ui/components/ui/button";
import { ProgressCircle } from "@peridot/ui/components/ui/progress-circle";
import { Switch } from "@peridot/ui/components/ui/switch";
import { computed } from "vue";
import { useLibrarySettings } from "../../composables/use-library-settings";
import { useLocalizedMessage } from "../../composables/use-localized-message";
import { useOfflineCatalog } from "../../composables/use-offline-catalog";
import { useOfflineTracks } from "../../composables/use-offline-tracks";
import { useServerConnection } from "../../composables/use-server-connection";
import { icons } from "../../lib/icons";
import { OFFLINE_CATALOG_MAX_TRACKS } from "../../lib/offline-catalog";
import { isDownloadTaskTerminal } from "../../lib/download-tasks";

definePageMeta({ layout: "settings" });
const { t, n } = useI18n();
const { translate } = useLocalizedMessage();
const {
  likedTitlesOffline,
  setLikedTitlesOffline,
  verification,
  verificationError,
  saving,
  verified,
} = useLibrarySettings();
const { syncStatus } = useOfflineCatalog();
const { status: serverStatus } = useServerConnection();
const { downloadTasks } = useOfflineTracks();
const likedTitlesOfflineModel = computed({
  get: () => likedTitlesOffline.value,
  set: (value: boolean) => void setLikedTitlesOffline(value),
});
const activeDownloadTasks = computed(() => downloadTasks.activeTasks.value);
const taskHistory = computed(() =>
  downloadTasks.orderedTasks().filter(isDownloadTaskTerminal).slice(0, 20),
);
const switchDisabled = computed(
  () =>
    !verified.value ||
    saving.value ||
    verification.value === "verifying" ||
    serverStatus.value === "lost",
);
</script>

<template>
  <div class="space-y-6">
    <h2 class="text-2xl font-semibold tracking-tight">
      {{ t("settings.library") }}
    </h2>
    <section
      aria-labelledby="liked-titles-offline-label"
      class="rounded-lg border bg-card p-4 text-card-foreground"
    >
      <div class="flex items-start gap-3">
        <div
          class="flex size-10 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground"
        >
          <Icon :icon="icons.cloudDownload" aria-hidden="true" class="size-5" />
        </div>
        <div class="min-w-0 flex-1 space-y-1">
          <p id="liked-titles-offline-label" class="text-sm font-medium">
            {{ t("settings.library.likedTitlesOffline") }}
          </p>
          <p class="text-sm text-muted-foreground">
            {{ t("settings.library.likedTitlesOfflineHelp") }}
          </p>
        </div>
        <Switch
          id="liked-titles-offline"
          v-model="likedTitlesOfflineModel"
          :aria-labelledby="'liked-titles-offline-label'"
          :disabled="switchDisabled"
        />
      </div>
      <p
        v-if="verification === 'verifying' || saving"
        class="mt-3 text-sm text-muted-foreground"
        role="status"
      >
        {{ t("settings.library.preferenceSaving") }}
      </p>
      <p
        v-else-if="verificationError"
        class="mt-3 text-sm text-destructive"
        role="alert"
      >
        {{ verificationError }}
      </p>
      <p
        v-else-if="!verified && serverStatus === 'lost'"
        class="mt-3 text-sm text-muted-foreground"
      >
        {{ t("settings.library.preferenceOffline") }}
      </p>
    </section>
    <p
      v-if="syncStatus === 'too-large'"
      role="status"
      class="rounded-lg border bg-card p-4 text-sm text-muted-foreground"
    >
      {{
        t("settings.library.largeCatalogOfflineUnavailable", {
          limit: n(OFFLINE_CATALOG_MAX_TRACKS, "integer"),
        })
      }}
    </p>

    <section
      id="download-tasks"
      aria-labelledby="download-tasks-heading"
      class="space-y-4"
    >
      <div class="space-y-1">
        <h3 id="download-tasks-heading" class="text-lg font-semibold">
          {{ t("downloadTasks.title") }}
        </h3>
        <p class="text-sm text-muted-foreground">
          {{ t("downloadTasks.description") }}
        </p>
      </div>

      <div v-if="activeDownloadTasks.length" class="space-y-3">
        <article
          v-for="task in activeDownloadTasks"
          :key="task.id"
          class="rounded-lg border bg-card p-4 text-card-foreground"
        >
          <div class="flex items-start gap-4">
            <ProgressCircle
              size="sm"
              :value="downloadTasks.progressForTask(task)"
              :label="translate(task.titleMessage)"
              class="mt-0.5 size-6"
            />
            <div class="min-w-0 flex-1">
              <div class="flex flex-wrap items-start justify-between gap-2">
                <div class="min-w-0">
                  <h4 class="truncate text-sm font-semibold">
                    {{ translate(task.titleMessage) }}
                  </h4>
                  <p class="mt-1 text-xs text-muted-foreground">
                    {{ t(`downloadTasks.status.${task.status}`) }}
                  </p>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  @click="downloadTasks.cancel(task.id)"
                >
                  {{
                    task.status === "running"
                      ? t("downloadTasks.stop")
                      : t("downloadTasks.cancel")
                  }}
                </Button>
              </div>
              <p class="mt-3 text-xs text-muted-foreground">
                <template v-if="task.progress.total !== null">
                  {{
                    t("downloadTasks.progress", {
                      completed: task.progress.completed,
                      total: task.progress.total,
                    })
                  }}
                </template>
                <template v-else>
                  {{ t("downloadTasks.preparing") }}
                </template>
              </p>
            </div>
          </div>
        </article>
      </div>
      <p
        v-else
        class="rounded-lg border bg-card p-4 text-sm text-muted-foreground"
      >
        {{ t("downloadTasks.noneActive") }}
      </p>

      <div v-if="taskHistory.length" class="space-y-2">
        <h4 class="text-sm font-semibold">
          {{ t("downloadTasks.history") }}
        </h4>
        <article
          v-for="task in taskHistory"
          :key="task.id"
          class="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-card p-3 text-card-foreground"
        >
          <div class="min-w-0">
            <p class="truncate text-sm font-medium">
              {{ translate(task.titleMessage) }}
            </p>
            <p class="text-xs text-muted-foreground">
              {{ t(`downloadTasks.status.${task.status}`) }}
            </p>
            <p v-if="task.failureMessage" class="mt-1 text-xs text-destructive">
              {{ task.failureMessage }}
            </p>
          </div>
          <Button
            v-if="
              task.status === 'failed' ||
              task.status === 'completed_with_errors'
            "
            type="button"
            variant="outline"
            size="sm"
            @click="downloadTasks.retry(task.id)"
          >
            {{ t("downloadTasks.retry") }}
          </Button>
        </article>
      </div>
    </section>
  </div>
</template>
