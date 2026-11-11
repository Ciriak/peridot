<script setup lang="ts">
import { computed, definePageMeta, onMounted, ref } from "#imports";
import { Icon } from "@iconify/vue/offline";
import type {
  CreateMetadataProviderRequest,
  MetadataProviderDefinitionResponse,
  MetadataProviderKind,
  MetadataProviderResponse,
  UpdateMetadataProviderRequest,
} from "@peridot/contracts";
import { Button } from "@peridot/ui/components/ui/button";
import { Input } from "@peridot/ui/components/ui/input";
import { Switch } from "@peridot/ui/components/ui/switch";
import { useSortable } from "@vueuse/integrations/useSortable";
import {
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogOverlay,
  AlertDialogPortal,
  AlertDialogRoot,
  AlertDialogTitle,
  DialogContent,
  DialogDescription,
  DialogOverlay,
  DialogPortal,
  DialogRoot,
  DialogTitle,
  TooltipContent,
  TooltipPortal,
  TooltipProvider,
  TooltipRoot,
  TooltipTrigger,
} from "reka-ui";
import { useLibraryTracks } from "../../composables/use-library-tracks";
import { useServer } from "../../composables/use-server";
import { useSession } from "../../composables/use-session";
import { useTasks } from "../../composables/use-tasks";
import { useUser } from "../../composables/use-user";
import { icons } from "../../lib/icons";
import { metadataProviderNeedsConfiguration } from "../../lib/metadata-provider-config";
import {
  createMetadataProvider,
  listMetadataProviderDefinitions,
  listMetadataProviders,
  reorderMetadataProviders,
  resetMetadata,
  updateMetadataProvider,
} from "../../lib/peridot-client";
import {
  notifyMetadataProviderMutation,
  notifyMetadataReset,
} from "../../lib/toasts";

definePageMeta({ layout: "settings" });

const { address } = useServer();
const { token } = useSession();
const { user } = useUser();
const allowed = computed(() => user.value?.role === "admin");
const { hasActiveTasks, queueMetadataRefresh } = useTasks();
const { reload: reloadTracks } = useLibraryTracks();

const providers = ref<MetadataProviderResponse[]>([]);
const definitions = ref<MetadataProviderDefinitionResponse[]>([]);
const providerRows = ref<
  Array<{
    definition: MetadataProviderDefinitionResponse;
    provider: MetadataProviderResponse | null;
  }>
>([]);
const providerList = ref<HTMLElement | null>(null);
const loading = ref(true);
const pageError = ref("");
const formOpen = ref(false);
const selectedKind = ref<MetadataProviderKind | null>(null);
const editingProvider = ref<MetadataProviderResponse | null>(null);
const formConfiguration = ref<Record<string, string>>({});
const formCredential = ref("");
const formEnabled = ref(false);
const saving = ref(false);
const formError = ref("");
const resetOpen = ref(false);
const resetting = ref(false);

const selectedDefinition = computed(
  () =>
    definitions.value.find(
      (definition) => definition.kind === selectedKind.value,
    ) ?? null,
);
const activeProviders = computed(() =>
  providers.value.filter((provider) => provider.enabled),
);
const formValid = computed(() => {
  const definition = selectedDefinition.value;
  if (!definition) return false;
  const configurationValid = definition.configurationFields.every(
    (field) =>
      !field.required || Boolean(formConfiguration.value[field.key]?.trim()),
  );
  const credentialValid =
    !definition.credentialField?.required ||
    Boolean(editingProvider.value?.hasCredential) ||
    Boolean(formCredential.value.trim());
  return configurationValid && credentialValid;
});

useSortable(providerList, providerRows, {
  animation: 150,
  draggable: ".sortable-item",
  filter: "a, button, input",
  preventOnFilter: false,
  watchElement: true,
  onEnd: () => void persistOrder(),
});

async function loadProviders() {
  if (!allowed.value) {
    loading.value = false;
    return;
  }
  loading.value = true;
  pageError.value = "";
  try {
    const [providerResult, definitionResult] = await Promise.all([
      listMetadataProviders(address.value ?? "", token.value ?? ""),
      listMetadataProviderDefinitions(address.value ?? "", token.value ?? ""),
    ]);
    providers.value = providerResult.items;
    definitions.value = definitionResult.items;
    syncProviderRows();
  } catch (reason) {
    pageError.value =
      reason instanceof Error
        ? reason.message
        : "Could not load metadata providers.";
  } finally {
    loading.value = false;
  }
}

function resetForm() {
  selectedKind.value = null;
  editingProvider.value = null;
  formConfiguration.value = {};
  formCredential.value = "";
  formEnabled.value = false;
  formError.value = "";
}

function syncProviderRows() {
  const definitionsByKind = new Map(
    definitions.value.map((definition) => [definition.kind, definition]),
  );
  const configuredKinds = new Set(
    providers.value.map((provider) => provider.kind),
  );
  providerRows.value = [
    ...providers.value.flatMap((provider) => {
      const definition = definitionsByKind.get(provider.kind);
      return definition ? [{ definition, provider }] : [];
    }),
    ...definitions.value
      .filter((definition) => !configuredKinds.has(definition.kind))
      .map((definition) => ({ definition, provider: null })),
  ];
}

function openProviderDialog(definition: MetadataProviderDefinitionResponse) {
  const provider =
    providers.value.find((item) => item.kind === definition.kind) ?? null;
  resetForm();
  editingProvider.value = provider;
  formEnabled.value = provider?.enabled ?? false;
  selectedKind.value = definition.kind;
  formConfiguration.value = Object.fromEntries(
    definition.configurationFields.map((field) => [
      field.key,
      provider?.configuration[field.key] ?? "",
    ]),
  );
  formOpen.value = true;
}

function closeFormDialog() {
  formOpen.value = false;
  resetForm();
}

function handleDialogBack() {
  closeFormDialog();
}

async function saveProvider() {
  const definition = selectedDefinition.value;
  if (!definition || !formValid.value) return;
  saving.value = true;
  formError.value = "";
  const configuration = Object.fromEntries(
    definition.configurationFields.map((field) => [
      field.key,
      formConfiguration.value[field.key]?.trim() ?? "",
    ]),
  );
  try {
    if (editingProvider.value) {
      const previousEnabled = editingProvider.value.enabled;
      const update: UpdateMetadataProviderRequest = {
        configuration,
        enabled: formEnabled.value,
      };
      if (formCredential.value.trim()) {
        update.credential = formCredential.value.trim();
      }
      const provider = await updateMetadataProvider(
        address.value ?? "",
        token.value ?? "",
        editingProvider.value.id,
        update,
      );
      providers.value = providers.value.map((item) =>
        item.id === provider.id ? provider : item,
      );
      syncProviderRows();
      notifyMetadataProviderMutation(
        provider.enabled && !previousEnabled
          ? "enabled"
          : !provider.enabled
            ? "disabled"
            : "updated",
        provider.name,
      );
    } else {
      const body: CreateMetadataProviderRequest = {
        kind: definition.kind,
        configuration,
        credential: definition.credentialField
          ? formCredential.value.trim()
          : null,
      };
      const provider = await createMetadataProvider(
        address.value ?? "",
        token.value ?? "",
        body,
      );
      providers.value = [...providers.value, provider];
      syncProviderRows();
      notifyMetadataProviderMutation("added", provider.name);
    }
    closeFormDialog();
  } catch (reason) {
    formError.value =
      reason instanceof Error
        ? reason.message
        : "Could not save the metadata provider.";
  } finally {
    saving.value = false;
  }
}

function providerStatusLabel(provider: MetadataProviderResponse | null) {
  if (!provider) return "Not configured";
  return provider.enabled ? "Active" : "Disabled";
}

function providerStatusClass(provider: MetadataProviderResponse | null) {
  if (!provider) return "text-warning";
  return provider.enabled ? "text-success" : "text-muted-foreground";
}

function providerIcon(kind: MetadataProviderKind) {
  return kind === "discogs" ? icons.discogs : icons.musicbrainz;
}

function providerNeedsConfiguration(provider: MetadataProviderResponse) {
  return metadataProviderNeedsConfiguration(provider, definitions.value);
}

async function persistOrder() {
  try {
    await reorderMetadataProviders(
      address.value ?? "",
      token.value ?? "",
      providerRows.value.flatMap((row) =>
        row.provider ? [row.provider.id] : [],
      ),
    );
  } catch (reason) {
    pageError.value =
      reason instanceof Error
        ? reason.message
        : "Could not save the metadata provider order.";
  }
}

async function refreshProviderMetadata() {
  pageError.value = "";
  try {
    await queueMetadataRefresh();
  } catch (reason) {
    pageError.value =
      reason instanceof Error ? reason.message : "Could not refresh metadata.";
  }
}

function requestReset() {
  pageError.value = "";
  resetOpen.value = true;
}

async function confirmReset() {
  if (resetting.value) return;
  resetting.value = true;
  pageError.value = "";
  try {
    const result = await resetMetadata(address.value ?? "", token.value ?? "");
    resetOpen.value = false;
    notifyMetadataReset(result.resetCount);
    await reloadTracks();
  } catch (reason) {
    pageError.value =
      reason instanceof Error
        ? reason.message
        : "Could not reset track metadata.";
  } finally {
    resetting.value = false;
  }
}

onMounted(() => void loadProviders());
</script>

<template>
  <div class="space-y-2">
    <h2 class="text-2xl font-semibold tracking-tight">Metadata</h2>
    <p class="text-sm text-muted-foreground">
      Match library tracks with metadata from services enabled below.
    </p>
  </div>

  <section
    v-if="!allowed"
    role="alert"
    class="rounded-lg border bg-card p-6 text-sm text-card-foreground"
  >
    Administrator access is required to manage metadata providers.
  </section>

  <section
    v-else
    aria-labelledby="metadata-providers-heading"
    class="space-y-4"
  >
    <div class="flex items-center justify-between gap-4">
      <h3 id="metadata-providers-heading" class="text-lg font-semibold">
        Metadata providers
      </h3>
      <div class="flex items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          :disabled="!activeProviders.length || hasActiveTasks"
          :aria-busy="hasActiveTasks"
          @click="refreshProviderMetadata"
        >
          <Icon :icon="icons.restart" aria-hidden="true" class="size-4" />
          {{ hasActiveTasks ? "Processing…" : "Refresh metadata" }}
        </Button>
      </div>
    </div>
    <p v-if="pageError" role="alert" class="text-sm text-destructive">
      {{ pageError }}
    </p>
    <div class="rounded-lg border bg-card p-6 text-card-foreground">
      <p v-if="loading" class="text-sm text-muted-foreground">Loading…</p>
      <TooltipProvider v-else-if="providerRows.length">
        <ul ref="providerList" class="space-y-2">
          <li
            v-for="row in providerRows"
            :key="row.definition.kind"
            :class="{
              'opacity-60': row.provider && !row.provider.enabled,
              'sortable-item cursor-grab active:cursor-grabbing': row.provider,
            }"
            class="flex items-center gap-2 rounded-md border p-2"
          >
            <button
              v-if="row.provider"
              type="button"
              class="rounded-md p-1 text-muted-foreground"
              aria-label="Drag to reorder metadata provider"
            >
              <Icon :icon="icons.drag" aria-hidden="true" class="size-4" />
            </button>
            <span v-else class="size-6 shrink-0" aria-hidden="true" />
            <Icon
              :icon="providerIcon(row.definition.kind)"
              aria-hidden="true"
              class="size-5 shrink-0"
            />
            <span class="min-w-0 flex-1">
              <span
                class="block truncate text-sm font-medium"
                :class="{ 'opacity-60': !row.provider }"
              >
                {{ row.definition.name }}
              </span>
              <span
                class="block truncate text-sm"
                :class="providerStatusClass(row.provider)"
              >
                {{ providerStatusLabel(row.provider) }}
              </span>
            </span>
            <div class="flex flex-col items-center gap-1">
              <TooltipRoot
                v-if="row.provider && providerNeedsConfiguration(row.provider)"
              >
                <TooltipTrigger as-child>
                  <span
                    tabindex="0"
                    class="rounded-full bg-card p-0.5 text-destructive"
                    aria-label="Configuration required"
                  >
                    <Icon
                      :icon="icons.warning"
                      aria-hidden="true"
                      class="size-4"
                    />
                  </span>
                </TooltipTrigger>
                <TooltipPortal>
                  <TooltipContent
                    side="left"
                    :side-offset="6"
                    class="z-50 max-w-56 rounded-md border bg-popover px-3 py-1.5 text-xs text-popover-foreground shadow-md"
                  >
                    Configure the required settings for
                    {{ row.definition.name }}
                    before using this provider.
                  </TooltipContent>
                </TooltipPortal>
              </TooltipRoot>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                :aria-label="`Configure ${row.definition.name}`"
                @click="openProviderDialog(row.definition)"
              >
                <Icon
                  :icon="icons.settings"
                  aria-hidden="true"
                  class="size-4"
                />
              </Button>
            </div>
          </li>
        </ul>
      </TooltipProvider>
      <p v-else class="text-sm text-muted-foreground">
        No metadata providers are available.
      </p>
    </div>
  </section>

  <section
    v-if="allowed"
    aria-labelledby="track-metadata-reset-heading"
    class="space-y-4"
  >
    <h3 id="track-metadata-reset-heading" class="text-lg font-semibold">
      Track metadata
    </h3>
    <div
      class="flex flex-col gap-4 rounded-lg border bg-card p-6 text-card-foreground sm:flex-row sm:items-center sm:justify-between"
    >
      <div class="space-y-1">
        <p class="text-sm font-medium">Reset all track metadata</p>
        <p class="text-sm text-muted-foreground">
          Remove automatic and manual matches from every track and use the
          original file tags again. Providers and audio files are not changed.
        </p>
      </div>
      <Button
        type="button"
        variant="outline"
        class="shrink-0"
        :disabled="hasActiveTasks"
        @click="requestReset"
      >
        <Icon :icon="icons.trash" aria-hidden="true" class="size-4" />
        Reset metadata
      </Button>
    </div>
  </section>

  <DialogRoot v-model:open="formOpen">
    <DialogPortal>
      <DialogOverlay class="fixed inset-0 z-50 bg-background/80" />
      <DialogContent
        class="fixed left-1/2 top-1/2 z-50 w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-lg border bg-card p-6 text-card-foreground shadow-lg"
      >
        <DialogTitle class="text-lg font-semibold">
          {{
            editingProvider
              ? `Configure ${editingProvider.name}`
              : `Set up ${selectedDefinition?.name ?? "metadata provider"}`
          }}
        </DialogTitle>
        <DialogDescription class="text-sm text-muted-foreground">
          {{
            editingProvider
              ? "Manage this provider and its connection details."
              : "Add the required details to start using this provider."
          }}
        </DialogDescription>

        <div v-if="selectedDefinition" class="mt-4 space-y-4">
          <p class="text-sm text-muted-foreground">
            {{ selectedDefinition.description }}
          </p>
          <div
            v-if="editingProvider"
            class="flex items-center justify-between gap-4 rounded-md border p-3"
          >
            <div class="space-y-1">
              <p class="text-sm font-medium">Provider enabled</p>
              <p class="text-sm text-muted-foreground">
                Use this provider for automatic matching and manual search.
              </p>
            </div>
            <Switch
              v-model="formEnabled"
              :aria-label="`${formEnabled ? 'Disable' : 'Enable'} ${selectedDefinition.name}`"
            />
          </div>
          <div
            v-for="field in selectedDefinition.configurationFields"
            :key="field.key"
            class="space-y-2"
          >
            <label :for="`provider-${field.key}`" class="text-sm font-medium">
              {{ field.label }}
            </label>
            <Input
              :id="`provider-${field.key}`"
              v-model="formConfiguration[field.key]"
              :type="field.type"
              :placeholder="field.placeholder ?? undefined"
            />
            <p v-if="field.helpText" class="text-sm text-muted-foreground">
              {{ field.helpText }}
            </p>
          </div>
          <div v-if="selectedDefinition.credentialField" class="space-y-2">
            <label
              :for="`provider-${selectedDefinition.credentialField.key}`"
              class="text-sm font-medium"
            >
              {{ selectedDefinition.credentialField.label }}
            </label>
            <Input
              :id="`provider-${selectedDefinition.credentialField.key}`"
              v-model="formCredential"
              type="password"
              autocomplete="new-password"
              :placeholder="
                editingProvider
                  ? 'Leave blank to keep the current token'
                  : (selectedDefinition.credentialField.placeholder ??
                    undefined)
              "
            />
            <p class="text-sm text-muted-foreground">
              <template v-if="selectedDefinition.kind === 'discogs'">
                Create a personal access token in your
                <a
                  href="https://www.discogs.com/settings/developers"
                  target="_blank"
                  rel="noopener noreferrer"
                  class="inline-flex items-center gap-1 underline underline-offset-4 hover:text-foreground"
                >
                  Discogs account settings
                  <Icon
                    :icon="icons.externalLink"
                    aria-hidden="true"
                    class="size-3"
                  /> </a
                >.
              </template>
              <template v-else>
                {{ selectedDefinition.credentialField.helpText }}
              </template>
            </p>
          </div>
          <p v-if="formError" role="alert" class="text-sm text-destructive">
            {{ formError }}
          </p>
        </div>
        <div class="mt-6 flex justify-end gap-3">
          <Button type="button" variant="outline" @click="handleDialogBack">
            Cancel
          </Button>
          <Button
            v-if="selectedDefinition"
            type="button"
            :disabled="saving || !formValid"
            @click="saveProvider"
          >
            {{
              saving
                ? "Saving…"
                : editingProvider
                  ? "Save changes"
                  : "Enable provider"
            }}
          </Button>
        </div>
      </DialogContent>
    </DialogPortal>
  </DialogRoot>

  <AlertDialogRoot v-model:open="resetOpen">
    <AlertDialogPortal>
      <AlertDialogOverlay class="fixed inset-0 z-50 bg-background/80" />
      <AlertDialogContent
        class="fixed left-1/2 top-1/2 z-50 w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-lg border bg-card p-6 text-card-foreground shadow-lg"
      >
        <AlertDialogTitle class="text-lg font-semibold">
          Reset all track metadata?
        </AlertDialogTitle>
        <AlertDialogDescription class="text-sm text-muted-foreground">
          Automatic and manual matches will be discarded for every track.
          Peridot will display the original tags stored in your audio files.
          Your configured metadata providers and audio files will not be
          changed.
        </AlertDialogDescription>
        <div class="mt-6 flex justify-end gap-3">
          <AlertDialogCancel as-child>
            <Button type="button" variant="outline">Cancel</Button>
          </AlertDialogCancel>
          <AlertDialogAction as-child @click="confirmReset">
            <Button type="button" variant="destructive" :disabled="resetting">
              <Icon :icon="icons.trash" aria-hidden="true" class="size-4" />
              {{ resetting ? "Resetting…" : "Reset metadata" }}
            </Button>
          </AlertDialogAction>
        </div>
      </AlertDialogContent>
    </AlertDialogPortal>
  </AlertDialogRoot>
</template>
