import { computed, ref, shallowRef, watch, type Ref } from "vue";

export function useInteractionFrozenList<T>(
  source: Readonly<Ref<readonly T[]>>,
) {
  const displayedItems = shallowRef<readonly T[]>(source.value);
  const pointerInteracting = ref(false);
  const focusInteracting = ref(false);
  const interacting = computed(
    () => pointerInteracting.value || focusInteracting.value,
  );

  watch(
    source,
    (items) => {
      if (!interacting.value) displayedItems.value = items;
    },
    { flush: "sync" },
  );
  watch(
    interacting,
    (active) => {
      if (!active) displayedItems.value = source.value;
    },
    { flush: "sync" },
  );

  return {
    items: displayedItems,
    beginPointerInteraction() {
      pointerInteracting.value = true;
    },
    endPointerInteraction() {
      pointerInteracting.value = false;
    },
    beginFocusInteraction() {
      focusInteracting.value = true;
    },
    endFocusInteraction() {
      focusInteracting.value = false;
    },
  };
}
