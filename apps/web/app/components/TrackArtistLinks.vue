<script setup lang="ts">
import ArtistLink from "./ArtistLink.vue";

defineProps<{ artists: readonly string[] }>();
</script>

<template>
  <span v-if="artists.length">
    <template v-for="(artist, index) in artists" :key="artist">
      <ArtistLink :artist="artist" />
      <template v-if="index < artists.length - 1">, </template>
    </template>
  </span>
  <template v-else>—</template>
</template>
