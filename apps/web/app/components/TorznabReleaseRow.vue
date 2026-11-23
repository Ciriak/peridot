<script setup lang="ts">
import { useI18n } from "#imports";
import type { TorznabRelease } from "@peridot/contracts";
import { Icon } from "@iconify/vue/offline";
import { Button } from "@peridot/ui/components/ui/button";
import { ScrollingText } from "@peridot/ui/components/ui/scrolling-text";
import { computed } from "vue";
import { icons } from "../lib/icons";
import SearchResultTag from "./SearchResultTag.vue";
import SearchSourceIcons from "./SearchSourceIcons.vue";

const props = defineProps<{
  release: TorznabRelease;
  busy: boolean;
  imported: boolean;
}>();
const emit = defineEmits<{ add: [release: TorznabRelease] }>();
const { t } = useI18n();

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
</script>

<template>
  <article
    role="listitem"
    class="group flex min-h-14 min-w-0 items-center gap-2 px-2 py-1 text-card-foreground"
  >
    <div class="group/release-cover relative size-10 shrink-0">
      <div
        aria-hidden="true"
        class="relative flex size-10 items-center justify-center overflow-hidden rounded-md bg-muted text-muted-foreground group-hover/release-cover:text-foreground"
      >
        <Icon :icon="icons.album" class="size-5" />
      </div>
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        class="absolute inset-0 size-full cursor-pointer rounded-md bg-background/70 opacity-0 transition-opacity hover:bg-background/70 hover:text-foreground focus-visible:opacity-100 group-hover/release-cover:opacity-100 group-focus-within/release-cover:opacity-100 dark:hover:bg-background/70"
        :aria-busy="busy"
        :aria-label="t('torznab.add')"
        :title="t('torznab.add')"
        :disabled="busy || imported"
        @click="emit('add', release)"
      >
        <Icon
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
        <SearchResultTag class="shrink-0" type="release" />
      </div>
      <ScrollingText class="w-full text-xs text-muted-foreground">
        {{ metadata }}
      </ScrollingText>
    </div>

    <div class="ml-auto flex shrink-0 items-center gap-2">
      <SearchSourceIcons :source-kinds="['torznab']" />
    </div>
  </article>
</template>
