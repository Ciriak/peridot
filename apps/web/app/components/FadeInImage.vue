<script setup lang="ts">
import { ref, watch } from "vue";

const props = withDefaults(
  defineProps<{
    src: string;
    loading?: "eager" | "lazy";
    fadeIn?: boolean;
  }>(),
  {
    loading: "lazy",
    fadeIn: true,
  },
);
const emit = defineEmits<{
  error: [event: Event];
}>();

const loaded = ref(false);

watch(
  () => props.src,
  () => {
    loaded.value = false;
  },
);
</script>

<template>
  <img
    :src="src"
    alt=""
    :loading="loading"
    decoding="async"
    class="size-full object-cover motion-reduce:transition-none"
    :class="[
      loaded ? 'opacity-100' : 'opacity-0',
      { 'transition-opacity duration-300 ease-out': fadeIn },
    ]"
    @load="loaded = true"
    @error="emit('error', $event)"
  />
</template>
