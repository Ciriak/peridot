<script setup lang="ts">
import { useHead, useI18n, useRoute, useRouter } from "#imports";
import favicon from "@peridot/ui/assets/brand/favicon.png";
import { useLibraryPlayer } from "./composables/use-library-player";
import { useDesktopMediaKeys } from "./composables/use-desktop-media-keys";
import { useWebMediaSession } from "./composables/use-web-media-session";
import { useSession } from "./composables/use-session";
import { isSearchShortcut } from "./lib/search-shortcut";
import AppNotifications from "./components/AppNotifications.vue";
import AppToaster from "./components/AppToaster.vue";
import { nextTick, onBeforeUnmount, onMounted } from "vue";

const { t } = useI18n();
const route = useRoute();
const router = useRouter();
const { token } = useSession();
useHead({
  title: `${t("app.name")} — ${t("app.tagline")}`,
  meta: [{ name: "description", content: t("app.description") }],
  link: [{ rel: "icon", type: "image/png", href: favicon }],
});

const player = useLibraryPlayer({ audio: true });
useDesktopMediaKeys(player);
useWebMediaSession(player);

async function openSearch() {
  if (!token.value) return;
  if (route.path !== "/search") await router.push("/search");
  await nextTick();
  document.querySelector<HTMLInputElement>("#global-search")?.focus();
}

function handleSearchShortcut(event: KeyboardEvent) {
  if (!isSearchShortcut(event)) return;
  event.preventDefault();
  void openSearch();
}

onMounted(() => window.addEventListener("keydown", handleSearchShortcut));
onBeforeUnmount(() =>
  window.removeEventListener("keydown", handleSearchShortcut),
);
</script>

<template>
  <NuxtLayout>
    <NuxtPage />
  </NuxtLayout>
  <AppToaster />
  <AppNotifications />
</template>
