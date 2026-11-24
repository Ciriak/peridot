<script setup lang="ts">
import { useI18n } from "#imports";
import type { TorznabRelease } from "@peridot/contracts";
import { Icon } from "@iconify/vue/offline";
import { Button } from "@peridot/ui/components/ui/button";
import { ProgressCircle } from "@peridot/ui/components/ui/progress-circle";
import { ScrollingText } from "@peridot/ui/components/ui/scrolling-text";
import { PeridotSpinner } from "@peridot/ui/components/ui/spinner";
import { computed } from "vue";
import { icons } from "../lib/icons";
import type { SearchResultType } from "../lib/search-results";
import {
  torznabImportPercent,
  torznabTransferPhase,
  type TorznabImportRowState,
} from "../lib/torznab-import-status";
import SearchResultTag from "./SearchResultTag.vue";
import SearchSourceIcons from "./SearchSourceIcons.vue";

const props = defineProps<{
  release: TorznabRelease;
  importState: TorznabImportRowState | null;
}>();
const emit = defineEmits<{ add: [release: TorznabRelease] }>();
const { t } = useI18n();

const resultType = computed<SearchResultType>(() => {
  if (props.release.mediaType === "audiobook") return "audiobook";
  if (props.release.mediaType === "podcast") return "podcast";
  if (props.release.mediaType === "music") return "music";
  return "release";
});
const placeholderIcon = computed(() => {
  if (resultType.value === "audiobook") return icons.book;
  if (resultType.value === "podcast") return icons.podcast;
  if (resultType.value === "music") return icons.music;
  return icons.album;
});
const metadata = computed(() => {
  const parts = [props.release.sourceName];
  if (props.release.seeders !== null) {
    parts.push(t("torznab.seeders", { count: props.release.seeders }));
  }
  if (props.release.bytes !== null) {
    parts.push(`${Math.round(props.release.bytes / 1048576)} MiB`);
  }
  return parts.join(" · ");
});
const progressStatus = computed(() => {
  if (props.importState?.kind === "tracking") return props.importState.status;
  if (props.importState?.kind === "failed") return props.importState.status;
  return null;
});
const statusLabel = computed(() => {
  const state = props.importState;
  if (!state) return "";
  if (state.kind === "adding") return t("torznab.adding");
  if (state.kind === "ready") return t("torznab.ready");
  if (state.kind === "already-added") return t("torznab.alreadyAdded");
  if (state.kind === "failed") return t("torznab.failed");
  const status = state.status;
  const percent = torznabImportPercent(status.progress);
  switch (torznabTransferPhase(status.state, status.progress)) {
    case "queued":
      return t("torznab.queued");
    case "metadata":
      return t("torznab.fetchingMetadata");
    case "checking":
      return t("torznab.checking", { percent });
    case "paused":
      return t("torznab.paused", { percent });
    case "indexing":
      return t("torznab.indexingInline");
    case "downloading":
      return t("torznab.downloading", { percent });
    default:
      return t("torznab.inProgress", { percent });
  }
});
const detail = computed(() =>
  [metadata.value, statusLabel.value].filter(Boolean).join(" · "),
);
const incomplete = computed(
  () =>
    props.importState?.kind === "adding" ||
    props.importState?.kind === "tracking",
);
const settled = computed(
  () =>
    props.importState?.kind === "ready" ||
    props.importState?.kind === "already-added",
);
const failed = computed(() => props.importState?.kind === "failed");
const disabled = computed(
  () =>
    Boolean(props.importState) &&
    !(props.importState?.kind === "failed" && props.importState.retryable),
);
const actionLabel = computed(() => {
  if (props.importState?.kind === "failed" && props.importState.retryable) {
    return t("torznab.retry");
  }
  return statusLabel.value || t("torznab.add");
});
const progressPercent = computed(() =>
  progressStatus.value
    ? torznabImportPercent(progressStatus.value.progress)
    : 0,
);
</script>

<template>
  <article
    role="listitem"
    class="group flex min-h-14 min-w-0 items-center gap-2 px-2 py-1 text-card-foreground"
    :class="settled ? 'opacity-60' : undefined"
  >
    <div class="group/release-cover relative size-10 shrink-0">
      <div
        aria-hidden="true"
        class="relative flex size-10 items-center justify-center overflow-hidden rounded-md bg-muted text-muted-foreground group-hover/release-cover:text-foreground"
      >
        <Icon :icon="placeholderIcon" class="size-5" />
      </div>
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        class="absolute inset-0 size-full cursor-pointer rounded-md bg-background/70 opacity-0 transition-opacity hover:bg-background/70 hover:text-foreground focus-visible:opacity-100 group-hover/release-cover:opacity-100 group-focus-within/release-cover:opacity-100 dark:hover:bg-background/70"
        :class="importState ? 'opacity-100 disabled:opacity-100' : undefined"
        :aria-busy="incomplete"
        :aria-label="actionLabel"
        :title="actionLabel"
        :disabled="disabled"
        @click="emit('add', release)"
      >
        <PeridotSpinner
          v-if="importState?.kind === 'adding'"
          :label="actionLabel"
          class="size-6"
        />
        <ProgressCircle
          v-else-if="progressStatus"
          size="sm"
          :value="progressPercent"
          :label="statusLabel"
          :variant="failed ? 'destructive' : 'primary'"
        />
        <Icon
          v-else-if="settled"
          :icon="icons.check"
          aria-hidden="true"
          class="text-foreground"
        />
        <Icon
          v-else-if="failed"
          :icon="icons.warning"
          aria-hidden="true"
          class="text-destructive"
        />
        <Icon
          v-else
          :icon="icons.download"
          aria-hidden="true"
          class="text-foreground"
        />
      </Button>
    </div>

    <div class="min-w-0 flex-1">
      <div class="flex min-w-0 items-center gap-2">
        <h3 class="min-w-0 text-sm font-medium">
          <ScrollingText class="w-full">{{ release.title }}</ScrollingText>
        </h3>
        <SearchResultTag class="shrink-0" :type="resultType" />
      </div>
      <ScrollingText
        class="w-full text-xs"
        :class="failed ? 'text-destructive' : 'text-muted-foreground'"
      >
        {{ detail }}
      </ScrollingText>
    </div>

    <div class="ml-auto flex shrink-0 items-center gap-2">
      <SearchSourceIcons :source-kinds="['torznab']" />
    </div>
  </article>
</template>
