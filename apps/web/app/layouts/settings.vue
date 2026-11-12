<script setup lang="ts">
import { navigateTo, useI18n, useRoute } from "#imports";
import { Icon } from "@iconify/vue/offline";
import { Button } from "@peridot/ui/components/ui/button";
import {
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogOverlay,
  AlertDialogPortal,
  AlertDialogRoot,
  AlertDialogTitle,
} from "reka-ui";
import { ref, watch } from "vue";
import TaskProgressIndicator from "../components/TaskProgressIndicator.vue";
import { useServer } from "../composables/use-server";
import { useSession } from "../composables/use-session";
import { useUser } from "../composables/use-user";
import { icons } from "../lib/icons";
import { revokeSession } from "../lib/peridot-client";

const route = useRoute();
const { t } = useI18n();
const { address } = useServer();
const { token } = useSession();
const { user } = useUser();
const mobileNavigation = ref(false);
const logoutOpen = ref(false);
const loggingOut = ref(false);
const commonCategories = [
  { labelKey: "settings.profile", to: "/settings/account", icon: icons.user },
  {
    labelKey: "settings.library",
    to: "/settings/library",
    icon: icons.library,
  },
  {
    labelKey: "settings.playback",
    to: "/settings/playback",
    icon: icons.music,
  },
];
const adminCategories = [
  {
    labelKey: "settings.plugins",
    to: "/settings/plugins",
    icon: icons.plugins,
  },
  { labelKey: "settings.tasks", to: "/settings/tasks", icon: icons.restart },
  { labelKey: "settings.users", to: "/settings/users", icon: icons.user },
  { labelKey: "settings.sources", to: "/settings/sources", icon: icons.folder },
  {
    labelKey: "settings.metadata",
    to: "/settings/metadata",
    icon: icons.plugins,
  },
  { labelKey: "settings.server", to: "/settings/server", icon: icons.server },
];

function requestLogout() {
  if (!loggingOut.value) logoutOpen.value = true;
}

async function confirmLogout() {
  if (loggingOut.value) return;
  loggingOut.value = true;
  const currentAddress = address.value;
  const currentToken = token.value;
  token.value = null;
  user.value = null;
  try {
    if (currentAddress && currentToken) {
      await revokeSession(currentAddress, currentToken);
    }
  } catch {
    // Local credentials are cleared even if the server cannot be reached.
  } finally {
    loggingOut.value = false;
    await navigateTo(
      {
        path: "/onboarding",
        query: { auth: "login", redirect: route.fullPath },
      },
      { replace: true },
    );
  }
}

watch(
  () => route.path,
  () => {
    mobileNavigation.value = false;
  },
);
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
            </NuxtLink>
          </Button>
        </section>
      </nav>
      <div class="shrink-0 border-t border-sidebar-border p-3">
        <Button
          type="button"
          variant="ghost"
          class="w-full justify-start"
          :disabled="loggingOut"
          :aria-busy="loggingOut"
          @click="requestLogout"
        >
          <Icon :icon="icons.logout" aria-hidden="true" class="size-5" />
          {{ loggingOut ? t("navigation.loggingOut") : t("navigation.logOut") }}
        </Button>
      </div>
    </aside>

    <AlertDialogRoot v-model:open="logoutOpen">
      <AlertDialogPortal>
        <AlertDialogOverlay class="fixed inset-0 z-50 bg-background/80" />
        <AlertDialogContent
          class="fixed left-1/2 top-1/2 z-50 w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-lg border bg-card p-6 text-card-foreground shadow-lg"
        >
          <AlertDialogTitle class="text-lg font-semibold">
            {{ t("navigation.logOutTitle") }}
          </AlertDialogTitle>
          <AlertDialogDescription class="text-sm text-muted-foreground">
            {{ t("navigation.logOutDescription") }}
          </AlertDialogDescription>
          <div class="mt-6 flex justify-end gap-3">
            <AlertDialogCancel as-child>
              <Button type="button" variant="outline">{{
                t("common.cancel")
              }}</Button>
            </AlertDialogCancel>
            <AlertDialogAction as-child @click="confirmLogout">
              <Button type="button" variant="destructive">{{
                t("navigation.logOut")
              }}</Button>
            </AlertDialogAction>
          </div>
        </AlertDialogContent>
      </AlertDialogPortal>
    </AlertDialogRoot>

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
