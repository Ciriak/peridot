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
import { useSwipeSidebar } from "../composables/use-swipe-sidebar";
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
const navigationSwipeArea = ref<HTMLElement | null>(null);
const navigationDrawer = ref<HTMLElement | null>(null);
const previousLibraryTaskStatuses = new Map<string, TaskStatus>();
const sourceCount = computed(() => sources.value.length);
const activeTasks = computed(() =>
  tasks.value.filter((task) => isActiveTaskStatus(task.status)),
);
const activeServerTasks = computed(() =>
  user.value?.role === "admin"
    ? activeTasks.value
    : activeTasks.value.filter((task) => task.kind === "release_import"),
);
const activeMetadataTasks = computed(() =>
  tasks.value.filter(
    (task) =>
      task.kind === "metadata_enrichment" && isActiveTaskStatus(task.status),
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
    activeServerTasks.value.some(
      (task) => task.status === "running" || task.status === "waiting",
    ) || activeDownloadTasks.value.some((task) => task.status === "running");
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
  {
    labelKey: "settings.overview",
    to: "/settings/overview",
    icon: icons.overview,
  },
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
  {
    labelKey: "settings.medias",
    to: "/settings/medias",
    icon: icons.metadata,
  },
  { labelKey: "settings.users", to: "/settings/users", icon: icons.user },
  { labelKey: "settings.server", to: "/settings/server", icon: icons.server },
];
const wideContent = computed(
  () =>
    route.path === "/settings/medias" || route.path === "/settings/overview",
);
const connectorCategories = [
  {
    labelKey: "settings.connectors.librarySources",
    to: "/settings/connectors/library-sources",
    icon: icons.library,
  },
  {
    labelKey: "settings.connectors.releaseIndexers",
    to: "/settings/connectors/release-indexers",
    icon: icons.globe,
  },
  {
    labelKey: "settings.connectors.downloadClients",
    to: "/settings/connectors/download-clients",
    icon: icons.download,
  },
  {
    labelKey: "settings.connectors.metadataProviders",
    to: "/settings/connectors/metadata-providers",
    icon: icons.metadata,
  },
];
const {
  isMobile: mobileNavigationViewport,
  dragging: mobileNavigationDragging,
  interactive: mobileNavigationInteractive,
  drawerStyle: mobileNavigationTransform,
  backdropStyle: mobileNavigationBackdropStyle,
} = useSwipeSidebar(navigationSwipeArea, navigationDrawer, mobileNavigation);
const navigationInert = computed(
  () => mobileNavigationViewport.value && !mobileNavigationInteractive.value,
);

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
  <div
    ref="navigationSwipeArea"
    class="flex h-dvh touch-pan-y overflow-hidden overscroll-x-none bg-background text-foreground"
  >
    <a href="#settings-content" class="sr-only focus:not-sr-only focus:p-4">{{
      t("navigation.skipToContent")
    }}</a>
    <button
      type="button"
      data-sidebar-backdrop
      class="fixed inset-0 z-40 cursor-default bg-background/80 backdrop-blur-sm md:hidden"
      :class="[
        mobileNavigationDragging
          ? 'transition-none'
          : 'transition-opacity duration-300 ease-out motion-reduce:transition-none',
        mobileNavigationInteractive
          ? 'pointer-events-auto'
          : 'pointer-events-none',
      ]"
      :style="mobileNavigationBackdropStyle"
      :aria-label="t('navigation.closeSettings')"
      :aria-hidden="mobileNavigationInteractive ? undefined : 'true'"
      :tabindex="mobileNavigationInteractive ? undefined : -1"
      @click="mobileNavigation = false"
    />
    <aside
      ref="navigationDrawer"
      id="settings-sidebar"
      :aria-label="t('navigation.settingsNavigation')"
      :inert="navigationInert"
      :aria-hidden="navigationInert ? 'true' : undefined"
      :style="mobileNavigationTransform"
      :class="[
        'absolute inset-y-0 left-0 z-50 flex w-56 shrink-0 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground transform-gpu md:static md:translate-x-0',
        mobileNavigationDragging
          ? 'transition-none'
          : 'transition-transform duration-300 ease-out motion-reduce:transition-none',
        mobileNavigationInteractive
          ? 'pointer-events-auto'
          : 'pointer-events-none md:pointer-events-auto',
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
            v-for="connector in connectorCategories"
            :key="connector.to"
            as-child
            variant="ghost"
            :class="[
              'w-full justify-start',
              route.path === connector.to &&
                'bg-sidebar-accent text-sidebar-accent-foreground',
            ]"
          >
            <NuxtLink
              :to="connector.to"
              :aria-current="route.path === connector.to ? 'page' : undefined"
            >
              <Icon :icon="connector.icon" aria-hidden="true" class="size-4" />
              <span class="min-w-0 truncate">{{ t(connector.labelKey) }}</span>
              <span class="ml-auto flex items-center gap-2">
                <ProgressCircle
                  v-if="
                    connector.to ===
                      '/settings/connectors/metadata-providers' &&
                    activeMetadataTasks.length
                  "
                  size="sm"
                  :value="metadataTaskProgress"
                  :label="
                    t('settings.tasks.progressFor', {
                      title: t('settings.connectors.metadataProviders'),
                    })
                  "
                  class="size-4"
                />
                <Badge
                  v-if="
                    connector.to === '/settings/connectors/library-sources' &&
                    sourcesLoaded
                  "
                  variant="secondary"
                >
                  {{ n(sourceCount, "integer") }}
                </Badge>
              </span>
            </NuxtLink>
          </Button>
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
        class="min-h-0 flex-1"
        :class="
          wideContent ? 'overflow-hidden p-0' : 'overflow-y-auto p-4 md:p-6'
        "
      >
        <div
          class="flex w-full flex-col"
          :class="
            wideContent
              ? 'h-full min-h-0 max-w-none space-y-0'
              : 'mx-auto min-h-full max-w-4xl space-y-8'
          "
        >
          <slot />
        </div>
      </main>
    </div>
  </div>
</template>
