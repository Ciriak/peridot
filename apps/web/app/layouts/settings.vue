<script setup lang="ts">
import { useI18n, useRoute, useRuntimeConfig } from "#imports";
import { Icon } from "@iconify/vue/offline";
import type { TaskStatus } from "@peridot/contracts";
import { Badge } from "@peridot/ui/components/ui/badge";
import { Button } from "@peridot/ui/components/ui/button";
import { ProgressCircle } from "@peridot/ui/components/ui/progress-circle";
import { computed, ref, watch } from "vue";
import ServerConnectionIndicator from "../components/ServerConnectionIndicator.vue";
import { useAdminSourcesQuery } from "../composables/use-admin-queries";
import { useOfflineDownloadTasks } from "../composables/use-offline-download-tasks";
import { useTasks } from "../composables/use-tasks";
import { useUser } from "../composables/use-user";
import { downloadTaskProgressPercent } from "../lib/download-tasks";
import { icons } from "../lib/icons";
import {
  activeTaskPercent,
  isActiveTaskStatus,
  overallTaskProgress,
} from "../lib/task-progress";

const route = useRoute();
const { t, n } = useI18n();
const { user } = useUser();
const {
  items: sources,
  loaded: sourcesLoaded,
  load: loadSources,
} = useAdminSourcesQuery();
const { tasks } = useTasks();
const { activeTasks: activeDownloadTasks } = useOfflineDownloadTasks();
const runtimeConfig = useRuntimeConfig();
const appVersion = runtimeConfig.public.appVersion;
const environment = runtimeConfig.public.environment;
const mobileNavigation = ref(false);
const previousLibraryTaskStatuses = new Map<string, TaskStatus>();
const sourceCount = computed(() => sources.value.length);
const activeTasks = computed(() =>
  tasks.value.filter((task) => isActiveTaskStatus(task.status)),
);
const activeServerTasks = computed(() =>
  user.value?.role === "admin" ? activeTasks.value : [],
);
const activeMetadataTasks = computed(() =>
  tasks.value.filter(
    (task) => task.kind === "metadata_fetch" && isActiveTaskStatus(task.status),
  ),
);
const metadataTaskProgress = computed(() =>
  overallTaskProgress(activeMetadataTasks.value),
);
const activeTaskCount = computed(
  () => activeServerTasks.value.length + activeDownloadTasks.value.length,
);
const combinedTaskProgress = computed(() => {
  const taskCount = activeTaskCount.value;
  if (!taskCount) return null;
  const hasRunningTask =
    activeServerTasks.value.some((task) => task.status === "running") ||
    activeDownloadTasks.value.some((task) => task.status === "running");
  if (!hasRunningTask) return null;
  const values = [
    ...activeServerTasks.value.map(activeTaskPercent),
    ...activeDownloadTasks.value.map(downloadTaskProgressPercent),
  ];
  if (values.some((value) => value === null)) return null;
  return (
    values.reduce<number>((total, value) => total + (value ?? 0), 0) /
    values.length
  );
});
const commonCategories = [
  { labelKey: "settings.profile", to: "/settings/account", icon: icons.user },
  {
    labelKey: "settings.library",
    to: "/settings/library",
    icon: icons.library,
  },
  { labelKey: "settings.tasks", to: "/settings/tasks", icon: icons.restart },
  {
    labelKey: "settings.playback",
    to: "/settings/playback",
    icon: icons.music,
  },
];
const adminCategories = [
  { labelKey: "settings.users", to: "/settings/users", icon: icons.user },
  { labelKey: "settings.sources", to: "/settings/sources", icon: icons.folder },
  {
    labelKey: "settings.metadata",
    to: "/settings/metadata",
    icon: icons.metadata,
  },
  { labelKey: "settings.server", to: "/settings/server", icon: icons.server },
];

watch(
  () => route.path,
  () => {
    mobileNavigation.value = false;
  },
);

watch(tasks, (current) => {
  let completedLibraryScan = false;
  for (const task of current) {
    if (task.kind !== "library_scan") continue;
    const previous = previousLibraryTaskStatuses.get(task.id);
    if (previous !== task.status && task.status === "completed") {
      completedLibraryScan = true;
    }
    previousLibraryTaskStatuses.set(task.id, task.status);
  }
  if (completedLibraryScan) void loadSources(true);
});
</script>

<template>
  <div class="flex h-dvh overflow-hidden bg-background text-foreground">
    <a href="#settings-content" class="sr-only focus:not-sr-only focus:p-4">{{
      t("navigation.skipToContent")
    }}</a>
    <aside
      id="settings-sidebar"
      :aria-label="t('navigation.settingsNavigation')"
      :class="[
        'w-56 shrink-0 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground',
        mobileNavigation
          ? 'absolute inset-y-0 left-0 z-20 flex'
          : 'hidden md:flex',
      ]"
    >
      <div
        class="flex h-16 shrink-0 items-center justify-between border-b border-sidebar-border px-4"
      >
        <Button
          as-child
          variant="ghost"
          class="flex-1 justify-start font-semibold"
          ><NuxtLink to="/" :aria-label="t('navigation.backHome')"
            ><Icon
              :icon="icons.arrowLeft"
              aria-hidden="true"
              class="size-5"
            />{{ t("common.back") }}</NuxtLink
          ></Button
        >
        <Button
          variant="ghost"
          size="icon-sm"
          class="md:hidden"
          :aria-label="t('navigation.closeSettings')"
          @click="mobileNavigation = false"
          ><Icon :icon="icons.close" aria-hidden="true"
        /></Button>
      </div>
      <nav
        :aria-label="t('navigation.settingsCategories')"
        class="flex-1 space-y-4 overflow-y-auto p-3"
      >
        <div class="space-y-1">
          <Button
            v-for="item in commonCategories"
            :key="item.to"
            as-child
            variant="ghost"
            :class="[
              'w-full justify-start',
              route.path === item.to &&
                'bg-sidebar-accent text-sidebar-accent-foreground',
            ]"
          >
            <NuxtLink
              :to="item.to"
              :aria-current="route.path === item.to ? 'page' : undefined"
            >
              <Icon :icon="item.icon" aria-hidden="true" class="size-5" />{{
                t(item.labelKey)
              }}
              <ProgressCircle
                v-if="item.to === '/settings/tasks' && activeTaskCount > 0"
                size="sm"
                :value="combinedTaskProgress"
                :label="
                  t('settings.tasks.progressFor', {
                    title: t('settings.tasks'),
                  })
                "
                class="ml-auto size-4"
              />
            </NuxtLink>
          </Button>
        </div>

        <section
          v-if="user?.role === 'admin'"
          aria-labelledby="admin-settings-heading"
          class="space-y-1 border-t border-sidebar-border pt-4"
        >
          <h2
            id="admin-settings-heading"
            class="px-3 pb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground"
          >
            {{ t("navigation.admin") }}
          </h2>
          <Button
            v-for="item in adminCategories"
            :key="item.to"
            as-child
            variant="ghost"
            :class="[
              'w-full justify-start',
              route.path === item.to &&
                'bg-sidebar-accent text-sidebar-accent-foreground',
            ]"
          >
            <NuxtLink
              :to="item.to"
              :aria-current="route.path === item.to ? 'page' : undefined"
            >
              <Icon :icon="item.icon" aria-hidden="true" class="size-5" />{{
                t(item.labelKey)
              }}
              <span class="ml-auto flex items-center gap-2">
                <ProgressCircle
                  v-if="
                    item.to === '/settings/metadata' &&
                    activeMetadataTasks.length
                  "
                  size="sm"
                  :value="metadataTaskProgress"
                  :label="
                    t('settings.tasks.progressFor', {
                      title: t('settings.metadata'),
                    })
                  "
                  class="size-4"
                />
                <Badge
                  v-if="item.to === '/settings/sources' && sourcesLoaded"
                  variant="secondary"
                >
                  {{ n(sourceCount, "integer") }}
                </Badge>
              </span>
            </NuxtLink>
          </Button>
        </section>
      </nav>
      <div
        class="shrink-0 border-t border-sidebar-border p-3 text-xs leading-tight text-muted-foreground/60"
      >
        <dl class="space-y-1">
          <div class="flex justify-between gap-3">
            <dt>{{ t("navigation.version") }}</dt>
            <dd>{{ appVersion }}</dd>
          </div>
          <div class="flex justify-between gap-3">
            <dt>{{ t("navigation.environment") }}</dt>
            <dd>{{ environment }}</dd>
          </div>
        </dl>
      </div>
    </aside>

    <div class="flex min-w-0 flex-1 flex-col">
      <header
        class="flex min-h-16 shrink-0 items-center gap-3 border-b px-4 md:px-6"
      >
        <Button
          variant="outline"
          size="icon"
          class="md:hidden"
          :aria-label="t('navigation.toggleSettings')"
          aria-controls="settings-sidebar"
          :aria-expanded="mobileNavigation"
          @click="mobileNavigation = !mobileNavigation"
          ><Icon :icon="icons.menu" aria-hidden="true"
        /></Button>
        <h1 class="text-lg font-semibold">{{ t("settings.title") }}</h1>
        <div class="ml-auto flex items-center gap-2">
          <ServerConnectionIndicator />
        </div>
      </header>
      <main
        id="settings-content"
        tabindex="-1"
        class="min-h-0 flex-1 overflow-y-auto p-4 md:p-6"
      >
        <div class="mx-auto flex min-h-full max-w-4xl flex-col space-y-8">
          <slot />
        </div>
      </main>
    </div>
  </div>
</template>
