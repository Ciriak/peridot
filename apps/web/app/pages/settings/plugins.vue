<script setup lang="ts">
import { computed, definePageMeta, ref, useI18n, watch } from "#imports";
import { Icon } from "@iconify/vue/offline";
import type { PluginResponse } from "@peridot/contracts";
import { Badge } from "@peridot/ui/components/ui/badge";
import { Button } from "@peridot/ui/components/ui/button";
import { Switch } from "@peridot/ui/components/ui/switch";
import {
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogOverlay,
  AlertDialogPortal,
  AlertDialogRoot,
  AlertDialogTitle,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuPortal,
  DropdownMenuRoot,
  DropdownMenuTrigger,
  TooltipContent,
  TooltipPortal,
  TooltipProvider,
  TooltipRoot,
  TooltipTrigger,
} from "reka-ui";
import {
  useAdminSourcesQuery,
  usePluginsQuery,
} from "../../composables/use-admin-queries";
import PluginSettingsForm from "../../components/PluginSettingsForm.vue";
import PluginTaskActions from "../../components/PluginTaskActions.vue";
import { useCatalogRevision } from "../../composables/use-catalog-query";
import { useLocalizedMessage } from "../../composables/use-localized-message";
import { usePluginProviders } from "../../composables/use-plugin-providers";
import { useServer } from "../../composables/use-server";
import { useSession } from "../../composables/use-session";
import { useUser } from "../../composables/use-user";
import { icons } from "../../lib/icons";
import {
  installPlugin,
  isAuthenticationRedirectError,
  uninstallPlugin,
  updatePluginEnabled,
} from "../../lib/peridot-client";

definePageMeta({ layout: "settings" });

const { t } = useI18n();
const { errorMessage, translate } = useLocalizedMessage();
const { address } = useServer();
const { token } = useSession();
const { user } = useUser();
const pluginsQuery = usePluginsQuery();
const providerQuery = usePluginProviders();
const sourcesQuery = useAdminSourcesQuery();
const { invalidate: invalidateCatalog, resetOfflineCatalog } =
  useCatalogRevision();
const allowed = computed(() => user.value?.role === "admin");
const pageError = ref("");
const installingId = ref<string | null>(null);
const updatingEnabledId = ref<string | null>(null);
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
    await Promise.all([
      pluginsQuery.refresh(),
      sourcesQuery.load(true),
      providerQuery.refresh(),
    ]);
  } catch (reason) {
    if (isAuthenticationRedirectError(reason)) return;
    pageError.value = errorMessage(reason, "settings.plugins.installError");
  } finally {
    installingId.value = null;
  }
}

async function setEnabled(plugin: PluginResponse, enabled: boolean) {
  if (
    !address.value ||
    !token.value ||
    updatingEnabledId.value ||
    plugin.enabled === enabled
  ) {
    return;
  }
  updatingEnabledId.value = plugin.id;
  pageError.value = "";
  try {
    await updatePluginEnabled(address.value, token.value, plugin.id, {
      enabled,
    });
    await Promise.all([
      pluginsQuery.refresh(),
      sourcesQuery.load(true),
      providerQuery.refresh(),
    ]);
  } catch (reason) {
    if (isAuthenticationRedirectError(reason)) return;
    pageError.value = errorMessage(
      reason,
      "settings.plugins.enabledUpdateError",
    );
  } finally {
    updatingEnabledId.value = null;
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
    await Promise.all([
      pluginsQuery.refresh(),
      sourcesQuery.load(true),
      providerQuery.refresh(),
    ]);
    await resetOfflineCatalog();
    invalidateCatalog();
  } catch (reason) {
    if (isAuthenticationRedirectError(reason)) return;
    pageError.value = errorMessage(reason, "settings.plugins.uninstallError");
  } finally {
    uninstalling.value = false;
  }
}

function pluginSettingsSaved() {
  void Promise.all([pluginsQuery.refresh(), providerQuery.refresh()]);
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
        <div class="flex flex-col gap-4 sm:flex-row sm:items-start">
          <Icon
            :icon="plugin.icon === 'jellyfin' ? icons.jellyfin : icons.plugins"
            aria-hidden="true"
            class="mt-0.5 size-6 shrink-0 text-muted-foreground"
          />
          <div class="min-w-0 flex-1 space-y-2">
            <div class="flex flex-wrap items-center gap-2">
              <h4 class="font-semibold">{{ plugin.name }}</h4>
              <Badge v-if="!plugin.installed" :variant="'secondary'">
                {{ t("settings.plugins.notInstalled") }}
              </Badge>
              <Badge v-else-if="plugin.restartRequired" :variant="'secondary'">
                {{ t("settings.plugins.restartRequired") }}
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
            <p
              v-if="plugin.restartRequired"
              class="text-xs font-medium text-warning"
            >
              {{ t("settings.plugins.restartRequiredHelp") }}
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
          <div v-else class="flex shrink-0 items-center gap-2 self-start">
            <span
              class="text-sm font-medium"
              :class="plugin.enabled ? 'text-foreground' : 'text-destructive'"
            >
              {{
                plugin.enabled
                  ? t("settings.plugins.enabled")
                  : t("settings.plugins.disabled")
              }}
            </span>
            <Switch
              :model-value="plugin.enabled"
              :disabled="updatingEnabledId !== null || uninstalling"
              :aria-label="
                t('settings.plugins.toggle', { plugin: plugin.name })
              "
              @update:model-value="setEnabled(plugin, $event)"
            />
            <TooltipProvider :delay-duration="150">
              <TooltipRoot>
                <DropdownMenuRoot>
                  <TooltipTrigger as-child>
                    <DropdownMenuTrigger as-child>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        :aria-label="
                          t('settings.plugins.actions', {
                            plugin: plugin.name,
                          })
                        "
                      >
                        <Icon
                          :icon="icons.more"
                          aria-hidden="true"
                          class="size-4"
                        />
                      </Button>
                    </DropdownMenuTrigger>
                  </TooltipTrigger>
                  <TooltipPortal>
                    <TooltipContent
                      side="bottom"
                      align="end"
                      :side-offset="6"
                      class="z-50 rounded-md border bg-popover px-2 py-1 text-xs text-popover-foreground shadow-md"
                    >
                      {{ t("settings.plugins.actionsLabel") }}
                    </TooltipContent>
                  </TooltipPortal>
                  <DropdownMenuPortal>
                    <DropdownMenuContent
                      class="z-50 w-44 rounded-lg border bg-popover p-1 text-popover-foreground shadow-lg"
                    >
                      <DropdownMenuItem
                        :disabled="uninstalling"
                        class="flex cursor-pointer items-center gap-2 rounded-sm px-2 py-2 text-sm text-destructive outline-none data-disabled:cursor-default data-disabled:opacity-50"
                        @select="askUninstall(plugin)"
                      >
                        <Icon
                          :icon="icons.trash"
                          aria-hidden="true"
                          class="size-4"
                        />
                        {{ t("settings.plugins.uninstall") }}
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenuPortal>
                </DropdownMenuRoot>
              </TooltipRoot>
            </TooltipProvider>
          </div>
        </div>
        <PluginSettingsForm
          v-if="plugin.installed"
          :plugin="plugin"
          @saved="pluginSettingsSaved"
        />
        <PluginTaskActions
          v-if="plugin.installed && plugin.enabled && !plugin.restartRequired"
          :plugin="plugin"
        />
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
