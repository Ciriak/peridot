<script setup lang="ts">
import { artistRoute } from "../lib/library";

defineProps<{ artists: readonly string[] }>();
</script>

<template>
  <span v-if="artists.length">
    <template v-for="(artist, index) in artists" :key="artist">
      <NuxtLink
        :to="artistRoute({ name: artist })"
        class="rounded-sm hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        @dblclick.stop
        >{{ artist }}</NuxtLink
      ><template v-if="index < artists.length - 1">, </template>
    </template>
  </span>
  <template v-else>—</template>
</template>
