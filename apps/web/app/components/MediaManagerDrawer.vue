<script setup lang="ts">
import { useI18n } from "#imports";
import { Icon } from "@iconify/vue/offline";
import type {
  AdminMediaCopyField,
  AdminMediaCopyResponse,
  AdminMediaField,
  AdminMediaFieldValue,
  AdminMediaResponse,
  CreateAdminMediaCopyRequest,
  LibrarySourceResponse,
  MetadataProviderResponse,
} from "@peridot/contracts";
import { Badge } from "@peridot/ui/components/ui/badge";
import { Button } from "@peridot/ui/components/ui/button";
import { Input } from "@peridot/ui/components/ui/input";
import {
  DialogContent,
  DialogDescription,
  DialogOverlay,
  DialogPortal,
  DialogRoot,
  DialogTitle,
} from "reka-ui";
import {
  computed,
  nextTick,
  onBeforeUnmount,
  onMounted,
  ref,
  watch,
} from "vue";
import AdminFieldEditor from "./AdminFieldEditor.vue";
import { icons } from "../lib/icons";

const open = defineModel<boolean>("open", { required: true });
const props = defineProps<{
  media: AdminMediaResponse | null;
  sources: readonly LibrarySourceResponse[];
  providers: readonly MetadataProviderResponse[];
  saveMedia: (
    field: AdminMediaField,
    value: AdminMediaFieldValue,
  ) => Promise<void>;
  resetMedia: (field: AdminMediaField) => Promise<void>;
  saveCopy: (
    copyId: string,
    field: AdminMediaCopyField,
    value: AdminMediaFieldValue,
  ) => Promise<void>;
  resetCopy: (copyId: string, field: AdminMediaCopyField) => Promise<void>;
  createCopy: (input: CreateAdminMediaCopyRequest) => Promise<void>;
  deleteCopy: (copyId: string) => void;
  deleteMedia: () => void;
}>();
const emit = defineEmits<{
  closed: [];
}>();
const { t } = useI18n();
const panel = ref<HTMLElement | null>(null);
const addCopyOpen = ref(false);
const savingCopy = ref(false);
const copyError = ref("");
const copySourceId = ref("");
const copyPath = ref("");
const copyTitle = ref("");
const copyArtist = ref("");
const copyMimeType = ref("audio/mpeg");
const copyFileSize = ref("0");
const copyModifiedAt = ref(new Date().toISOString().slice(0, 16));

const mediaTypeOptions = computed(() => [
  { label: t("settings.medias.music"), value: "music" },
  { label: t("settings.medias.audiobook"), value: "audiobook" },
  { label: t("settings.medias.podcast"), value: "podcast" },
]);
const originOptions = computed(() => [
  { label: t("settings.medias.originSource"), value: "source" },
  { label: t("settings.medias.originEmbedded"), value: "embedded" },
  { label: t("settings.medias.originFallback"), value: "fallback" },
]);
const metadataModeOptions = computed(() => [
  { label: t("settings.medias.metadataAutomatic"), value: "automatic" },
  { label: t("settings.medias.metadataManual"), value: "manual" },
  { label: t("settings.medias.metadataFile"), value: "file" },
]);
const providerKindOptions = computed(() => [
  { label: t("common.notConfigured"), value: "" },
  { label: "MusicBrainz", value: "musicbrainz" },
  { label: "Discogs", value: "discogs" },
]);
const sourceOptions = computed(() =>
  props.sources.map((source) => ({
    label: source.name || source.path || source.kind,
    value: source.id,
  })),
);
const providerOptions = computed(() => [
  { label: t("common.notConfigured"), value: "" },
  ...props.providers.map((provider) => ({
    label: provider.name,
    value: provider.id,
  })),
]);

function manualMedia(field: AdminMediaField) {
  return props.media?.manualOverrideFields.includes(field) ?? false;
}

function manualCopy(copy: AdminMediaCopyResponse, field: AdminMediaCopyField) {
  return copy.manualOverrideFields.includes(field);
}

function close() {
  open.value = false;
  addCopyOpen.value = false;
  emit("closed");
}

function requestMediaDelete() {
  props.deleteMedia();
}

function handleKeydown(event: KeyboardEvent) {
  if (!open.value || event.key !== "Escape") return;
  const target = event.target as HTMLElement | null;
  if (
    target?.matches("input, textarea, select, [contenteditable='true']") ||
    addCopyOpen.value
  ) {
    return;
  }
  event.preventDefault();
  close();
}

function openAddCopy() {
  if (!props.media) return;
  copySourceId.value = props.sources[0]?.id ?? "";
  copyPath.value = "";
  copyTitle.value = props.media.title;
  copyArtist.value = props.media.artist;
  copyMimeType.value = "audio/mpeg";
  copyFileSize.value = "0";
  copyModifiedAt.value = new Date().toISOString().slice(0, 16);
  copyError.value = "";
  addCopyOpen.value = true;
}

async function submitCopy() {
  if (!props.media || savingCopy.value) return;
  if (
    !copySourceId.value ||
    !copyPath.value.trim() ||
    !copyTitle.value.trim() ||
    !copyArtist.value.trim() ||
    !copyMimeType.value.trim()
  ) {
    copyError.value = t("settings.medias.copyRequired");
    return;
  }
  savingCopy.value = true;
  copyError.value = "";
  try {
    await props.createCopy({
      librarySourceId: copySourceId.value,
      relativePath: copyPath.value.trim(),
      mediaType: props.media.mediaType,
      mediaTypeOrigin: props.media.mediaTypeOrigin,
      title: copyTitle.value.trim(),
      artist: copyArtist.value.trim(),
      artistCredits: props.media.artistCredits,
      albumArtist: props.media.albumArtist,
      albumArtistCredits: props.media.albumArtistCredits,
      album: props.media.album,
      genres: props.media.genres,
      discNumber: props.media.discNumber,
      trackNumber: props.media.trackNumber,
      durationMs: props.media.durationMs,
      publishedAt: props.media.publishedAt,
      mimeType: copyMimeType.value.trim(),
      fileSizeBytes: copyFileSize.value.trim() || "0",
      fileModifiedAt: new Date(copyModifiedAt.value).toISOString(),
      audioLossless: false,
      audioBitrate: null,
    });
    addCopyOpen.value = false;
  } catch (error) {
    copyError.value =
      error instanceof Error
        ? error.message
        : t("settings.medias.copySaveError");
  } finally {
    savingCopy.value = false;
  }
}

watch(open, async (isOpen) => {
  if (!isOpen) return;
  await nextTick();
  panel.value?.focus();
});

onMounted(() => document.addEventListener("keydown", handleKeydown));
onBeforeUnmount(() => document.removeEventListener("keydown", handleKeydown));
</script>

<template>
  <Teleport to="body">
    <template v-if="open && media">
      <div
        aria-hidden="true"
        class="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm"
        @click="close"
      />
      <aside
        ref="panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="media-manager-detail-title"
        aria-describedby="media-manager-detail-description"
        tabindex="-1"
        class="fixed inset-y-0 right-0 z-50 flex w-full max-w-2xl flex-col border-l bg-card text-card-foreground shadow-lg outline-none"
      >
        <header class="flex items-start gap-3 border-b p-4">
          <div class="min-w-0 flex-1">
            <div class="flex flex-wrap items-center gap-2">
              <h2
                id="media-manager-detail-title"
                class="truncate text-lg font-semibold"
              >
                {{ media.title }}
              </h2>
              <Badge :variant="media.available ? 'default' : 'secondary'">
                {{
                  media.available
                    ? t("settings.medias.available")
                    : t("settings.medias.unavailable")
                }}
              </Badge>
              <Badge variant="outline">{{ media.mediaType }}</Badge>
            </div>
            <p
              id="media-manager-detail-description"
              class="mt-1 truncate text-sm text-muted-foreground"
            >
              {{ media.artist }} · {{ media.album || t("common.unknownAlbum") }}
            </p>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            :aria-label="t('common.close')"
            @click="close"
          >
            <Icon :icon="icons.close" aria-hidden="true" class="size-5" />
          </Button>
        </header>

        <div class="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
          <section
            class="grid gap-3 rounded-lg border bg-background p-3 sm:grid-cols-3"
          >
            <div>
              <p class="text-xs text-muted-foreground">
                {{ t("settings.medias.copyCount") }}
              </p>
              <p class="font-medium">{{ media.usage.copyCount }}</p>
            </div>
            <div>
              <p class="text-xs text-muted-foreground">
                {{ t("settings.medias.likes") }}
              </p>
              <p class="font-medium">{{ media.usage.likeCount }}</p>
            </div>
            <div>
              <p class="text-xs text-muted-foreground">
                {{ t("settings.medias.playlistUses") }}
              </p>
              <p class="font-medium">{{ media.usage.playlistItemCount }}</p>
            </div>
          </section>

          <details open class="rounded-lg border bg-background">
            <summary class="cursor-pointer px-4 py-3 font-medium">
              {{ t("settings.medias.catalogFields") }}
            </summary>
            <div class="grid gap-4 border-t p-4 sm:grid-cols-2">
              <AdminFieldEditor
                :label="t('settings.medias.fieldMediaType')"
                :value="media.mediaType"
                editor="select"
                :options="mediaTypeOptions"
                :manual="manualMedia('mediaType')"
                :save="(value) => saveMedia('mediaType', value)"
                :reset="() => resetMedia('mediaType')"
              />
              <AdminFieldEditor
                :label="t('settings.medias.fieldTitle')"
                :value="media.title"
                :manual="manualMedia('title')"
                :save="(value) => saveMedia('title', value)"
                :reset="() => resetMedia('title')"
              />
              <AdminFieldEditor
                :label="t('settings.medias.fieldArtist')"
                :value="media.artist"
                :manual="manualMedia('artist')"
                :save="(value) => saveMedia('artist', value)"
                :reset="() => resetMedia('artist')"
              />
              <AdminFieldEditor
                :label="t('settings.medias.fieldArtistCredits')"
                :value="media.artistCredits"
                editor="list"
                :manual="manualMedia('artistCredits')"
                :save="(value) => saveMedia('artistCredits', value)"
                :reset="() => resetMedia('artistCredits')"
              />
              <AdminFieldEditor
                :label="t('settings.medias.fieldAlbumArtist')"
                :value="media.albumArtist"
                :manual="manualMedia('albumArtist')"
                :save="(value) => saveMedia('albumArtist', value)"
                :reset="() => resetMedia('albumArtist')"
              />
              <AdminFieldEditor
                :label="t('settings.medias.fieldAlbumArtistCredits')"
                :value="media.albumArtistCredits"
                editor="list"
                :manual="manualMedia('albumArtistCredits')"
                :save="(value) => saveMedia('albumArtistCredits', value)"
                :reset="() => resetMedia('albumArtistCredits')"
              />
              <AdminFieldEditor
                :label="t('settings.medias.fieldAlbum')"
                :value="media.album"
                :manual="manualMedia('album')"
                :save="(value) => saveMedia('album', value)"
                :reset="() => resetMedia('album')"
              />
              <AdminFieldEditor
                :label="t('settings.medias.fieldGenres')"
                :value="media.genres"
                editor="list"
                :manual="manualMedia('genres')"
                :save="(value) => saveMedia('genres', value)"
                :reset="() => resetMedia('genres')"
              />
              <AdminFieldEditor
                :label="t('settings.medias.fieldDiscNumber')"
                :value="media.discNumber"
                editor="number"
                :manual="manualMedia('discNumber')"
                :save="(value) => saveMedia('discNumber', value)"
                :reset="() => resetMedia('discNumber')"
              />
              <AdminFieldEditor
                :label="t('settings.medias.fieldTrackNumber')"
                :value="media.trackNumber"
                editor="number"
                :manual="manualMedia('trackNumber')"
                :save="(value) => saveMedia('trackNumber', value)"
                :reset="() => resetMedia('trackNumber')"
              />
              <AdminFieldEditor
                :label="t('settings.medias.fieldDuration')"
                :value="media.durationMs"
                editor="number"
                :manual="manualMedia('durationMs')"
                :save="(value) => saveMedia('durationMs', value)"
                :reset="() => resetMedia('durationMs')"
              />
              <AdminFieldEditor
                :label="t('settings.medias.fieldPublishedAt')"
                :value="media.publishedAt"
                editor="datetime"
                :manual="manualMedia('publishedAt')"
                :save="(value) => saveMedia('publishedAt', value)"
                :reset="() => resetMedia('publishedAt')"
              />
              <AdminFieldEditor
                :label="t('settings.medias.fieldCoverId')"
                :value="media.coverId"
                :manual="manualMedia('coverId')"
                :save="(value) => saveMedia('coverId', value)"
                :reset="() => resetMedia('coverId')"
              />
            </div>
          </details>

          <details class="rounded-lg border bg-background">
            <summary class="cursor-pointer px-4 py-3 font-medium">
              {{ t("settings.medias.metadataFields") }}
            </summary>
            <div class="grid gap-4 border-t p-4 sm:grid-cols-2">
              <AdminFieldEditor
                :label="t('settings.medias.fieldMetadataMode')"
                :value="media.metadataMode"
                editor="select"
                :options="metadataModeOptions"
                :manual="manualMedia('metadataMode')"
                :save="(value) => saveMedia('metadataMode', value)"
                :reset="() => resetMedia('metadataMode')"
              />
              <AdminFieldEditor
                :label="t('settings.medias.fieldMetadataTitle')"
                :value="media.metadataTitle"
                :manual="manualMedia('metadataTitle')"
                :save="(value) => saveMedia('metadataTitle', value)"
                :reset="() => resetMedia('metadataTitle')"
              />
              <AdminFieldEditor
                :label="t('settings.medias.fieldMetadataArtist')"
                :value="media.metadataArtist"
                :manual="manualMedia('metadataArtist')"
                :save="(value) => saveMedia('metadataArtist', value)"
                :reset="() => resetMedia('metadataArtist')"
              />
              <AdminFieldEditor
                :label="t('settings.medias.fieldMetadataArtistCredits')"
                :value="media.metadataArtistCredits"
                editor="list"
                :manual="manualMedia('metadataArtistCredits')"
                :save="(value) => saveMedia('metadataArtistCredits', value)"
                :reset="() => resetMedia('metadataArtistCredits')"
              />
              <AdminFieldEditor
                :label="t('settings.medias.fieldMetadataAlbumArtist')"
                :value="media.metadataAlbumArtist"
                :manual="manualMedia('metadataAlbumArtist')"
                :save="(value) => saveMedia('metadataAlbumArtist', value)"
                :reset="() => resetMedia('metadataAlbumArtist')"
              />
              <AdminFieldEditor
                :label="t('settings.medias.fieldMetadataAlbumArtistCredits')"
                :value="media.metadataAlbumArtistCredits"
                editor="list"
                :manual="manualMedia('metadataAlbumArtistCredits')"
                :save="
                  (value) => saveMedia('metadataAlbumArtistCredits', value)
                "
                :reset="() => resetMedia('metadataAlbumArtistCredits')"
              />
              <AdminFieldEditor
                :label="t('settings.medias.fieldMetadataAlbum')"
                :value="media.metadataAlbum"
                :manual="manualMedia('metadataAlbum')"
                :save="(value) => saveMedia('metadataAlbum', value)"
                :reset="() => resetMedia('metadataAlbum')"
              />
              <AdminFieldEditor
                :label="t('settings.medias.fieldMetadataGenres')"
                :value="media.metadataGenres"
                editor="list"
                :manual="manualMedia('metadataGenres')"
                :save="(value) => saveMedia('metadataGenres', value)"
                :reset="() => resetMedia('metadataGenres')"
              />
              <AdminFieldEditor
                :label="t('settings.medias.fieldMetadataDiscNumber')"
                :value="media.metadataDiscNumber"
                editor="number"
                :manual="manualMedia('metadataDiscNumber')"
                :save="(value) => saveMedia('metadataDiscNumber', value)"
                :reset="() => resetMedia('metadataDiscNumber')"
              />
              <AdminFieldEditor
                :label="t('settings.medias.fieldMetadataTrackNumber')"
                :value="media.metadataTrackNumber"
                editor="number"
                :manual="manualMedia('metadataTrackNumber')"
                :save="(value) => saveMedia('metadataTrackNumber', value)"
                :reset="() => resetMedia('metadataTrackNumber')"
              />
              <AdminFieldEditor
                :label="t('settings.medias.fieldMetadataProviderId')"
                :value="media.metadataProviderId"
                editor="select"
                :options="providerOptions"
                :manual="manualMedia('metadataProviderId')"
                :save="(value) => saveMedia('metadataProviderId', value)"
                :reset="() => resetMedia('metadataProviderId')"
              />
              <AdminFieldEditor
                :label="t('settings.medias.fieldMetadataProviderKind')"
                :value="media.metadataProviderKind"
                editor="select"
                :options="providerKindOptions"
                :manual="manualMedia('metadataProviderKind')"
                :save="(value) => saveMedia('metadataProviderKind', value)"
                :reset="() => resetMedia('metadataProviderKind')"
              />
              <AdminFieldEditor
                :label="t('settings.medias.fieldMetadataProviderName')"
                :value="media.metadataProviderName"
                :manual="manualMedia('metadataProviderName')"
                :save="(value) => saveMedia('metadataProviderName', value)"
                :reset="() => resetMedia('metadataProviderName')"
              />
              <AdminFieldEditor
                :label="t('settings.medias.fieldExternalTrackId')"
                :value="media.metadataExternalTrackId"
                :manual="manualMedia('metadataExternalTrackId')"
                :save="(value) => saveMedia('metadataExternalTrackId', value)"
                :reset="() => resetMedia('metadataExternalTrackId')"
              />
              <AdminFieldEditor
                :label="t('settings.medias.fieldExternalReleaseId')"
                :value="media.metadataExternalReleaseId"
                :manual="manualMedia('metadataExternalReleaseId')"
                :save="(value) => saveMedia('metadataExternalReleaseId', value)"
                :reset="() => resetMedia('metadataExternalReleaseId')"
              />
              <AdminFieldEditor
                :label="t('settings.medias.fieldMetadataSourceUrl')"
                :value="media.metadataSourceUrl"
                :manual="manualMedia('metadataSourceUrl')"
                :save="(value) => saveMedia('metadataSourceUrl', value)"
                :reset="() => resetMedia('metadataSourceUrl')"
              />
              <AdminFieldEditor
                :label="t('settings.medias.fieldMetadataMatchedAt')"
                :value="media.metadataMatchedAt"
                editor="datetime"
                :manual="manualMedia('metadataMatchedAt')"
                :save="(value) => saveMedia('metadataMatchedAt', value)"
                :reset="() => resetMedia('metadataMatchedAt')"
              />
              <AdminFieldEditor
                class="sm:col-span-2"
                :label="t('settings.medias.fieldMetadataDetails')"
                :value="media.metadataDetails"
                editor="json"
                :manual="manualMedia('metadataDetails')"
                :save="(value) => saveMedia('metadataDetails', value)"
                :reset="() => resetMedia('metadataDetails')"
              />
            </div>
          </details>

          <details class="rounded-lg border bg-background">
            <summary class="cursor-pointer px-4 py-3 font-medium">
              {{ t("settings.medias.systemFields") }}
            </summary>
            <dl class="grid gap-3 border-t p-4 text-sm sm:grid-cols-2">
              <div>
                <dt class="text-muted-foreground">ID</dt>
                <dd class="break-all font-mono text-xs">{{ media.id }}</dd>
              </div>
              <div>
                <dt class="text-muted-foreground">
                  {{ t("settings.medias.fieldOrigin") }}
                </dt>
                <dd>{{ media.mediaTypeOrigin }}</dd>
              </div>
              <div>
                <dt class="text-muted-foreground">
                  {{ t("settings.medias.fieldMetadataVersion") }}
                </dt>
                <dd>{{ media.metadataVersion }}</dd>
              </div>
              <div>
                <dt class="text-muted-foreground">
                  {{ t("settings.medias.fieldProjectionPending") }}
                </dt>
                <dd>
                  {{
                    media.catalogProjectionPending
                      ? t("common.active")
                      : t("common.disabled")
                  }}
                </dd>
              </div>
              <div>
                <dt class="text-muted-foreground">
                  {{ t("settings.medias.fieldMatchedSignature") }}
                </dt>
                <dd class="break-all font-mono text-xs">
                  {{ media.metadataAttemptedSignature || "—" }}
                </dd>
              </div>
              <div>
                <dt class="text-muted-foreground">
                  {{ t("settings.medias.fieldUpdatedAt") }}
                </dt>
                <dd>{{ new Date(media.updatedAt).toLocaleString() }}</dd>
              </div>
              <div>
                <dt class="text-muted-foreground">
                  {{ t("settings.medias.fieldCreatedAt") }}
                </dt>
                <dd>{{ new Date(media.createdAt).toLocaleString() }}</dd>
              </div>
              <div>
                <dt class="text-muted-foreground">
                  {{ t("settings.medias.fieldPlayCount") }}
                </dt>
                <dd>{{ media.usage.playCount }}</dd>
              </div>
            </dl>
          </details>

          <section class="space-y-3">
            <div class="flex items-center justify-between gap-3">
              <div>
                <h3 class="font-medium">{{ t("settings.medias.files") }}</h3>
                <p class="text-xs text-muted-foreground">
                  {{ t("settings.medias.filesHelp") }}
                </p>
              </div>
              <Button type="button" size="sm" @click="openAddCopy">
                <Icon :icon="icons.plus" aria-hidden="true" class="size-4" />
                {{ t("settings.medias.addFile") }}
              </Button>
            </div>

            <p
              v-if="!media.copies.length"
              class="rounded-lg border bg-background p-4 text-sm text-muted-foreground"
            >
              {{ t("settings.medias.noFiles") }}
            </p>
            <details
              v-for="copy in media.copies"
              :key="copy.id"
              class="rounded-lg border bg-background"
            >
              <summary class="cursor-pointer px-4 py-3">
                <span class="flex flex-wrap items-center gap-2">
                  <span class="min-w-0 flex-1 truncate font-medium">{{
                    copy.relativePath
                  }}</span>
                  <Badge variant="outline">{{ copy.librarySourceName }}</Badge>
                  <Badge :variant="copy.available ? 'default' : 'secondary'">
                    {{
                      copy.available
                        ? t("settings.medias.available")
                        : t("settings.medias.unavailable")
                    }}
                  </Badge>
                </span>
                <span class="mt-1 block truncate text-xs text-muted-foreground">
                  {{
                    copy.librarySourcePath || t("settings.medias.remoteSource")
                  }}
                  · {{ copy.mimeType }}
                </span>
              </summary>
              <div class="grid gap-4 border-t p-4 sm:grid-cols-2">
                <AdminFieldEditor
                  :label="t('settings.medias.fieldLibrarySource')"
                  :value="copy.librarySourceId"
                  editor="select"
                  :options="sourceOptions"
                  :manual="manualCopy(copy, 'librarySourceId')"
                  :save="(value) => saveCopy(copy.id, 'librarySourceId', value)"
                  :reset="() => resetCopy(copy.id, 'librarySourceId')"
                />
                <AdminFieldEditor
                  :label="t('settings.medias.fieldRelativePath')"
                  :value="copy.relativePath"
                  :manual="manualCopy(copy, 'relativePath')"
                  :save="(value) => saveCopy(copy.id, 'relativePath', value)"
                  :reset="() => resetCopy(copy.id, 'relativePath')"
                />
                <AdminFieldEditor
                  :label="t('settings.medias.fieldMediaType')"
                  :value="copy.mediaType"
                  editor="select"
                  :options="mediaTypeOptions"
                  :manual="manualCopy(copy, 'mediaType')"
                  :save="(value) => saveCopy(copy.id, 'mediaType', value)"
                  :reset="() => resetCopy(copy.id, 'mediaType')"
                />
                <AdminFieldEditor
                  :label="t('settings.medias.fieldOrigin')"
                  :value="copy.mediaTypeOrigin"
                  editor="select"
                  :options="originOptions"
                  :manual="manualCopy(copy, 'mediaTypeOrigin')"
                  :save="(value) => saveCopy(copy.id, 'mediaTypeOrigin', value)"
                  :reset="() => resetCopy(copy.id, 'mediaTypeOrigin')"
                />
                <AdminFieldEditor
                  :label="t('settings.medias.fieldTitle')"
                  :value="copy.title"
                  :manual="manualCopy(copy, 'title')"
                  :save="(value) => saveCopy(copy.id, 'title', value)"
                  :reset="() => resetCopy(copy.id, 'title')"
                />
                <AdminFieldEditor
                  :label="t('settings.medias.fieldArtist')"
                  :value="copy.artist"
                  :manual="manualCopy(copy, 'artist')"
                  :save="(value) => saveCopy(copy.id, 'artist', value)"
                  :reset="() => resetCopy(copy.id, 'artist')"
                />
                <AdminFieldEditor
                  :label="t('settings.medias.fieldArtistCredits')"
                  :value="copy.artistCredits"
                  editor="list"
                  :manual="manualCopy(copy, 'artistCredits')"
                  :save="(value) => saveCopy(copy.id, 'artistCredits', value)"
                  :reset="() => resetCopy(copy.id, 'artistCredits')"
                />
                <AdminFieldEditor
                  :label="t('settings.medias.fieldAlbumArtist')"
                  :value="copy.albumArtist"
                  :manual="manualCopy(copy, 'albumArtist')"
                  :save="(value) => saveCopy(copy.id, 'albumArtist', value)"
                  :reset="() => resetCopy(copy.id, 'albumArtist')"
                />
                <AdminFieldEditor
                  :label="t('settings.medias.fieldAlbumArtistCredits')"
                  :value="copy.albumArtistCredits"
                  editor="list"
                  :manual="manualCopy(copy, 'albumArtistCredits')"
                  :save="
                    (value) => saveCopy(copy.id, 'albumArtistCredits', value)
                  "
                  :reset="() => resetCopy(copy.id, 'albumArtistCredits')"
                />
                <AdminFieldEditor
                  :label="t('settings.medias.fieldAlbum')"
                  :value="copy.album"
                  :manual="manualCopy(copy, 'album')"
                  :save="(value) => saveCopy(copy.id, 'album', value)"
                  :reset="() => resetCopy(copy.id, 'album')"
                />
                <AdminFieldEditor
                  :label="t('settings.medias.fieldGenres')"
                  :value="copy.genres"
                  editor="list"
                  :manual="manualCopy(copy, 'genres')"
                  :save="(value) => saveCopy(copy.id, 'genres', value)"
                  :reset="() => resetCopy(copy.id, 'genres')"
                />
                <AdminFieldEditor
                  :label="t('settings.medias.fieldDiscNumber')"
                  :value="copy.discNumber"
                  editor="number"
                  :manual="manualCopy(copy, 'discNumber')"
                  :save="(value) => saveCopy(copy.id, 'discNumber', value)"
                  :reset="() => resetCopy(copy.id, 'discNumber')"
                />
                <AdminFieldEditor
                  :label="t('settings.medias.fieldTrackNumber')"
                  :value="copy.trackNumber"
                  editor="number"
                  :manual="manualCopy(copy, 'trackNumber')"
                  :save="(value) => saveCopy(copy.id, 'trackNumber', value)"
                  :reset="() => resetCopy(copy.id, 'trackNumber')"
                />
                <AdminFieldEditor
                  :label="t('settings.medias.fieldDuration')"
                  :value="copy.durationMs"
                  editor="number"
                  :manual="manualCopy(copy, 'durationMs')"
                  :save="(value) => saveCopy(copy.id, 'durationMs', value)"
                  :reset="() => resetCopy(copy.id, 'durationMs')"
                />
                <AdminFieldEditor
                  :label="t('settings.medias.fieldPublishedAt')"
                  :value="copy.publishedAt"
                  editor="datetime"
                  :manual="manualCopy(copy, 'publishedAt')"
                  :save="(value) => saveCopy(copy.id, 'publishedAt', value)"
                  :reset="() => resetCopy(copy.id, 'publishedAt')"
                />
                <AdminFieldEditor
                  :label="t('settings.medias.fieldMimeType')"
                  :value="copy.mimeType"
                  :manual="manualCopy(copy, 'mimeType')"
                  :save="(value) => saveCopy(copy.id, 'mimeType', value)"
                  :reset="() => resetCopy(copy.id, 'mimeType')"
                />
                <AdminFieldEditor
                  :label="t('settings.medias.fieldFileSize')"
                  :value="copy.fileSizeBytes"
                  :manual="manualCopy(copy, 'fileSizeBytes')"
                  :save="(value) => saveCopy(copy.id, 'fileSizeBytes', value)"
                  :reset="() => resetCopy(copy.id, 'fileSizeBytes')"
                />
                <AdminFieldEditor
                  :label="t('settings.medias.fieldFileModifiedAt')"
                  :value="copy.fileModifiedAt"
                  editor="datetime"
                  :manual="manualCopy(copy, 'fileModifiedAt')"
                  :save="(value) => saveCopy(copy.id, 'fileModifiedAt', value)"
                  :reset="() => resetCopy(copy.id, 'fileModifiedAt')"
                />
                <AdminFieldEditor
                  :label="t('settings.medias.fieldLossless')"
                  :value="copy.audioLossless"
                  editor="boolean"
                  :manual="manualCopy(copy, 'audioLossless')"
                  :save="(value) => saveCopy(copy.id, 'audioLossless', value)"
                  :reset="() => resetCopy(copy.id, 'audioLossless')"
                />
                <AdminFieldEditor
                  :label="t('settings.medias.fieldBitrate')"
                  :value="copy.audioBitrate"
                  editor="number"
                  :manual="manualCopy(copy, 'audioBitrate')"
                  :save="(value) => saveCopy(copy.id, 'audioBitrate', value)"
                  :reset="() => resetCopy(copy.id, 'audioBitrate')"
                />
                <AdminFieldEditor
                  :label="t('settings.medias.fieldExternalId')"
                  :value="copy.externalId"
                  :manual="manualCopy(copy, 'externalId')"
                  :save="(value) => saveCopy(copy.id, 'externalId', value)"
                  :reset="() => resetCopy(copy.id, 'externalId')"
                />
                <AdminFieldEditor
                  :label="t('settings.medias.fieldExternalVersion')"
                  :value="copy.externalVersion"
                  :manual="manualCopy(copy, 'externalVersion')"
                  :save="(value) => saveCopy(copy.id, 'externalVersion', value)"
                  :reset="() => resetCopy(copy.id, 'externalVersion')"
                />
                <AdminFieldEditor
                  :label="t('settings.medias.fieldExternalContainer')"
                  :value="copy.externalContainer"
                  :manual="manualCopy(copy, 'externalContainer')"
                  :save="
                    (value) => saveCopy(copy.id, 'externalContainer', value)
                  "
                  :reset="() => resetCopy(copy.id, 'externalContainer')"
                />
                <AdminFieldEditor
                  :label="t('settings.medias.fieldExternalCoverKey')"
                  :value="copy.externalCoverKey"
                  :manual="manualCopy(copy, 'externalCoverKey')"
                  :save="
                    (value) => saveCopy(copy.id, 'externalCoverKey', value)
                  "
                  :reset="() => resetCopy(copy.id, 'externalCoverKey')"
                />
                <AdminFieldEditor
                  :label="t('settings.medias.fieldRecordingIdentities')"
                  :value="copy.recordingIdentityKeys"
                  editor="list"
                  :manual="manualCopy(copy, 'recordingIdentityKeys')"
                  :save="
                    (value) => saveCopy(copy.id, 'recordingIdentityKeys', value)
                  "
                  :reset="() => resetCopy(copy.id, 'recordingIdentityKeys')"
                />
                <AdminFieldEditor
                  :label="t('settings.medias.fieldCoverId')"
                  :value="copy.coverId"
                  :manual="manualCopy(copy, 'coverId')"
                  :save="(value) => saveCopy(copy.id, 'coverId', value)"
                  :reset="() => resetCopy(copy.id, 'coverId')"
                />
                <div class="sm:col-span-2">
                  <dl
                    class="grid gap-2 rounded-md border p-3 text-xs text-muted-foreground sm:grid-cols-2"
                  >
                    <div>
                      <dt>ID</dt>
                      <dd class="break-all font-mono">{{ copy.id }}</dd>
                    </div>
                    <div>
                      <dt>{{ t("settings.medias.fieldMetadataVersion") }}</dt>
                      <dd>{{ copy.metadataVersion }}</dd>
                    </div>
                    <div>
                      <dt>{{ t("settings.medias.fieldLastSeenScan") }}</dt>
                      <dd class="break-all font-mono">
                        {{ copy.lastSeenScanId || "—" }}
                      </dd>
                    </div>
                    <div>
                      <dt>{{ t("settings.medias.fieldUpdatedAt") }}</dt>
                      <dd>{{ new Date(copy.updatedAt).toLocaleString() }}</dd>
                    </div>
                  </dl>
                </div>
                <div class="sm:col-span-2 flex justify-end">
                  <Button
                    type="button"
                    variant="destructive"
                    size="sm"
                    @click="deleteCopy(copy.id)"
                  >
                    <Icon
                      :icon="icons.trash"
                      aria-hidden="true"
                      class="size-4"
                    />
                    {{ t("settings.medias.deleteFile") }}
                  </Button>
                </div>
              </div>
            </details>
          </section>
        </div>

        <footer class="flex items-center justify-between gap-3 border-t p-4">
          <Button
            type="button"
            variant="destructive"
            :disabled="!media"
            @click="requestMediaDelete"
          >
            <Icon :icon="icons.trash" aria-hidden="true" class="size-4" />
            {{ t("settings.medias.deleteMedia") }}
          </Button>
          <Button type="button" variant="outline" @click="close">
            {{ t("common.close") }}
          </Button>
        </footer>
      </aside>

      <DialogRoot v-model:open="addCopyOpen">
        <DialogPortal>
          <DialogOverlay class="fixed inset-0 z-50 bg-background/80" />
          <DialogContent
            class="fixed left-1/2 top-1/2 z-50 w-full max-w-lg -translate-x-1/2 -translate-y-1/2 rounded-lg border bg-card p-6 text-card-foreground shadow-lg"
          >
            <form class="space-y-4" @submit.prevent="submitCopy">
              <div class="space-y-1">
                <DialogTitle class="text-lg font-semibold">{{
                  t("settings.medias.addFileTitle")
                }}</DialogTitle>
                <DialogDescription class="text-sm text-muted-foreground">
                  {{ t("settings.medias.addFileDescription") }}
                </DialogDescription>
              </div>
              <div class="space-y-2">
                <label class="text-sm font-medium" for="media-copy-source">{{
                  t("settings.medias.fieldLibrarySource")
                }}</label>
                <select
                  id="media-copy-source"
                  v-model="copySourceId"
                  class="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
                >
                  <option
                    v-for="option in sourceOptions"
                    :key="option.value"
                    :value="option.value"
                  >
                    {{ option.label }}
                  </option>
                </select>
              </div>
              <div class="space-y-2">
                <label class="text-sm font-medium" for="media-copy-path">{{
                  t("settings.medias.fieldRelativePath")
                }}</label>
                <Input
                  id="media-copy-path"
                  v-model="copyPath"
                  autocomplete="off"
                />
              </div>
              <div class="grid gap-3 sm:grid-cols-2">
                <div class="space-y-2">
                  <label class="text-sm font-medium" for="media-copy-title">{{
                    t("settings.medias.fieldTitle")
                  }}</label>
                  <Input id="media-copy-title" v-model="copyTitle" />
                </div>
                <div class="space-y-2">
                  <label class="text-sm font-medium" for="media-copy-artist">{{
                    t("settings.medias.fieldArtist")
                  }}</label>
                  <Input id="media-copy-artist" v-model="copyArtist" />
                </div>
                <div class="space-y-2">
                  <label class="text-sm font-medium" for="media-copy-mime">{{
                    t("settings.medias.fieldMimeType")
                  }}</label>
                  <Input id="media-copy-mime" v-model="copyMimeType" />
                </div>
                <div class="space-y-2">
                  <label class="text-sm font-medium" for="media-copy-size">{{
                    t("settings.medias.fieldFileSize")
                  }}</label>
                  <Input
                    id="media-copy-size"
                    v-model="copyFileSize"
                    inputmode="numeric"
                  />
                </div>
                <div class="space-y-2 sm:col-span-2">
                  <label
                    class="text-sm font-medium"
                    for="media-copy-modified"
                    >{{ t("settings.medias.fieldFileModifiedAt") }}</label
                  >
                  <Input
                    id="media-copy-modified"
                    v-model="copyModifiedAt"
                    type="datetime-local"
                  />
                </div>
              </div>
              <p v-if="copyError" role="alert" class="text-sm text-destructive">
                {{ copyError }}
              </p>
              <div class="flex justify-end gap-3">
                <Button
                  type="button"
                  variant="outline"
                  :disabled="savingCopy"
                  @click="addCopyOpen = false"
                  >{{ t("common.cancel") }}</Button
                >
                <Button type="submit" :disabled="savingCopy">{{
                  savingCopy ? t("common.saving") : t("settings.medias.addFile")
                }}</Button>
              </div>
            </form>
          </DialogContent>
        </DialogPortal>
      </DialogRoot>
    </template>
  </Teleport>
</template>
