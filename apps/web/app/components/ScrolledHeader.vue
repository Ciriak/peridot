<script setup lang="ts">
import { useIntersectionObserver } from "@vueuse/core";
import { Icon } from "@iconify/vue/offline";
import { Button } from "@peridot/ui/components/ui/button";
import { ScrollingText } from "@peridot/ui/components/ui/scrolling-text";
import { inject, ref, watch } from "vue";
import { icons } from "../lib/icons";
import { MAIN_SCROLL_ELEMENT_KEY } from "../lib/main-scroll";
import { shouldShowScrolledHeader } from "../lib/scrolled-header";
import BackButton from "./BackButton.vue";
import FadeInImage from "./FadeInImage.vue";

const props = withDefaults(
  defineProps<{
    title: string;
    playable: boolean;
    playbackActive: boolean;
    playLabel: string;
    pauseLabel: string;
    coverUrl?: string | null;
    coverFadeIn?: boolean;
  }>(),
  {
    coverFadeIn: true,
  },
);
const emit = defineEmits<{
  play: [];
}>();

const headerCard = ref<HTMLElement | null>(null);
const visible = ref(false);
const coverFailed = ref(false);
const scrollElement = inject(MAIN_SCROLL_ELEMENT_KEY, null);

watch(
  () => props.coverUrl,
  () => {
    coverFailed.value = false;
  },
);

useIntersectionObserver(
  headerCard,
  ([entry]) => {
    if (!entry) return;
    const rootTop =
      entry.rootBounds?.top ??
      scrollElement?.value?.getBoundingClientRect().top ??
      0;
    visible.value = shouldShowScrolledHeader({
      isIntersecting: entry.isIntersecting,
      targetBottom: entry.boundingClientRect.bottom,
      rootTop,
    });
  },
  {
    root: scrollElement ?? undefined,
    threshold: 0,
  },
);
</script>

<template>
  <div ref="headerCard">
    <slot />
  </div>

  <Teleport to="body">
    <div
      v-if="visible"
      role="region"
      :aria-label="title"
      class="fixed inset-x-0 top-16 -mt-px z-20 border-b bg-card/95 text-card-foreground md:left-56"
    >
      <div
        class="mx-auto flex h-14 w-full max-w-7xl items-center gap-3 px-4 md:px-6"
      >
        <BackButton icon-only />
        <div
          v-if="coverUrl"
          aria-hidden="true"
          class="relative hidden size-9 shrink-0 items-center justify-center overflow-hidden rounded-md bg-muted text-muted-foreground md:flex"
        >
          <Icon :icon="icons.album" class="size-4" />
          <FadeInImage
            v-if="!coverFailed"
            :src="coverUrl"
            :fade-in="coverFadeIn"
            loading="eager"
            class="absolute inset-0"
            @error="coverFailed = true"
          />
        </div>
        <ScrollingText class="min-w-0 flex-1 text-sm font-semibold">
          {{ title }}
        </ScrollingText>
        <Button
          size="icon"
          class="rounded-full"
          :disabled="!playable"
          :aria-label="playbackActive ? pauseLabel : playLabel"
          @click="emit('play')"
        >
          <Icon
            :icon="playbackActive ? icons.pause : icons.play"
            aria-hidden="true"
            class="size-5"
          />
        </Button>
      </div>
    </div>
  </Teleport>
</template>
