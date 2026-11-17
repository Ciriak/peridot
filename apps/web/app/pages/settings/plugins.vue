<script setup lang="ts">
import { computed, definePageMeta, ref, useI18n, watch } from "#imports";
import { Icon } from "@iconify/vue/offline";
import type { PluginResponse } from "@peridot/contracts";
import { Badge } from "@peridot/ui/components/ui/badge";
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
import {
  useAdminSourcesQuery,
  usePluginsQuery,
} from "../../composables/use-admin-queries";
import { useCatalogRevision } from "../../composables/use-catalog-query";
import { useLocalizedMessage } from "../../composables/use-localized-message";
import { useServer } from "../../composables/use-server";
import { useSession } from "../../composables/use-session";
import { useUser } from "../../composables/use-user";
import { icons } from "../../lib/icons";
import {
  installPlugin,
  isAuthenticationRedirectError,
  uninstallPlugin,
} from "../../lib/peridot-client";

definePageMeta({ layout: "settings" });

const { t } = useI18n();
const { errorMessage, translate } = useLocalizedMessage();
const { address } = useServer();
const { token } = useSession();
const { user } = useUser();
const pluginsQuery = usePluginsQuery();
const sourcesQuery = useAdminSourcesQuery();
const { invalidate: invalidateCatalog, resetOfflineCatalog } =
  useCatalogRevision();
const allowed = computed(() => user.value?.role === "admin");
const pageError = ref("");
const installingId = ref<string | null>(null);
const uninstalling = ref(false);
const removeOpen = ref(false);
const pendingUninstall = ref<PluginResponse | null>(null);

watch(pluginsQuery.error, (value) => {
  if (value) pageError.value = value;
});

function contributionLabel(plugin: PluginResponse): string {
  return plugin.contributions
    .map((contribution) =>
      t(`settings.plugins.contribution.${contribution.kind}`),
    )
    .join(", ");
}

async function install(plugin: PluginResponse) {
  if (!address.value || !token.value || installingId.value) return;
  installingId.value = plugin.id;
  pageError.value = "";
  try {
    await installPlugin(address.value, token.value, plugin.id);
    await Promise.all([pluginsQuery.refresh(), sourcesQuery.load(true)]);
  } catch (reason) {
    if (isAuthenticationRedirectError(reason)) return;
    pageError.value = errorMessage(reason, "settings.plugins.installError");
  } finally {
    installingId.value = null;
  }
}

function askUninstall(plugin: PluginResponse) {
  pendingUninstall.value = plugin;
  removeOpen.value = true;
}

function closeUninstall() {
  pendingUninstall.value = null;
  removeOpen.value = false;
}

async function confirmUninstall() {
  if (
    !pendingUninstall.value ||
    !address.value ||
    !token.value ||
    uninstalling.value
  ) {
    return;
  }
  const plugin = pendingUninstall.value;
  uninstalling.value = true;
  pageError.value = "";
  try {
    await uninstallPlugin(address.value, token.value, plugin.id);
    closeUninstall();
    await Promise.all([pluginsQuery.refresh(), sourcesQuery.load(true)]);
    await resetOfflineCatalog();
    invalidateCatalog();
  } catch (reason) {
    if (isAuthenticationRedirectError(reason)) return;
    pageError.value = errorMessage(reason, "settings.plugins.uninstallError");
  } finally {
    uninstalling.value = false;
  }
}
</script>

<template>
  <div class="space-y-2">
    <h2 class="text-2xl font-semibold tracking-tight">
      {{ t("settings.plugins") }}
    </h2>
    <p class="text-sm text-muted-foreground">
      {{ t("settings.plugins.description") }}
    </p>
  </div>

  <section
    v-if="!allowed"
    role="alert"
    class="rounded-lg border bg-card p-6 text-sm text-card-foreground"
  >
    {{ t("settings.plugins.adminRequired") }}
  </section>

  <section v-else :aria-label="t('settings.plugins')" class="space-y-4">
    <h3 class="text-lg font-semibold">{{ t("settings.plugins.available") }}</h3>
    <p v-if="pageError" role="alert" class="text-sm text-destructive">
      {{ pageError }}
    </p>
    <p v-if="pluginsQuery.loading.value" class="text-sm text-muted-foreground">
      {{ t("settings.plugins.loading") }}
    </p>
    <div v-else class="grid gap-3">
      <article
        v-for="plugin in pluginsQuery.items.value"
        :key="plugin.id"
        class="rounded-lg border bg-card p-5 text-card-foreground"
      >
        <div class="flex items-start gap-3">
          <Icon
            :icon="plugin.icon === 'jellyfin' ? icons.jellyfin : icons.plugins"
            aria-hidden="true"
            class="mt-0.5 size-6 shrink-0 text-muted-foreground"
          />
          <div class="min-w-0 flex-1 space-y-2">
            <div class="flex flex-wrap items-center gap-2">
              <h4 class="font-semibold">{{ plugin.name }}</h4>
              <Badge :variant="plugin.installed ? 'default' : 'secondary'">
                {{
                  plugin.installed
                    ? t("settings.plugins.installed")
                    : t("settings.plugins.notInstalled")
                }}
              </Badge>
              <span class="text-xs text-muted-foreground">
                {{ t("settings.plugins.version", { version: plugin.version }) }}
              </span>
            </div>
            <p class="text-sm text-muted-foreground">
              {{ translate(plugin.descriptionMessage) }}
            </p>
            <p class="text-xs text-muted-foreground">
              {{ contributionLabel(plugin) }}
            </p>
          </div>
          <Button
            v-if="!plugin.installed"
            type="button"
            size="sm"
            :disabled="installingId !== null"
            @click="install(plugin)"
          >
            {{
              installingId === plugin.id
                ? t("settings.plugins.installing")
                : t("settings.plugins.install")
            }}
          </Button>
          <Button
            v-else
            type="button"
            variant="outline"
            size="sm"
            @click="askUninstall(plugin)"
          >
            {{ t("settings.plugins.uninstall") }}
          </Button>
        </div>
      </article>
    </div>
  </section>

  <AlertDialogRoot v-model:open="removeOpen">
    <AlertDialogPortal>
      <AlertDialogOverlay class="fixed inset-0 z-50 bg-background/80" />
      <AlertDialogContent
        class="fixed left-1/2 top-1/2 z-50 w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-lg border bg-card p-6 text-card-foreground shadow-lg"
      >
        <AlertDialogTitle class="text-lg font-semibold">
          {{ t("settings.plugins.uninstallTitle") }}
        </AlertDialogTitle>
        <AlertDialogDescription class="space-y-3 text-sm text-muted-foreground">
          <span class="block font-medium text-foreground">
            {{ pendingUninstall?.name }}
          </span>
          <span class="block">{{
            t("settings.plugins.uninstallWarning")
          }}</span>
          <span class="block">{{ t("settings.plugins.uninstallRemote") }}</span>
        </AlertDialogDescription>
        <div class="mt-6 flex justify-end gap-3">
          <AlertDialogCancel as-child>
            <Button type="button" variant="outline" @click="closeUninstall">
              {{ t("common.cancel") }}
            </Button>
          </AlertDialogCancel>
          <AlertDialogAction as-child>
            <Button
              type="button"
              variant="destructive"
              :disabled="uninstalling"
              @click="confirmUninstall"
            >
              {{
                uninstalling
                  ? t("settings.plugins.uninstalling")
                  : t("settings.plugins.uninstall")
              }}
            </Button>
          </AlertDialogAction>
        </div>
      </AlertDialogContent>
    </AlertDialogPortal>
  </AlertDialogRoot>
</template>
