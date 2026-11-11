<script setup lang="ts">
import { useRoute } from "#imports";
import { Icon } from "@iconify/vue/offline";
import { Button } from "@peridot/ui/components/ui/button";
import { computed, ref, watch } from "vue";
import TaskProgressIndicator from "../components/TaskProgressIndicator.vue";
import { useUser } from "../composables/use-user";
import { icons } from "../lib/icons";

const route = useRoute();
const { user } = useUser();
const mobileNavigation = ref(false);
const commonCategories = [
  { name: "Account", to: "/settings/account", icon: icons.user },
  { name: "Tasks", to: "/settings/tasks", icon: icons.restart },
  { name: "Library", to: "/settings/library", icon: icons.library },
  { name: "Playback", to: "/settings/playback", icon: icons.music },
  { name: "Plugins", to: "/settings/plugins", icon: icons.plugins },
];
const adminCategories = [
  { name: "Sources", to: "/settings/sources", icon: icons.folder },
  { name: "Metadata", to: "/settings/metadata", icon: icons.plugins },
  {
    name: "Administration",
    to: "/settings/administration",
    icon: icons.server,
  },
];
const categories = computed(() =>
  user.value?.role === "admin"
    ? [...commonCategories, ...adminCategories]
    : commonCategories,
);

watch(
  () => route.path,
  () => {
    mobileNavigation.value = false;
  },
);
</script>

<template>
  <div class="flex h-dvh overflow-hidden bg-background text-foreground">
    <a href="#settings-content" class="sr-only focus:not-sr-only focus:p-4"
      >Skip to content</a
    >
    <aside
      id="settings-sidebar"
      aria-label="Settings navigation"
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
          ><NuxtLink to="/" aria-label="Back to home"
            ><Icon
              :icon="icons.arrowLeft"
              aria-hidden="true"
              class="size-5"
            />Back</NuxtLink
          ></Button
        >
        <Button
          variant="ghost"
          size="icon-sm"
          class="md:hidden"
          aria-label="Close settings navigation"
          @click="mobileNavigation = false"
          ><Icon :icon="icons.close" aria-hidden="true"
        /></Button>
      </div>
      <nav aria-label="Settings categories" class="space-y-1 p-3">
        <Button
          v-for="item in categories"
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
              item.name
            }}
          </NuxtLink>
        </Button>
      </nav>
    </aside>

    <div class="flex min-w-0 flex-1 flex-col">
      <header
        class="flex min-h-16 shrink-0 items-center gap-3 border-b px-4 md:px-6"
      >
        <Button
          variant="outline"
          size="icon"
          class="md:hidden"
          aria-label="Toggle settings navigation"
          aria-controls="settings-sidebar"
          :aria-expanded="mobileNavigation"
          @click="mobileNavigation = !mobileNavigation"
          ><Icon :icon="icons.menu" aria-hidden="true"
        /></Button>
        <h1 class="text-lg font-semibold">Settings</h1>
        <div class="ml-auto flex items-center">
          <TaskProgressIndicator />
        </div>
      </header>
      <main
        id="settings-content"
        tabindex="-1"
        class="min-h-0 flex-1 overflow-y-auto p-4 md:p-6"
      >
        <div class="mx-auto max-w-4xl space-y-8"><slot /></div>
      </main>
    </div>
  </div>
</template>
