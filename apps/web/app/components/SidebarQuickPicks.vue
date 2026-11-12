<script setup lang="ts">
import { PeridotSpinner } from "@peridot/ui/components/ui/spinner";
import { computed } from "vue";
import { useInteractionFrozenList } from "../composables/use-interaction-frozen-list";
import { useQuickPicks } from "../composables/use-quick-picks";
import { resolveQuickPicks } from "../lib/quick-picks";
import QuickPickTile from "./QuickPickTile.vue";

const { items, loading, loaded, error } = useQuickPicks();
const resolvedItems = computed(() => resolveQuickPicks(items.value));
const {
  items: visibleItems,
  beginPointerInteraction,
  endPointerInteraction,
  beginFocusInteraction,
  endFocusInteraction,
} = useInteractionFrozenList(resolvedItems);

function handleFocusOut(event: FocusEvent) {
  const currentTarget = event.currentTarget;
  const nextTarget = event.relatedTarget;
  if (
    currentTarget instanceof Node &&
    nextTarget instanceof Node &&
    currentTarget.contains(nextTarget)
  ) {
    return;
  }
  endFocusInteraction();
}
</script>

<template>
  <section aria-labelledby="quick-picks-heading">
    <h2
      id="quick-picks-heading"
      class="mb-3 text-xs font-medium text-muted-foreground"
    >
      Quick pick
    </h2>
    <div
      v-if="loading && !visibleItems.length"
      role="status"
      class="flex items-center gap-2 text-xs text-muted-foreground"
    >
      <PeridotSpinner class="size-4" />
      Loading quick picks
    </div>
    <p
      v-else-if="error && !visibleItems.length"
      role="alert"
      class="text-xs text-muted-foreground"
    >
      Quick picks are unavailable.
    </p>
    <div
      v-else-if="visibleItems.length"
      class="flex flex-col gap-2"
      @pointerenter="beginPointerInteraction"
      @pointerleave="endPointerInteraction"
      @focusin="beginFocusInteraction"
      @focusout="handleFocusOut"
    >
      <QuickPickTile
        v-for="item in visibleItems"
        :key="item.key"
        :item="item"
      />
    </div>
    <p v-else-if="loaded" class="text-xs text-muted-foreground">
      Play something to see your quick picks here.
    </p>
  </section>
</template>
