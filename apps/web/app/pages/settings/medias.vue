<script setup lang="ts">
import {
  computed,
  definePageMeta,
  reactive,
  ref,
  useI18n,
  watch,
} from "#imports";
import { Icon } from "@iconify/vue/offline";
import type {
  AdminMediaCopyField,
  AdminMediaCopyCountFilter,
  AdminMediaField,
  AdminMediaFieldValue,
  AdminMediaListQuery,
  AdminMediaListResponse,
  AdminMediaManualFilter,
  AdminMediaMetadataFilter,
  AdminMediaMissingFilter,
  AdminMediaResponse,
  AdminMediaSortField,
  CreateAdminMediaCopyRequest,
  CreateAdminMediaRequest,
  MediaType,
} from "@peridot/contracts";
import { Badge } from "@peridot/ui/components/ui/badge";
import { Button } from "@peridot/ui/components/ui/button";
import { Input } from "@peridot/ui/components/ui/input";
import { PeridotSpinner } from "@peridot/ui/components/ui/spinner";
import { useQuery, useQueryClient } from "@tanstack/vue-query";
import { refDebounced } from "@vueuse/core";
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
import MediaManagerDrawer from "../../components/MediaManagerDrawer.vue";
import {
  useAdminSourcesQuery,
  useMetadataProvidersQuery,
} from "../../composables/use-admin-queries";
import { useLocalizedMessage } from "../../composables/use-localized-message";
import { useQueryScope } from "../../composables/use-query-scope";
import { useServerConnection } from "../../composables/use-server-connection";
import { useSession } from "../../composables/use-session";
import { useUser } from "../../composables/use-user";
import { icons } from "../../lib/icons";
import {
  createAdminMedia,
  createAdminMediaCopy,
  deleteAdminMedia,
  deleteAdminMediaCopy,
  isAuthenticationRedirectError,
  listAdminMedias,
  resetAdminMediaCopyField,
  resetAdminMediaField,
  updateAdminMediaCopyField,
  updateAdminMediaField,
} from "../../lib/peridot-client";
import { queryKeys } from "../../lib/query-keys";

definePageMeta({ layout: "settings" });

interface Filters {
  query: string;
  mediaType: "all" | MediaType;
  availability: "all" | "available" | "unavailable";
  sourceId: string;
  metadataState: AdminMediaMetadataFilter;
  providerId: string;
  copyCount: AdminMediaCopyCountFilter;
  lossless: "any" | "true" | "false";
  mimeType: string;
  minBitrate: string;
  maxBitrate: string;
  minFileSizeBytes: string;
  maxFileSizeBytes: string;
  missing: AdminMediaMissingFilter;
  manual: AdminMediaManualFilter;
  publishedFrom: string;
  publishedTo: string;
  fileModifiedFrom: string;
  fileModifiedTo: string;
}

const { t } = useI18n();
const { errorMessage } = useLocalizedMessage();
const { scope } = useQueryScope();
const { token } = useSession();
const { user } = useUser();
const { status: serverStatus } = useServerConnection();
const sourcesQuery = useAdminSourcesQuery();
const metadataQuery = useMetadataProvidersQuery();
const sources = sourcesQuery.items;
const providers = metadataQuery.providers;
const queryClient = useQueryClient();
const canManage = computed(() => user.value?.role === "admin");
const serverLost = computed(() => serverStatus.value === "lost");
const filtersOpen = ref(false);
const selectedId = ref<string | null>(null);
const drawerOpen = ref(false);
const page = ref(1);
const pageSize = ref<25 | 50 | 100>(25);
const sort = ref<AdminMediaSortField>("updatedAt");
const direction = ref<"asc" | "desc">("desc");
const filters = reactive<Filters>({
  query: "",
  mediaType: "all",
  availability: "all",
  sourceId: "",
  metadataState: "all",
  providerId: "",
  copyCount: "any",
  lossless: "any",
  mimeType: "",
  minBitrate: "",
  maxBitrate: "",
  minFileSizeBytes: "",
  maxFileSizeBytes: "",
  missing: "none",
  manual: "any",
  publishedFrom: "",
  publishedTo: "",
  fileModifiedFrom: "",
  fileModifiedTo: "",
});
const debouncedQuery = refDebounced(
  computed(() => filters.query.trim()),
  250,
);

function numeric(value: string): number | undefined {
  if (!value.trim()) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

const listOptions = computed<AdminMediaListQuery>(() => {
  const values: Record<string, unknown> = {
    page: page.value,
    pageSize: pageSize.value,
    sort: sort.value,
    direction: direction.value,
    query: debouncedQuery.value || undefined,
    mediaType: filters.mediaType,
    availability: filters.availability,
    sourceId: filters.sourceId || undefined,
    metadataState: filters.metadataState,
    providerId: filters.providerId || undefined,
    copyCount: filters.copyCount,
    lossless: filters.lossless,
    mimeType: filters.mimeType || undefined,
    minBitrate: numeric(filters.minBitrate),
    maxBitrate: numeric(filters.maxBitrate),
    minFileSizeBytes: filters.minFileSizeBytes.trim() || undefined,
    maxFileSizeBytes: filters.maxFileSizeBytes.trim() || undefined,
    missing: filters.missing,
    manual: filters.manual,
    publishedFrom: filters.publishedFrom || undefined,
    publishedTo: filters.publishedTo || undefined,
    fileModifiedFrom: filters.fileModifiedFrom || undefined,
    fileModifiedTo: filters.fileModifiedTo || undefined,
  };
  return Object.fromEntries(
    Object.entries(values).filter(([, value]) => value !== undefined),
  ) as unknown as AdminMediaListQuery;
});
const listKey = computed(() =>
  scope.value
    ? queryKeys.adminMedias(
        scope.value,
        listOptions.value as Record<string, unknown>,
      )
    : ["peridot", "unscoped", "admin", "medias", listOptions.value],
);
const mediaQuery = useQuery({
  queryKey: listKey,
  queryFn: () => {
    if (!scope.value || !token.value) {
      throw new Error("Peridot query scope is unavailable.");
    }
    return listAdminMedias(
      scope.value.serverAddress,
      token.value,
      listOptions.value,
    );
  },
  enabled: computed(() =>
    Boolean(canManage.value && scope.value && token.value),
  ),
  meta: { persist: false },
});
const pageData = computed(() => mediaQuery.data.value);
const items = computed(() => pageData.value?.items ?? []);
const selectedMedia = computed(
  () => items.value.find((item) => item.id === selectedId.value) ?? null,
);
const loading = computed(() => mediaQuery.isPending.value);
const error = computed(() => {
  const reason = mediaQuery.error.value;
  if (!reason || isAuthenticationRedirectError(reason)) return "";
  return errorMessage(reason, "settings.medias.loadError");
});
const activeFilterCount = computed(() => {
  let count = 0;
  if (debouncedQuery.value) count += 1;
  if (filters.mediaType !== "all") count += 1;
  if (filters.availability !== "all") count += 1;
  if (filters.sourceId) count += 1;
  if (filters.metadataState !== "all") count += 1;
  if (filters.providerId) count += 1;
  if (filters.copyCount !== "any") count += 1;
  if (filters.lossless !== "any") count += 1;
  if (filters.mimeType) count += 1;
  if (filters.minBitrate || filters.maxBitrate) count += 1;
  if (filters.minFileSizeBytes || filters.maxFileSizeBytes) count += 1;
  if (filters.missing !== "none") count += 1;
  if (filters.manual !== "any") count += 1;
  if (filters.publishedFrom || filters.publishedTo) count += 1;
  if (filters.fileModifiedFrom || filters.fileModifiedTo) count += 1;
  return count;
});
const pageNumbers = computed(() => {
  const total = pageData.value?.totalPages ?? 1;
  const current = pageData.value?.page ?? 1;
  if (total <= 7) {
    return Array.from({ length: total }, (_, index) => index + 1);
  }
  const values = new Set([1, total, current - 1, current, current + 1]);
  const sorted = [...values]
    .filter((value) => value > 0 && value <= total)
    .sort((a, b) => a - b);
  const result: Array<number | null> = [];
  for (const value of sorted) {
    const previous = result.at(-1);
    if (typeof previous === "number" && value - previous > 1) result.push(null);
    result.push(value);
  }
  return result;
});

const mediaTypeOptions = computed(() => [
  { label: t("settings.medias.allTypes"), value: "all" },
  { label: t("settings.medias.music"), value: "music" },
  { label: t("settings.medias.audiobook"), value: "audiobook" },
  { label: t("settings.medias.podcast"), value: "podcast" },
]);
const availabilityOptions = computed(() => [
  { label: t("settings.medias.anyAvailability"), value: "all" },
  { label: t("settings.medias.available"), value: "available" },
  { label: t("settings.medias.unavailable"), value: "unavailable" },
]);
const metadataOptions = computed(() => [
  { label: t("settings.medias.anyMetadata"), value: "all" },
  { label: t("settings.medias.matchedMetadata"), value: "matched" },
  { label: t("settings.medias.unmatchedMetadata"), value: "unmatched" },
  { label: t("settings.medias.metadataManual"), value: "manual" },
  { label: t("settings.medias.metadataFile"), value: "file" },
]);
const copyCountOptions = computed(() => [
  { label: t("settings.medias.anyCopies"), value: "any" },
  { label: t("settings.medias.zeroCopies"), value: "zero" },
  { label: t("settings.medias.oneCopy"), value: "one" },
  { label: t("settings.medias.multipleCopies"), value: "multiple" },
]);
const qualityOptions = computed(() => [
  { label: t("settings.medias.anyQuality"), value: "any" },
  { label: t("settings.medias.lossless"), value: "true" },
  { label: t("settings.medias.lossy"), value: "false" },
]);
const missingOptions = computed(() => [
  { label: t("settings.medias.notMissing"), value: "none" },
  { label: t("settings.medias.missingAlbum"), value: "album" },
  { label: t("settings.medias.missingGenres"), value: "genres" },
  { label: t("settings.medias.missingDuration"), value: "duration" },
  { label: t("settings.medias.missingPublishedAt"), value: "publishedAt" },
  { label: t("settings.medias.missingCover"), value: "cover" },
  { label: t("settings.medias.missingMetadata"), value: "metadata" },
  { label: t("settings.medias.missingCopy"), value: "copy" },
]);
const manualOptions = computed(() => [
  { label: t("settings.medias.anyOverrides"), value: "any" },
  { label: t("settings.medias.noOverrides"), value: "none" },
  { label: t("settings.medias.mediaOverrides"), value: "media" },
  { label: t("settings.medias.copyOverrides"), value: "copy" },
]);

watch(
  () => [
    debouncedQuery.value,
    filters.mediaType,
    filters.availability,
    filters.sourceId,
    filters.metadataState,
    filters.providerId,
    filters.copyCount,
    filters.lossless,
    filters.mimeType,
    filters.minBitrate,
    filters.maxBitrate,
    filters.minFileSizeBytes,
    filters.maxFileSizeBytes,
    filters.missing,
    filters.manual,
    filters.publishedFrom,
    filters.publishedTo,
    filters.fileModifiedFrom,
    filters.fileModifiedTo,
  ],
  () => {
    page.value = 1;
  },
);

watch(selectedId, (id) => {
  if (id && !selectedMedia.value) drawerOpen.value = false;
});

function resetFilters() {
  filters.query = "";
  filters.mediaType = "all";
  filters.availability = "all";
  filters.sourceId = "";
  filters.metadataState = "all";
  filters.providerId = "";
  filters.copyCount = "any";
  filters.lossless = "any";
  filters.mimeType = "";
  filters.minBitrate = "";
  filters.maxBitrate = "";
  filters.minFileSizeBytes = "";
  filters.maxFileSizeBytes = "";
  filters.missing = "none";
  filters.manual = "any";
  filters.publishedFrom = "";
  filters.publishedTo = "";
  filters.fileModifiedFrom = "";
  filters.fileModifiedTo = "";
  page.value = 1;
}

function toggleSort(field: AdminMediaSortField) {
  if (sort.value === field) {
    direction.value = direction.value === "asc" ? "desc" : "asc";
  } else {
    sort.value = field;
    direction.value = "asc";
  }
  page.value = 1;
}

function ariaSort(field: AdminMediaSortField) {
  if (sort.value !== field) return "none";
  return direction.value === "asc" ? "ascending" : "descending";
}

function selectMedia(media: AdminMediaResponse) {
  selectedId.value = media.id;
  drawerOpen.value = true;
}

function updateQueryItem(updated: AdminMediaResponse) {
  queryClient.setQueryData<AdminMediaListResponse>(listKey.value, (current) =>
    current
      ? {
          ...current,
          items: current.items.map((item) =>
            item.id === updated.id ? updated : item,
          ),
        }
      : current,
  );
}

async function refreshList() {
  await mediaQuery.refetch();
}

async function localizedMutation<T>(work: () => Promise<T>, fallback: string) {
  try {
    return await work();
  } catch (reason) {
    if (isAuthenticationRedirectError(reason)) throw reason;
    throw new Error(errorMessage(reason, fallback) ?? t(fallback), {
      cause: reason,
    });
  }
}

async function saveMedia(field: AdminMediaField, value: AdminMediaFieldValue) {
  if (!scope.value || !token.value || !selectedMedia.value) return;
  const updated = await localizedMutation(
    () =>
      updateAdminMediaField(
        scope.value!.serverAddress,
        token.value!,
        selectedMedia.value!.id,
        field,
        value,
        selectedMedia.value!.updatedAt,
      ),
    "settings.medias.saveError",
  );
  updateQueryItem(updated);
}

async function resetMedia(field: AdminMediaField) {
  if (!scope.value || !token.value || !selectedMedia.value) return;
  const updated = await localizedMutation(
    () =>
      resetAdminMediaField(
        scope.value!.serverAddress,
        token.value!,
        selectedMedia.value!.id,
        field,
        selectedMedia.value!.updatedAt,
      ),
    "settings.medias.resetError",
  );
  updateQueryItem(updated);
}

async function saveCopy(
  copyId: string,
  field: AdminMediaCopyField,
  value: AdminMediaFieldValue,
) {
  if (!scope.value || !token.value || !selectedMedia.value) return;
  const copy = selectedMedia.value.copies.find((entry) => entry.id === copyId);
  if (!copy) return;
  const updated = await localizedMutation(
    () =>
      updateAdminMediaCopyField(
        scope.value!.serverAddress,
        token.value!,
        selectedMedia.value!.id,
        copyId,
        field,
        value,
        copy.updatedAt,
      ),
    "settings.medias.saveError",
  );
  updateQueryItem(updated);
}

async function resetCopy(copyId: string, field: AdminMediaCopyField) {
  if (!scope.value || !token.value || !selectedMedia.value) return;
  const copy = selectedMedia.value.copies.find((entry) => entry.id === copyId);
  if (!copy) return;
  const updated = await localizedMutation(
    () =>
      resetAdminMediaCopyField(
        scope.value!.serverAddress,
        token.value!,
        selectedMedia.value!.id,
        copyId,
        field,
        copy.updatedAt,
      ),
    "settings.medias.resetError",
  );
  updateQueryItem(updated);
}

async function addCopy(input: CreateAdminMediaCopyRequest) {
  if (!scope.value || !token.value || !selectedMedia.value) return;
  const updated = await localizedMutation(
    () =>
      createAdminMediaCopy(
        scope.value!.serverAddress,
        token.value!,
        selectedMedia.value!.id,
        input,
      ),
    "settings.medias.copySaveError",
  );
  updateQueryItem(updated);
}

const deleteCopyId = ref<string | null>(null);
const copyingDelete = ref(false);
const copyDeleteOpen = computed({
  get: () => Boolean(deleteCopyId.value),
  set: (value: boolean) => {
    if (!value) deleteCopyId.value = null;
  },
});

function requestDeleteCopy(copyId: string) {
  deleteCopyId.value = copyId;
}

async function confirmDeleteCopy() {
  if (
    !scope.value ||
    !token.value ||
    !selectedMedia.value ||
    !deleteCopyId.value
  )
    return;
  copyingDelete.value = true;
  try {
    const updated = await localizedMutation(
      () =>
        deleteAdminMediaCopy(
          scope.value!.serverAddress,
          token.value!,
          selectedMedia.value!.id,
          deleteCopyId.value!,
        ),
      "settings.medias.copyDeleteError",
    );
    updateQueryItem(updated);
    deleteCopyId.value = null;
  } finally {
    copyingDelete.value = false;
  }
}

const deleteMediaTarget = ref<AdminMediaResponse | null>(null);
const deletingMedia = ref(false);
const mediaDeleteOpen = computed({
  get: () => Boolean(deleteMediaTarget.value),
  set: (value: boolean) => {
    if (!value) deleteMediaTarget.value = null;
  },
});

function requestDeleteMedia(media = selectedMedia.value) {
  if (media) deleteMediaTarget.value = media;
}

async function confirmDeleteMedia() {
  if (!scope.value || !token.value || !deleteMediaTarget.value) return;
  deletingMedia.value = true;
  try {
    await localizedMutation(
      () =>
        deleteAdminMedia(
          scope.value!.serverAddress,
          token.value!,
          deleteMediaTarget.value!.id,
        ),
      "settings.medias.deleteError",
    );
    deleteMediaTarget.value = null;
    selectedId.value = null;
    drawerOpen.value = false;
    page.value = 1;
    await refreshList();
  } finally {
    deletingMedia.value = false;
  }
}

const createOpen = ref(false);
const creating = ref(false);
const createError = ref("");
const createForm = reactive({
  mediaType: "music" as MediaType,
  title: "",
  artist: "",
  album: "",
});

function openCreate() {
  createForm.mediaType = "music";
  createForm.title = "";
  createForm.artist = "";
  createForm.album = "";
  createError.value = "";
  createOpen.value = true;
}

async function submitCreate() {
  if (!scope.value || !token.value || creating.value) return;
  if (!createForm.title.trim() || !createForm.artist.trim()) {
    createError.value = t("settings.medias.createRequired");
    return;
  }
  creating.value = true;
  createError.value = "";
  try {
    const input: CreateAdminMediaRequest = {
      mediaType: createForm.mediaType,
      title: createForm.title.trim(),
      artist: createForm.artist.trim(),
      album: createForm.album.trim() || null,
    };
    const created = await localizedMutation(
      () => createAdminMedia(scope.value!.serverAddress, token.value!, input),
      "settings.medias.createError",
    );
    createOpen.value = false;
    page.value = 1;
    await refreshList();
    selectedId.value = created.id;
    drawerOpen.value = true;
  } catch (reason) {
    createError.value =
      reason instanceof Error
        ? reason.message
        : t("settings.medias.createError");
  } finally {
    creating.value = false;
  }
}

watch(
  () => pageData.value?.page,
  (value) => {
    if (value && value !== page.value) page.value = value;
  },
);
</script>

<template>
  <div class="flex h-full min-h-0 flex-col">
    <section
      v-if="!canManage"
      role="alert"
      class="m-4 rounded-lg border bg-card p-6 text-sm text-card-foreground"
    >
      {{ t("settings.medias.adminRequired") }}
    </section>

    <section v-else class="flex min-h-0 flex-1 flex-col">
      <div
        class="flex shrink-0 flex-col gap-3 border-b bg-card px-3 py-2 text-card-foreground lg:flex-row lg:items-center"
      >
        <Input
          v-model="filters.query"
          autocomplete="off"
          :placeholder="t('settings.medias.searchPlaceholder')"
          class="min-w-0 flex-1"
        />
        <div class="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="outline"
            @click="filtersOpen = !filtersOpen"
          >
            <Icon :icon="icons.filterIcon" aria-hidden="true" class="size-4" />
            {{ t("settings.medias.filters") }}
            <Badge v-if="activeFilterCount" variant="secondary">{{
              activeFilterCount
            }}</Badge>
          </Button>
          <Button
            v-if="activeFilterCount"
            type="button"
            variant="ghost"
            @click="resetFilters"
          >
            {{ t("settings.medias.clearFilters") }}
          </Button>
          <Button type="button" @click="openCreate">
            <Icon :icon="icons.plus" aria-hidden="true" class="size-4" />
            {{ t("settings.medias.createMedia") }}
          </Button>
        </div>
      </div>

      <div
        v-if="filtersOpen"
        class="grid shrink-0 gap-3 border-b bg-card p-4 text-card-foreground sm:grid-cols-2 xl:grid-cols-4"
      >
        <label class="space-y-1 text-sm"
          ><span class="font-medium">{{
            t("settings.medias.fieldMediaType")
          }}</span
          ><select
            v-model="filters.mediaType"
            class="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
          >
            <option
              v-for="option in mediaTypeOptions"
              :key="option.value"
              :value="option.value"
            >
              {{ option.label }}
            </option>
          </select></label
        >
        <label class="space-y-1 text-sm"
          ><span class="font-medium">{{
            t("settings.medias.fieldAvailability")
          }}</span
          ><select
            v-model="filters.availability"
            class="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
          >
            <option
              v-for="option in availabilityOptions"
              :key="option.value"
              :value="option.value"
            >
              {{ option.label }}
            </option>
          </select></label
        >
        <label class="space-y-1 text-sm"
          ><span class="font-medium">{{
            t("settings.medias.fieldSource")
          }}</span
          ><select
            v-model="filters.sourceId"
            class="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
          >
            <option value="">{{ t("settings.medias.anySource") }}</option>
            <option
              v-for="source in sources"
              :key="source.id"
              :value="source.id"
            >
              {{ source.name || source.path || source.kind }}
            </option>
          </select></label
        >
        <label class="space-y-1 text-sm"
          ><span class="font-medium">{{
            t("settings.medias.fieldMetadataState")
          }}</span
          ><select
            v-model="filters.metadataState"
            class="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
          >
            <option
              v-for="option in metadataOptions"
              :key="option.value"
              :value="option.value"
            >
              {{ option.label }}
            </option>
          </select></label
        >
        <label class="space-y-1 text-sm"
          ><span class="font-medium">{{
            t("settings.medias.fieldProvider")
          }}</span
          ><select
            v-model="filters.providerId"
            class="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
          >
            <option value="">{{ t("settings.medias.anyProvider") }}</option>
            <option
              v-for="provider in providers"
              :key="provider.id"
              :value="provider.id"
            >
              {{ provider.name }}
            </option>
          </select></label
        >
        <label class="space-y-1 text-sm"
          ><span class="font-medium">{{
            t("settings.medias.fieldCopyCount")
          }}</span
          ><select
            v-model="filters.copyCount"
            class="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
          >
            <option
              v-for="option in copyCountOptions"
              :key="option.value"
              :value="option.value"
            >
              {{ option.label }}
            </option>
          </select></label
        >
        <label class="space-y-1 text-sm"
          ><span class="font-medium">{{
            t("settings.medias.fieldQuality")
          }}</span
          ><select
            v-model="filters.lossless"
            class="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
          >
            <option
              v-for="option in qualityOptions"
              :key="option.value"
              :value="option.value"
            >
              {{ option.label }}
            </option>
          </select></label
        >
        <label class="space-y-1 text-sm"
          ><span class="font-medium">{{
            t("settings.medias.fieldMimeType")
          }}</span
          ><select
            v-model="filters.mimeType"
            class="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
          >
            <option value="">{{ t("settings.medias.anyMimeType") }}</option>
            <option
              v-for="mime in pageData?.mimeTypes ?? []"
              :key="mime"
              :value="mime"
            >
              {{ mime }}
            </option>
          </select></label
        >
        <label class="space-y-1 text-sm"
          ><span class="font-medium">{{ t("settings.medias.minBitrate") }}</span
          ><Input v-model="filters.minBitrate" type="number"
        /></label>
        <label class="space-y-1 text-sm"
          ><span class="font-medium">{{ t("settings.medias.maxBitrate") }}</span
          ><Input v-model="filters.maxBitrate" type="number"
        /></label>
        <label class="space-y-1 text-sm"
          ><span class="font-medium">{{
            t("settings.medias.minFileSize")
          }}</span
          ><Input v-model="filters.minFileSizeBytes" inputmode="numeric"
        /></label>
        <label class="space-y-1 text-sm"
          ><span class="font-medium">{{
            t("settings.medias.maxFileSize")
          }}</span
          ><Input v-model="filters.maxFileSizeBytes" inputmode="numeric"
        /></label>
        <label class="space-y-1 text-sm"
          ><span class="font-medium">{{
            t("settings.medias.fieldMissing")
          }}</span
          ><select
            v-model="filters.missing"
            class="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
          >
            <option
              v-for="option in missingOptions"
              :key="option.value"
              :value="option.value"
            >
              {{ option.label }}
            </option>
          </select></label
        >
        <label class="space-y-1 text-sm"
          ><span class="font-medium">{{
            t("settings.medias.fieldManual")
          }}</span
          ><select
            v-model="filters.manual"
            class="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
          >
            <option
              v-for="option in manualOptions"
              :key="option.value"
              :value="option.value"
            >
              {{ option.label }}
            </option>
          </select></label
        >
        <label class="space-y-1 text-sm"
          ><span class="font-medium">{{
            t("settings.medias.publishedFrom")
          }}</span
          ><Input v-model="filters.publishedFrom" type="date"
        /></label>
        <label class="space-y-1 text-sm"
          ><span class="font-medium">{{
            t("settings.medias.publishedTo")
          }}</span
          ><Input v-model="filters.publishedTo" type="date"
        /></label>
        <label class="space-y-1 text-sm"
          ><span class="font-medium">{{
            t("settings.medias.fileModifiedFrom")
          }}</span
          ><Input v-model="filters.fileModifiedFrom" type="date"
        /></label>
        <label class="space-y-1 text-sm"
          ><span class="font-medium">{{
            t("settings.medias.fileModifiedTo")
          }}</span
          ><Input v-model="filters.fileModifiedTo" type="date"
        /></label>
      </div>

      <p
        v-if="error"
        role="alert"
        class="shrink-0 border-b bg-card px-3 py-2 text-sm text-destructive"
      >
        {{ error }}
      </p>

      <div
        class="min-h-0 flex-1 overflow-auto overscroll-contain border-b bg-card text-card-foreground"
      >
        <div
          role="table"
          :aria-label="t('settings.medias.tableLabel')"
          class="min-w-max"
        >
          <div role="rowgroup" class="sticky top-0 z-10 border-b bg-muted">
            <div
              role="row"
              class="flex min-w-full items-center text-xs font-medium text-muted-foreground"
            >
              <button
                role="columnheader"
                type="button"
                class="w-64 shrink-0 p-3 text-left"
                :aria-sort="ariaSort('title')"
                @click="toggleSort('title')"
              >
                {{ t("settings.medias.fieldTitle") }}
              </button>
              <button
                role="columnheader"
                type="button"
                class="w-48 shrink-0 p-3 text-left"
                :aria-sort="ariaSort('artist')"
                @click="toggleSort('artist')"
              >
                {{ t("settings.medias.fieldArtist") }}
              </button>
              <button
                role="columnheader"
                type="button"
                class="w-48 shrink-0 p-3 text-left"
                :aria-sort="ariaSort('album')"
                @click="toggleSort('album')"
              >
                {{ t("settings.medias.fieldAlbum") }}
              </button>
              <button
                role="columnheader"
                type="button"
                class="w-28 shrink-0 p-3 text-left"
                :aria-sort="ariaSort('mediaType')"
                @click="toggleSort('mediaType')"
              >
                {{ t("settings.medias.fieldMediaType") }}
              </button>
              <button
                role="columnheader"
                type="button"
                class="w-28 shrink-0 p-3 text-left"
                :aria-sort="ariaSort('copyCount')"
                @click="toggleSort('copyCount')"
              >
                {{ t("settings.medias.files") }}
              </button>
              <div role="columnheader" class="w-56 shrink-0 p-3 text-left">
                {{ t("settings.medias.sources") }}
              </div>
              <button
                role="columnheader"
                type="button"
                class="w-28 shrink-0 p-3 text-left"
                :aria-sort="ariaSort('available')"
                @click="toggleSort('available')"
              >
                {{ t("settings.medias.availability") }}
              </button>
              <div role="columnheader" class="w-36 shrink-0 p-3 text-left">
                {{ t("settings.medias.metadataState") }}
              </div>
              <button
                role="columnheader"
                type="button"
                class="w-32 shrink-0 p-3 text-left"
                :aria-sort="ariaSort('updatedAt')"
                @click="toggleSort('updatedAt')"
              >
                {{ t("settings.medias.updated") }}
              </button>
              <div role="columnheader" class="w-24 shrink-0 p-3 text-right">
                {{ t("settings.medias.actions") }}
              </div>
            </div>
          </div>
          <div v-if="loading" role="rowgroup">
            <div
              class="flex items-center gap-2 p-6 text-sm text-muted-foreground"
            >
              <PeridotSpinner :label="t('common.loading')" class="size-5" />{{
                t("common.loading")
              }}
            </div>
          </div>
          <div v-else-if="items.length" role="rowgroup" class="divide-y">
            <div
              v-for="media in items"
              :key="media.id"
              role="row"
              class="flex min-w-full cursor-pointer items-center text-sm hover:bg-muted/40"
              @click="selectMedia(media)"
            >
              <div role="cell" class="min-w-0 w-64 shrink-0 p-3">
                <p class="truncate font-medium">{{ media.title }}</p>
                <p class="truncate text-xs text-muted-foreground">
                  {{ media.id }}
                </p>
              </div>
              <div role="cell" class="w-48 shrink-0 truncate p-3">
                {{ media.artist }}
              </div>
              <div role="cell" class="w-48 shrink-0 truncate p-3">
                {{ media.album || "—" }}
              </div>
              <div role="cell" class="w-28 shrink-0 p-3">
                <Badge variant="outline">{{ media.mediaType }}</Badge>
              </div>
              <div role="cell" class="w-28 shrink-0 p-3">
                {{ media.usage.copyCount }}
              </div>
              <div role="cell" class="flex w-56 shrink-0 flex-wrap gap-1 p-3">
                <Badge
                  v-for="source in [
                    ...new Set(
                      media.copies.map((copy) => copy.librarySourceName),
                    ),
                  ]"
                  :key="source"
                  variant="secondary"
                  >{{ source }}</Badge><span
                  v-if="!media.copies.length"
                  class="text-xs text-muted-foreground"
                  >{{ t("settings.medias.noFiles") }}</span
                >
              </div>
              <div role="cell" class="w-28 shrink-0 p-3">
                <Badge :variant="media.available ? 'default' : 'secondary'">{{
                  media.available
                    ? t("settings.medias.available")
                    : t("settings.medias.unavailable")
                }}</Badge>
              </div>
              <div role="cell" class="w-36 shrink-0 p-3">
                <Badge variant="outline">{{ media.metadataMode }}</Badge>
              </div>
              <div
                role="cell"
                class="w-32 shrink-0 p-3 text-xs text-muted-foreground"
                :title="media.updatedAt"
              >
                {{ new Date(media.updatedAt).toLocaleDateString() }}
              </div>
              <div role="cell" class="flex w-24 shrink-0 justify-end gap-1 p-2">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  :aria-label="t('common.edit')"
                  @click.stop="selectMedia(media)"
                  ><Icon :icon="icons.edit" aria-hidden="true" class="size-4"
                /></Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  class="text-destructive"
                  :aria-label="t('settings.medias.deleteMedia')"
                  @click.stop="requestDeleteMedia(media)"
                  ><Icon :icon="icons.trash" aria-hidden="true" class="size-4"
                /></Button>
              </div>
            </div>
          </div>
          <p v-else class="p-6 text-sm text-muted-foreground">
            {{ t("settings.medias.empty") }}
          </p>
        </div>
      </div>

      <div
        class="flex shrink-0 flex-col gap-3 border-t bg-card p-3 text-card-foreground sm:flex-row sm:items-center"
      >
        <p class="text-sm text-muted-foreground">
          {{ t("settings.medias.total", { count: pageData?.totalCount ?? 0 }) }}
        </p>
        <div class="flex flex-wrap items-center gap-1 sm:ml-auto">
          <Button
            type="button"
            variant="outline"
            size="sm"
            :disabled="page <= 1"
            @click="page = Math.max(1, page - 1)"
            >{{ t("settings.medias.previous") }}</Button
          >
          <template
            v-for="(value, index) in pageNumbers"
            :key="`${value ?? 'gap'}-${index}`"
          >
            <span v-if="value === null" class="px-1 text-muted-foreground"
              >…</span
            >
            <Button
              v-else
              type="button"
              :variant="value === (pageData?.page ?? 1) ? 'default' : 'outline'"
              size="sm"
              :aria-current="
                value === (pageData?.page ?? 1) ? 'page' : undefined
              "
              @click="page = value"
              >{{ value }}</Button
            >
          </template>
          <Button
            type="button"
            variant="outline"
            size="sm"
            :disabled="page >= (pageData?.totalPages ?? 1)"
            @click="page += 1"
            >{{ t("settings.medias.next") }}</Button
          >
          <select
            v-model.number="pageSize"
            class="ml-2 h-8 rounded-md border border-input bg-transparent px-2 text-sm"
            :aria-label="t('settings.medias.pageSize')"
          >
            <option :value="25">25</option>
            <option :value="50">50</option>
            <option :value="100">100</option>
          </select>
        </div>
      </div>
    </section>
  </div>

  <MediaManagerDrawer
    v-model:open="drawerOpen"
    :media="selectedMedia"
    :sources="sources"
    :providers="providers"
    :save-media="saveMedia"
    :reset-media="resetMedia"
    :save-copy="saveCopy"
    :reset-copy="resetCopy"
    :create-copy="addCopy"
    :delete-copy="requestDeleteCopy"
    :delete-media="requestDeleteMedia"
    @closed="selectedId = null"
  />

  <DialogRoot v-model:open="createOpen">
    <DialogPortal>
      <DialogOverlay class="fixed inset-0 z-50 bg-background/80" />
      <DialogContent
        class="fixed left-1/2 top-1/2 z-50 w-full max-w-lg -translate-x-1/2 -translate-y-1/2 rounded-lg border bg-card p-6 text-card-foreground shadow-lg"
      >
        <form class="space-y-4" @submit.prevent="submitCreate">
          <div class="space-y-1">
            <DialogTitle class="text-lg font-semibold">{{
              t("settings.medias.createTitle")
            }}</DialogTitle>
            <DialogDescription class="text-sm text-muted-foreground">{{
              t("settings.medias.createDescription")
            }}</DialogDescription>
          </div>
          <label class="space-y-1 text-sm"
            ><span class="font-medium">{{
              t("settings.medias.fieldMediaType")
            }}</span
            ><select
              v-model="createForm.mediaType"
              class="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
            >
              <option value="music">{{ t("settings.medias.music") }}</option>
              <option value="audiobook">
                {{ t("settings.medias.audiobook") }}
              </option>
              <option value="podcast">
                {{ t("settings.medias.podcast") }}
              </option>
            </select></label
          >
          <div class="space-y-2">
            <label for="create-media-title" class="text-sm font-medium">{{
              t("settings.medias.fieldTitle")
            }}</label><Input
              id="create-media-title"
              v-model="createForm.title"
            />
          </div>
          <div class="space-y-2">
            <label for="create-media-artist" class="text-sm font-medium">{{
              t("settings.medias.fieldArtist")
            }}</label><Input
              id="create-media-artist"
              v-model="createForm.artist"
            />
          </div>
          <div class="space-y-2">
            <label for="create-media-album" class="text-sm font-medium">{{
              t("settings.medias.fieldAlbum")
            }}</label><Input
              id="create-media-album"
              v-model="createForm.album"
            />
          </div>
          <p v-if="createError" role="alert" class="text-sm text-destructive">
            {{ createError }}
          </p>
          <div class="flex justify-end gap-3">
            <Button
              type="button"
              variant="outline"
              :disabled="creating"
              @click="createOpen = false"
              >{{ t("common.cancel") }}</Button><Button
              type="submit"
              :disabled="creating || serverLost"
              >{{
                creating ? t("common.saving") : t("settings.medias.createMedia")
              }}</Button
            >
          </div>
        </form>
      </DialogContent>
    </DialogPortal>
  </DialogRoot>

  <AlertDialogRoot v-model:open="copyDeleteOpen">
    <AlertDialogPortal>
      <AlertDialogOverlay class="fixed inset-0 z-50 bg-background/80" />
      <AlertDialogContent
        class="fixed left-1/2 top-1/2 z-50 w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-lg border bg-card p-6 text-card-foreground shadow-lg"
      >
        <AlertDialogTitle class="text-lg font-semibold">{{
          t("settings.medias.deleteFileTitle")
        }}</AlertDialogTitle>
        <AlertDialogDescription class="mt-2 text-sm text-muted-foreground">{{
          t("settings.medias.deleteFileDescription")
        }}</AlertDialogDescription>
        <div class="mt-6 flex justify-end gap-3">
          <AlertDialogCancel as-child
            ><Button
              type="button"
              variant="outline"
              :disabled="copyingDelete"
              >{{ t("common.cancel") }}</Button
            ></AlertDialogCancel
          ><AlertDialogAction as-child @click="confirmDeleteCopy"
            ><Button
              type="button"
              variant="destructive"
              :disabled="copyingDelete"
              >{{
                copyingDelete
                  ? t("common.deleting")
                  : t("settings.medias.deleteFile")
              }}</Button
            ></AlertDialogAction
          >
        </div>
      </AlertDialogContent>
    </AlertDialogPortal>
  </AlertDialogRoot>

  <AlertDialogRoot v-model:open="mediaDeleteOpen">
    <AlertDialogPortal>
      <AlertDialogOverlay class="fixed inset-0 z-50 bg-background/80" />
      <AlertDialogContent
        class="fixed left-1/2 top-1/2 z-50 w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-lg border bg-card p-6 text-card-foreground shadow-lg"
      >
        <AlertDialogTitle class="text-lg font-semibold">{{
          t("settings.medias.deleteMediaTitle", {
            title: deleteMediaTarget?.title ?? "",
          })
        }}</AlertDialogTitle>
        <AlertDialogDescription
          class="mt-2 space-y-2 text-sm text-muted-foreground"
        >
          <span class="block">{{
            t("settings.medias.deleteMediaDescription")
          }}</span>
          <span class="block">{{
            t("settings.medias.deleteMediaImpact", {
              copies: deleteMediaTarget?.usage.copyCount ?? 0,
              likes: deleteMediaTarget?.usage.likeCount ?? 0,
              plays: deleteMediaTarget?.usage.playCount ?? 0,
              playlists: deleteMediaTarget?.usage.playlistItemCount ?? 0,
              aliases: deleteMediaTarget?.usage.aliasCount ?? 0,
            })
          }}</span>
        </AlertDialogDescription>
        <div class="mt-6 flex justify-end gap-3">
          <AlertDialogCancel as-child
            ><Button
              type="button"
              variant="outline"
              :disabled="deletingMedia"
              >{{ t("common.cancel") }}</Button
            ></AlertDialogCancel
          ><AlertDialogAction as-child @click="confirmDeleteMedia"
            ><Button
              type="button"
              variant="destructive"
              :disabled="deletingMedia || serverLost"
              >{{
                deletingMedia
                  ? t("common.deleting")
                  : t("settings.medias.deleteMedia")
              }}</Button
            ></AlertDialogAction
          >
        </div>
      </AlertDialogContent>
    </AlertDialogPortal>
  </AlertDialogRoot>
</template>
