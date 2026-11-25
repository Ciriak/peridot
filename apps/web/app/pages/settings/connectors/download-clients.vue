<script setup lang="ts">
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
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuPortal,
  DropdownMenuRoot,
  DropdownMenuTrigger,
  SelectContent,
  SelectIcon,
  SelectItem,
  SelectItemIndicator,
  SelectItemText,
  SelectPortal,
  SelectRoot,
  SelectTrigger,
  SelectViewport,
} from "reka-ui";
import { Icon } from "@iconify/vue/offline";
import type {
  ConnectorInstanceResponse,
  DownloadClientAuthType,
  DownloadClientInput,
  DownloadClientResponse,
  LibrarySourceResponse,
} from "@peridot/contracts";
import { Button } from "@peridot/ui/components/ui/button";
import { Input } from "@peridot/ui/components/ui/input";
import { PeridotSpinner } from "@peridot/ui/components/ui/spinner";
import { useQuery, useQueryClient } from "@tanstack/vue-query";
import { computed, onBeforeUnmount, ref, watch } from "vue";
import { definePageMeta, useI18n } from "#imports";
import { useQueryScope } from "../../../composables/use-query-scope";
import { useAdminSourcesQuery } from "../../../composables/use-admin-queries";
import { useServer } from "../../../composables/use-server";
import { useServerConnection } from "../../../composables/use-server-connection";
import { useSession } from "../../../composables/use-session";
import { useUser } from "../../../composables/use-user";
import { icons } from "../../../lib/icons";
import {
  discoverConnectorInstances,
  downloadClientsApi,
} from "../../../lib/peridot-client";
import { sourceKindIcon, sourceKindLabelKey } from "../../../lib/source-label";

definePageMeta({ layout: "settings" });

const { t } = useI18n();
const { address } = useServer();
const { token } = useSession();
const { user } = useUser();
const { scope } = useQueryScope();
const { status: serverStatus } = useServerConnection();
const serverLost = computed(() => serverStatus.value === "lost");
const api = computed(() => downloadClientsApi(address.value!, token.value!));
const queryClient = useQueryClient();
const clients = useQuery({
  queryKey: computed(() => ["download-clients", scope.value]),
  queryFn: () => api.value.list(),
  enabled: computed(() =>
    Boolean(address.value && token.value && user.value?.role === "admin"),
  ),
});
const librarySources = useAdminSourcesQuery();
const destinationSources = computed(() =>
  librarySources.items.value.filter((source) => !source.removal),
);

const open = ref(false);
const removeOpen = ref(false);
const pendingRemove = ref<DownloadClientResponse | null>(null);
const id = ref("");
const busy = ref(false);
const error = ref("");
const clientTypes = [{ kind: "qbittorrent", label: "qBittorrent" }] as const;
const kind = ref<DownloadClientInput["kind"]>();
const saved = computed(() =>
  clients.data.value?.find((client) => client.id === id.value),
);
const keepSecret = computed(
  () =>
    Boolean(saved.value) &&
    saved.value?.authType === form.value.authType &&
    sameClientUrl(saved.value?.url ?? "", form.value.url) &&
    (form.value.authType === "apiKey" ||
      saved.value?.username === form.value.username),
);
const blank = (name = "") => ({
  name,
  url: "",
  destinationSourceId: "",
  authType: "apiKey" as DownloadClientAuthType,
  username: "",
  password: "",
  apiKey: "",
});
const form = ref(blank());
const selectedDestinationSource = computed(() =>
  destinationSources.value.find(
    (source) => source.id === form.value.destinationSourceId,
  ),
);
const qbittorrentInstances = ref<ConnectorInstanceResponse[]>([]);
const selectedQbittorrentInstance = ref<ConnectorInstanceResponse | null>(null);
const qbittorrentScanState = ref<"idle" | "scanning" | "complete" | "failed">(
  "idle",
);
const qbittorrentScanError = ref("");
let qbittorrentScanTimer: ReturnType<typeof setTimeout> | undefined;
let qbittorrentScanController: AbortController | undefined;
let qbittorrentScanSequence = 0;

watch(
  () => form.value.url,
  (value) => {
    if (kind.value !== "qbittorrent") return;
    if (
      selectedQbittorrentInstance.value &&
      sameClientUrl(selectedQbittorrentInstance.value.url, value)
    ) {
      return;
    }
    selectedQbittorrentInstance.value = null;
    error.value = "";
    if (qbittorrentScanTimer) clearTimeout(qbittorrentScanTimer);
    qbittorrentScanTimer = undefined;
    if (!value.trim()) return;
    qbittorrentScanTimer = setTimeout(
      () => void scanQbittorrentInstances(value),
      450,
    );
  },
);

watch(open, (isOpen) => {
  if (!isOpen) resetQbittorrentDiscovery();
});

watch(removeOpen, (isOpen) => {
  if (!isOpen) pendingRemove.value = null;
});

function sameClientUrl(left: string, right: string): boolean {
  if (!left.trim() || !right.trim()) return left.trim() === right.trim();
  try {
    return new URL(left).href === new URL(right).href;
  } catch {
    return left === right;
  }
}

function resetQbittorrentDiscovery() {
  if (qbittorrentScanTimer) clearTimeout(qbittorrentScanTimer);
  qbittorrentScanTimer = undefined;
  qbittorrentScanController?.abort();
  qbittorrentScanController = undefined;
  qbittorrentScanSequence += 1;
  qbittorrentInstances.value = [];
  selectedQbittorrentInstance.value = null;
  qbittorrentScanState.value = "idle";
  qbittorrentScanError.value = "";
}

function edit(client?: DownloadClientResponse) {
  resetQbittorrentDiscovery();
  kind.value = client?.kind;
  id.value = client?.id ?? "";
  form.value = {
    name: client?.name ?? "",
    url: client?.url ?? "",
    destinationSourceId: client?.destinationSourceId ?? "",
    authType: client?.authType ?? "apiKey",
    username: client?.username ?? "",
    password: "",
    apiKey: "",
  };
  if (client) {
    selectedQbittorrentInstance.value = {
      kind: client.kind,
      id: client.id,
      label: client.name || "qBittorrent",
      url: client.url,
      version: null,
    };
    void scanQbittorrentInstances(client.url);
  }
  open.value = true;
  error.value = "";
}

function chooseClientType(clientKind: DownloadClientInput["kind"]) {
  kind.value = clientKind;
  id.value = "";
  form.value = blank(clientKind === "qbittorrent" ? "qBittorrent" : "");
  selectedQbittorrentInstance.value = null;
  error.value = "";
  void scanQbittorrentInstances();
}

async function scanQbittorrentInstances(addressHint = "") {
  if (!address.value || !token.value || serverLost.value) return;
  if (qbittorrentScanTimer) clearTimeout(qbittorrentScanTimer);
  qbittorrentScanTimer = undefined;
  qbittorrentScanController?.abort();
  const controller = new AbortController();
  qbittorrentScanController = controller;
  const sequence = ++qbittorrentScanSequence;
  qbittorrentScanState.value = "scanning";
  qbittorrentScanError.value = "";
  try {
    const result = await discoverConnectorInstances(
      address.value,
      token.value,
      "qbittorrent",
      addressHint,
      controller.signal,
    );
    if (sequence !== qbittorrentScanSequence || controller.signal.aborted) {
      return;
    }
    qbittorrentInstances.value = result.items;
    qbittorrentScanState.value = "complete";
  } catch (reason) {
    if (
      sequence !== qbittorrentScanSequence ||
      controller.signal.aborted ||
      (reason instanceof DOMException && reason.name === "AbortError")
    ) {
      return;
    }
    qbittorrentInstances.value = [];
    qbittorrentScanState.value = "failed";
    qbittorrentScanError.value = t("clients.scanFailed");
  } finally {
    if (qbittorrentScanController === controller) {
      qbittorrentScanController = undefined;
    }
  }
}

function selectQbittorrentInstance(instance: ConnectorInstanceResponse) {
  selectedQbittorrentInstance.value = instance;
  if (!form.value.name.trim()) form.value.name = instance.label;
  form.value.url = instance.url;
  error.value = "";
}

function askRemove(client: DownloadClientResponse) {
  pendingRemove.value = client;
  removeOpen.value = true;
  error.value = "";
}

async function confirmRemove() {
  const client = pendingRemove.value;
  if (!client) return;
  removeOpen.value = false;
  pendingRemove.value = null;
  await act("remove", client.id);
}

async function act(action: "save" | "remove", removeId?: string) {
  if (action !== "remove" && !kind.value) return;
  const instance = selectedQbittorrentInstance.value;
  busy.value = true;
  error.value = "";
  try {
    const { apiKey, username, password, ...fields } = form.value;
    const input: DownloadClientInput = {
      ...fields,
      url: instance?.url ?? form.value.url,
      kind: kind.value || "qbittorrent",
      ...(fields.authType === "password"
        ? { username, ...(password ? { password } : {}) }
        : apiKey
          ? { apiKey }
          : {}),
    };
    if (action === "remove") await api.value.remove(removeId!);
    else await api.value.save(input, id.value || undefined);
    open.value = false;
    form.value = blank();
    await clients.refetch();
    await queryClient.invalidateQueries({
      queryKey: ["download-client-options", scope.value],
    });
  } catch {
    error.value = t(
      action === "remove" ? "clients.removeFailed" : "clients.saveFailed",
    );
  } finally {
    busy.value = false;
  }
}

function destinationName(client: DownloadClientResponse) {
  const source = destinationSources.value.find(
    (item) => item.id === client.destinationSourceId,
  );
  return (
    source?.name ||
    source?.path ||
    source?.url ||
    t("clients.destinationNotSet")
  );
}

function destinationSourceLabel(source: LibrarySourceResponse): string {
  return source.name || source.path || source.url || source.kind;
}

function destinationSourceKindLabel(source: LibrarySourceResponse): string {
  const key = sourceKindLabelKey(source.kind);
  return key ? t(key) : source.kind;
}

onBeforeUnmount(() => {
  if (qbittorrentScanTimer) clearTimeout(qbittorrentScanTimer);
  qbittorrentScanController?.abort();
});
</script>

<template>
  <section v-if="user?.role === 'admin'" class="space-y-4">
    <div class="flex items-center justify-between">
      <h1 class="text-xl font-semibold">{{ t("clients.title") }}</h1>
      <Button :disabled="busy || serverLost" @click="edit()">
        <Icon :icon="icons.plus" aria-hidden="true" />
        {{ t("clients.add") }}
      </Button>
    </div>
    <p v-if="clients.error.value || (!open && error)" role="alert">
      {{ error || clients.error.value?.message }}
    </p>
    <div
      v-for="client in clients.data.value"
      :key="client.id"
      class="flex items-center gap-2 rounded-md border p-3"
    >
      <span
        role="img"
        :aria-label="
          clientTypes.find((type) => type.kind === client.kind)?.label
        "
        :title="clientTypes.find((type) => type.kind === client.kind)?.label"
        class="flex size-8 shrink-0 items-center justify-center text-muted-foreground"
      >
        <Icon :icon="icons.qbittorrent" aria-hidden="true" class="size-6" />
      </span>
      <div class="flex-1">
        <p>{{ client.name }}</p>
        <p class="text-sm text-muted-foreground">{{ client.url }}</p>
        <p class="text-sm text-muted-foreground">
          {{
            t("clients.destinationValue", { source: destinationName(client) })
          }}
        </p>
      </div>
      <Button
        variant="ghost"
        size="icon-sm"
        :disabled="busy"
        :aria-label="t('clients.edit', { client: client.name })"
        :title="t('clients.edit', { client: client.name })"
        @click="edit(client)"
      >
        <Icon :icon="icons.settings" aria-hidden="true" />
      </Button>
      <DropdownMenuRoot>
        <DropdownMenuTrigger as-child>
          <Button
            variant="ghost"
            size="icon-sm"
            :disabled="busy || serverLost"
            :aria-label="t('clients.actions', { client: client.name })"
          >
            <Icon :icon="icons.more" aria-hidden="true" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuPortal>
          <DropdownMenuContent
            side="bottom"
            align="end"
            :side-offset="4"
            class="z-50 w-40 rounded-lg border bg-popover p-1 text-popover-foreground shadow-lg"
          >
            <DropdownMenuItem
              class="flex cursor-pointer items-center gap-2 rounded-sm px-2 py-2 text-sm text-destructive outline-none data-disabled:cursor-default data-disabled:opacity-50"
              :disabled="busy || serverLost"
              @select="askRemove(client)"
            >
              <Icon :icon="icons.trash" aria-hidden="true" class="size-4" />
              {{ t("common.remove") }}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenuPortal>
      </DropdownMenuRoot>
    </div>

    <DialogRoot v-model:open="open">
      <DialogPortal>
        <DialogOverlay class="fixed inset-0 z-50 bg-background/80" />
        <DialogContent
          class="fixed left-1/2 top-1/2 z-50 max-h-svh w-full max-w-md -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-lg border bg-card p-6 text-card-foreground shadow-lg"
        >
          <DialogTitle class="text-lg font-semibold">
            {{
              kind
                ? clientTypes.find((client) => client.kind === kind)?.label
                : t("clients.add")
            }}
          </DialogTitle>
          <DialogDescription class="text-sm text-muted-foreground">
            {{
              t(
                !kind
                  ? "clients.chooseType"
                  : form.authType === "apiKey"
                    ? "clients.keyHelp"
                    : "clients.passwordHelp",
              )
            }}
          </DialogDescription>
          <div v-if="!kind" class="mt-4 grid gap-2">
            <Button
              v-for="clientType in clientTypes"
              :key="clientType.kind"
              variant="outline"
              class="justify-start"
              @click="chooseClientType(clientType.kind)"
            >
              {{ clientType.label }}
            </Button>
            <Button variant="ghost" @click="open = false">
              {{ t("common.cancel") }}
            </Button>
          </div>
          <form v-else class="mt-4 space-y-4" @submit.prevent="act('save')">
            <div class="space-y-2">
              <label for="qbittorrent-url" class="text-sm font-medium">
                {{ t("clients.url") }}
              </label>
              <Input
                id="qbittorrent-url"
                v-model="form.url"
                type="text"
                inputmode="url"
                required
                autocomplete="off"
                :placeholder="t('clients.urlPlaceholder')"
              />
              <p class="text-sm text-muted-foreground">
                {{ t("clients.scanHelp") }}
              </p>
              <div class="flex items-center justify-between gap-3">
                <p
                  class="flex min-w-0 items-center gap-2 text-sm text-muted-foreground"
                  role="status"
                  aria-live="polite"
                >
                  <PeridotSpinner
                    v-if="qbittorrentScanState === 'scanning'"
                    :label="t('clients.scanning')"
                    class="size-4"
                  />
                  <span v-if="qbittorrentScanState === 'scanning'">
                    {{ t("clients.scanning") }}
                  </span>
                </p>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  :disabled="qbittorrentScanState === 'scanning' || serverLost"
                  @click="scanQbittorrentInstances(form.url)"
                >
                  <Icon :icon="icons.restart" aria-hidden="true" />
                  {{ t("clients.scanAgain") }}
                </Button>
              </div>
              <p
                v-if="qbittorrentScanError"
                role="alert"
                class="text-sm text-destructive"
              >
                {{ qbittorrentScanError }}
              </p>
              <div v-if="qbittorrentInstances.length" class="space-y-2">
                <p class="text-sm font-medium">
                  {{ t("clients.discovered") }}
                </p>
                <div class="grid gap-2">
                  <Button
                    v-for="instance in qbittorrentInstances"
                    :key="`${instance.kind}:${instance.id}`"
                    type="button"
                    variant="outline"
                    class="h-auto justify-start py-3 text-left"
                    @click="selectQbittorrentInstance(instance)"
                  >
                    <Icon
                      :icon="icons.server"
                      aria-hidden="true"
                      class="size-5 shrink-0"
                    />
                    <span class="min-w-0 flex-1">
                      <span class="flex min-w-0 items-center gap-2">
                        <span
                          aria-hidden="true"
                          class="relative flex size-2 shrink-0"
                        >
                          <span
                            class="absolute inline-flex size-full animate-ping rounded-full bg-success opacity-75 motion-reduce:animate-none"
                          />
                          <span
                            class="relative inline-flex size-2 rounded-full bg-success"
                          />
                        </span>
                        <span class="truncate font-medium">
                          {{ instance.label }}
                        </span>
                        <span class="sr-only">{{ t("common.active") }}</span>
                      </span>
                      <span class="block truncate text-xs opacity-80">
                        {{ instance.url }}
                      </span>
                    </span>
                  </Button>
                </div>
              </div>
              <p
                v-else-if="qbittorrentScanState === 'complete'"
                class="text-sm text-muted-foreground"
              >
                {{ t("clients.noInstances") }}
              </p>
            </div>

            <label class="block space-y-2">
              <span class="text-sm font-medium">{{ t("indexer.name") }}</span>
              <Input v-model="form.name" required autocomplete="off" />
            </label>

            <label class="block space-y-2">
              <span class="text-sm font-medium">
                {{ t("clients.destinationSource") }}
              </span>
              <SelectRoot v-model="form.destinationSourceId">
                <SelectTrigger
                  :aria-label="t('clients.destinationSource')"
                  class="border-input flex h-9 w-full items-center justify-between gap-2 rounded-md border bg-transparent px-3 py-1 text-base shadow-xs outline-none transition-[color,box-shadow] focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-3 disabled:cursor-not-allowed disabled:opacity-50 md:text-sm"
                >
                  <span class="flex min-w-0 items-center gap-2">
                    <template v-if="selectedDestinationSource">
                      <span
                        role="img"
                        :aria-label="
                          destinationSourceKindLabel(selectedDestinationSource)
                        "
                        :title="
                          destinationSourceKindLabel(selectedDestinationSource)
                        "
                        class="flex size-4 shrink-0 items-center justify-center text-muted-foreground"
                      >
                        <Icon
                          :icon="
                            sourceKindIcon(selectedDestinationSource.kind) ??
                            icons.library
                          "
                          aria-hidden="true"
                          class="size-4"
                        />
                      </span>
                      <span class="truncate">
                        {{ destinationSourceLabel(selectedDestinationSource) }}
                      </span>
                    </template>
                    <span v-else class="truncate text-muted-foreground">
                      {{ t("clients.chooseDestinationSource") }}
                    </span>
                  </span>
                  <SelectIcon as-child>
                    <Icon
                      :icon="icons.caretDown"
                      aria-hidden="true"
                      class="size-4 shrink-0 opacity-50"
                    />
                  </SelectIcon>
                </SelectTrigger>
                <SelectPortal>
                  <SelectContent
                    position="popper"
                    :side-offset="4"
                    class="z-50 max-h-96 min-w-56 overflow-hidden rounded-md border bg-popover text-popover-foreground shadow-md"
                  >
                    <SelectViewport class="p-1">
                      <SelectItem
                        v-for="source in destinationSources"
                        :key="source.id"
                        :value="source.id"
                        class="relative flex w-full cursor-default select-none items-center gap-2 rounded-sm py-1.5 pl-8 pr-2 text-sm outline-none focus:bg-accent focus:text-accent-foreground"
                      >
                        <SelectItemIndicator
                          class="absolute left-2 flex size-4 items-center justify-center"
                        >
                          <Icon
                            :icon="icons.check"
                            aria-hidden="true"
                            class="size-4"
                          />
                        </SelectItemIndicator>
                        <span
                          role="img"
                          :aria-label="destinationSourceKindLabel(source)"
                          :title="destinationSourceKindLabel(source)"
                          class="flex size-4 shrink-0 items-center justify-center text-muted-foreground"
                        >
                          <Icon
                            :icon="sourceKindIcon(source.kind) ?? icons.library"
                            aria-hidden="true"
                            class="size-4"
                          />
                        </span>
                        <SelectItemText class="truncate">
                          {{ destinationSourceLabel(source) }}
                        </SelectItemText>
                      </SelectItem>
                    </SelectViewport>
                  </SelectContent>
                </SelectPortal>
              </SelectRoot>
              <NuxtLink
                class="text-sm text-muted-foreground underline"
                to="/settings/connectors/library-sources"
              >
                {{ t("clients.manageSources") }}
              </NuxtLink>
            </label>

            <label class="block space-y-2">
              <span class="text-sm font-medium">
                {{ t("clients.authType") }}
              </span>
              <select
                v-model="form.authType"
                class="w-full rounded-md border bg-background p-2"
                @change="
                  error = '';
                  form.apiKey = '';
                  form.password = '';
                "
              >
                <option value="apiKey">{{ t("indexer.apiKey") }}</option>
                <option value="password">{{ t("clients.userPass") }}</option>
              </select>
            </label>
            <template v-if="form.authType === 'password'">
              <label class="block space-y-2">
                <span class="text-sm font-medium">
                  {{ t("clients.username") }}
                </span>
                <Input v-model="form.username" required autocomplete="off" />
              </label>
              <label class="block space-y-2">
                <span class="text-sm font-medium">
                  {{ t("onboarding.password") }}
                </span>
                <Input
                  v-model="form.password"
                  type="password"
                  autocomplete="new-password"
                  :required="!keepSecret"
                  :placeholder="keepSecret ? t('clients.keepPassword') : ''"
                />
              </label>
            </template>
            <label v-else class="block space-y-2">
              <span class="text-sm font-medium">
                {{ t("indexer.apiKey") }}
              </span>
              <Input
                v-model="form.apiKey"
                type="password"
                autocomplete="new-password"
                :required="!keepSecret"
                :placeholder="keepSecret ? t('clients.keepKey') : ''"
              />
            </label>

            <p v-if="error" role="alert" class="text-sm text-destructive">
              {{ error }}
            </p>
            <div class="flex gap-2">
              <Button
                :disabled="busy || !form.destinationSourceId || serverLost"
                type="submit"
              >
                {{ t("common.save") }}
              </Button>
              <Button
                type="button"
                variant="ghost"
                :disabled="busy"
                @click="id ? (open = false) : edit()"
              >
                {{ t(id ? "common.cancel" : "common.back") }}
              </Button>
            </div>
          </form>
        </DialogContent>
      </DialogPortal>
    </DialogRoot>

    <AlertDialogRoot v-model:open="removeOpen">
      <AlertDialogPortal>
        <AlertDialogOverlay class="fixed inset-0 z-50 bg-background/80" />
        <AlertDialogContent
          class="fixed left-1/2 top-1/2 z-50 w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-lg border bg-card p-6 text-card-foreground shadow-lg"
        >
          <AlertDialogTitle class="text-lg font-semibold">
            {{
              t("clients.removeConfirmTitle", {
                client: pendingRemove?.name ?? "",
              })
            }}
          </AlertDialogTitle>
          <AlertDialogDescription class="text-sm text-muted-foreground">
            {{ t("clients.removeConfirmDescription") }}
          </AlertDialogDescription>
          <div class="mt-6 flex justify-end gap-3">
            <AlertDialogCancel as-child>
              <Button type="button" variant="outline">
                {{ t("common.cancel") }}
              </Button>
            </AlertDialogCancel>
            <AlertDialogAction as-child>
              <Button
                type="button"
                variant="destructive"
                :disabled="busy || serverLost"
                @click="confirmRemove"
              >
                {{ t("common.remove") }}
              </Button>
            </AlertDialogAction>
          </div>
        </AlertDialogContent>
      </AlertDialogPortal>
    </AlertDialogRoot>
  </section>
</template>
