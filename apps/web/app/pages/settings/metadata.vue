<script setup lang="ts">
import { computed, definePageMeta, onMounted, ref } from "#imports";
import { Icon } from "@iconify/vue/offline";
import type {
  CreateMetadataProviderRequest,
  MetadataProviderResponse,
} from "@peridot/contracts";
import { Badge } from "@peridot/ui/components/ui/badge";
import { Button } from "@peridot/ui/components/ui/button";
import { Input } from "@peridot/ui/components/ui/input";
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
} from "reka-ui";
import { useServer } from "../../composables/use-server";
import { useSession } from "../../composables/use-session";
import { useUser } from "../../composables/use-user";
import { useLibraryTracks } from "../../composables/use-library-tracks";
import { icons } from "../../lib/icons";
import {
  createMetadataProvider,
  listMetadataProviders,
  reorderMetadataProviders,
  resetMetadata,
  setMetadataProviderEnabled,
} from "../../lib/peridot-client";
import {
  notifyMetadataProviderMutation,
  notifyMetadataReset,
} from "../../lib/toasts";
import { useLibraryScan } from "../../composables/use-library-scan";

definePageMeta({ layout: "settings" });

const { address } = useServer();
const { token } = useSession();
const { user } = useUser();
const allowed = computed(() => user.value?.role === "admin");
const { scanning, startMetadataRefresh } = useLibraryScan();
const { reload: reloadTracks } = useLibraryTracks();

const providers = ref<MetadataProviderResponse[]>([]);
const providerList = ref<HTMLElement | null>(null);
const loading = ref(true);
const pageError = ref("");
const addOpen = ref(false);
const newKind = ref<"musicbrainz" | null>(null);
const newContact = ref("");
const adding = ref(false);
const addError = ref("");
const disableOpen = ref(false);
const pendingDisable = ref<MetadataProviderResponse | null>(null);
const togglingProviderId = ref<string | null>(null);
const resetOpen = ref(false);
const resetting = ref(false);
const musicBrainzAdded = computed(() =>
  providers.value.some((provider) => provider.kind === "musicbrainz"),
);
const activeProviders = computed(() =>
  providers.value.filter((provider) => provider.enabled),
);

useSortable(providerList, providers, {
  animation: 150,
  handle: ".drag-handle",
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
    const result = await listMetadataProviders(
      address.value ?? "",
      token.value ?? "",
    );
    providers.value = result.items;
  } catch (reason) {
    pageError.value =
      reason instanceof Error
        ? reason.message
        : "Could not load metadata providers.";
  } finally {
    loading.value = false;
  }
}

function openAddDialog() {
  addError.value = "";
  newKind.value = null;
  newContact.value = "";
  addOpen.value = true;
}

function closeAddDialog() {
  addOpen.value = false;
  newKind.value = null;
  newContact.value = "";
}

function chooseKind(kind: "musicbrainz") {
  if (musicBrainzAdded.value) return;
  addError.value = "";
  newKind.value = kind;
}

function handleDialogBack() {
  if (newKind.value) {
    newKind.value = null;
    newContact.value = "";
    addError.value = "";
    return;
  }
  closeAddDialog();
}

async function addProvider() {
  if (!newKind.value) return;
  adding.value = true;
  addError.value = "";
  const body: CreateMetadataProviderRequest = {
    kind: newKind.value,
    contact: newContact.value,
  };
  try {
    const provider = await createMetadataProvider(
      address.value ?? "",
      token.value ?? "",
      body,
    );
    closeAddDialog();
    notifyMetadataProviderMutation("added", provider.name);
    await loadProviders();
  } catch (reason) {
    addError.value =
      reason instanceof Error
        ? reason.message
        : "Could not add the metadata provider.";
  } finally {
    adding.value = false;
  }
}

function requestProviderToggle(provider: MetadataProviderResponse) {
  if (provider.enabled) {
    pendingDisable.value = provider;
    disableOpen.value = true;
    return;
  }
  void setProviderEnabled(provider, true);
}

async function setProviderEnabled(
  provider: MetadataProviderResponse,
  enabled: boolean,
) {
  if (togglingProviderId.value) return;
  togglingProviderId.value = provider.id;
  pageError.value = "";
  try {
    const updated = await setMetadataProviderEnabled(
      address.value ?? "",
      token.value ?? "",
      provider.id,
      enabled,
    );
    providers.value = providers.value.map((item) =>
      item.id === updated.id ? updated : item,
    );
    notifyMetadataProviderMutation(
      enabled ? "enabled" : "disabled",
      updated.name,
    );
    pendingDisable.value = null;
    disableOpen.value = false;
  } catch (reason) {
    pageError.value =
      reason instanceof Error
        ? reason.message
        : `Could not ${enabled ? "enable" : "disable"} the metadata provider.`;
  } finally {
    togglingProviderId.value = null;
  }
}

async function confirmDisable() {
  if (!pendingDisable.value) return;
  await setProviderEnabled(pendingDisable.value, false);
}

async function persistOrder() {
  try {
    await reorderMetadataProviders(
      address.value ?? "",
      token.value ?? "",
      providers.value.map((provider) => provider.id),
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
    await startMetadataRefresh();
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
          :disabled="scanning || !activeProviders.length"
          @click="refreshProviderMetadata"
        >
          <Icon :icon="icons.restart" aria-hidden="true" class="size-4" />
          {{ scanning ? "Refreshing…" : "Refresh metadata" }}
        </Button>
        <Button
          type="button"
          size="sm"
          :disabled="musicBrainzAdded"
          @click="openAddDialog"
        >
          Add provider
        </Button>
      </div>
    </div>
    <p v-if="pageError" role="alert" class="text-sm text-destructive">
      {{ pageError }}
    </p>
    <div class="rounded-lg border bg-card p-6 text-card-foreground">
      <p v-if="loading" class="text-sm text-muted-foreground">Loading…</p>
      <ul v-else-if="providers.length" ref="providerList" class="space-y-2">
        <li
          v-for="provider in providers"
          :key="provider.id"
          :class="{ 'opacity-60': !provider.enabled }"
          class="flex items-center gap-2 rounded-md border p-2"
        >
          <button
            type="button"
            class="drag-handle cursor-grab rounded-md p-1 text-muted-foreground"
            aria-label="Drag to reorder metadata provider"
          >
            <Icon :icon="icons.drag" aria-hidden="true" class="size-4" />
          </button>
          <Badge variant="secondary" class="shrink-0">
            {{ provider.kind }}
          </Badge>
          <Badge v-if="!provider.enabled" variant="outline" class="shrink-0">
            Disabled
          </Badge>
          <span class="min-w-0 flex-1">
            <span class="block truncate text-sm font-medium">
              {{ provider.name }}
            </span>
            <span class="block truncate text-sm text-muted-foreground">
              {{ provider.contact }}
            </span>
          </span>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            :disabled="togglingProviderId === provider.id"
            @click="requestProviderToggle(provider)"
          >
            {{ provider.enabled ? "Disable" : "Enable" }}
          </Button>
        </li>
      </ul>
      <p v-else class="text-sm text-muted-foreground">
        No metadata providers configured. Add MusicBrainz to enrich new and
        changed tracks after a library scan.
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
        :disabled="scanning"
        @click="requestReset"
      >
        <Icon :icon="icons.trash" aria-hidden="true" class="size-4" />
        Reset metadata
      </Button>
    </div>
  </section>

  <DialogRoot v-model:open="addOpen">
    <DialogPortal>
      <DialogOverlay class="fixed inset-0 z-50 bg-background/80" />
      <DialogContent
        class="fixed left-1/2 top-1/2 z-50 w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-lg border bg-card p-6 text-card-foreground shadow-lg"
      >
        <DialogTitle class="text-lg font-semibold">
          Add metadata provider
        </DialogTitle>
        <DialogDescription class="text-sm text-muted-foreground">
          Choose a service to provide track metadata.
        </DialogDescription>

        <div v-if="!newKind" class="mt-4 grid gap-2">
          <button
            type="button"
            data-provider-option="musicbrainz"
            :disabled="musicBrainzAdded"
            class="w-full rounded-lg border bg-card p-4 text-left transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:bg-muted disabled:text-muted-foreground disabled:opacity-60"
            @click="chooseKind('musicbrainz')"
          >
            <span class="block text-sm font-medium">MusicBrainz</span>
            <span class="mt-1 block text-sm text-muted-foreground">
              {{
                musicBrainzAdded
                  ? "Configured. Enable or disable it from the provider list."
                  : "Match releases and recordings using your contact details."
              }}
            </span>
          </button>
          <button
            type="button"
            data-provider-option="spotify"
            disabled
            class="w-full cursor-not-allowed rounded-lg border bg-muted p-4 text-left text-muted-foreground opacity-60"
          >
            <span class="block text-sm font-medium">Spotify</span>
            <span class="mt-1 block text-sm">Coming soon</span>
          </button>
        </div>

        <div v-else class="mt-4 space-y-4">
          <div class="space-y-2">
            <label for="provider-contact" class="text-sm font-medium">
              Contact email or URL
            </label>
            <Input
              id="provider-contact"
              v-model="newContact"
              type="text"
              placeholder="you@example.com"
            />
            <p class="text-sm text-muted-foreground">
              MusicBrainz requires this contact in Peridot's request User-Agent.
              No API key is required.
            </p>
          </div>
          <p v-if="addError" role="alert" class="text-sm text-destructive">
            {{ addError }}
          </p>
        </div>
        <div class="mt-6 flex justify-end gap-3">
          <Button type="button" variant="outline" @click="handleDialogBack">
            {{ newKind ? "Back" : "Cancel" }}
          </Button>
          <Button
            v-if="newKind"
            type="button"
            :disabled="adding || !newContact.trim()"
            @click="addProvider"
          >
            {{ adding ? "Adding…" : "Add provider" }}
          </Button>
        </div>
      </DialogContent>
    </DialogPortal>
  </DialogRoot>

  <AlertDialogRoot v-model:open="disableOpen">
    <AlertDialogPortal>
      <AlertDialogOverlay class="fixed inset-0 z-50 bg-background/80" />
      <AlertDialogContent
        class="fixed left-1/2 top-1/2 z-50 w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-lg border bg-card p-6 text-card-foreground shadow-lg"
      >
        <AlertDialogTitle class="text-lg font-semibold">
          Disable metadata provider?
        </AlertDialogTitle>
        <AlertDialogDescription class="text-sm text-muted-foreground">
          {{ pendingDisable?.name }} will no longer be used for metadata
          matching. Existing track matches remain available, and you can enable
          it again.
        </AlertDialogDescription>
        <div class="mt-6 flex justify-end gap-3">
          <AlertDialogCancel as-child>
            <Button type="button" variant="outline">Cancel</Button>
          </AlertDialogCancel>
          <AlertDialogAction as-child @click="confirmDisable">
            <Button
              type="button"
              :disabled="togglingProviderId === pendingDisable?.id"
            >
              {{
                togglingProviderId === pendingDisable?.id
                  ? "Disabling…"
                  : "Disable"
              }}
            </Button>
          </AlertDialogAction>
        </div>
      </AlertDialogContent>
    </AlertDialogPortal>
  </AlertDialogRoot>

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
