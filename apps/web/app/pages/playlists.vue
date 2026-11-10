<script setup lang="ts">
import { Button } from "@peridot/ui/components/ui/button";
</script>

<template>
  <div class="space-y-2">
    <h1 class="text-2xl font-semibold tracking-tight">Playlists</h1>
    <p class="text-sm text-muted-foreground">
      Organize your music into collections.
    </p>
  </div>
  <section
    aria-label="Playlists"
    class="rounded-lg border bg-card p-6 text-card-foreground"
  >
    <h2 class="text-lg font-semibold">No playlists yet</h2>
    <p class="mt-2 text-sm text-muted-foreground">
      Playlist creation will be available when your library is connected.
    </p>
    <Button as-child variant="outline" class="mt-4"
      ><NuxtLink to="/library">Browse library</NuxtLink></Button
    >
  </section>
</template>
