<script setup lang="ts">
import { definePageMeta } from "#imports";

definePageMeta({ layout: "settings" });
</script>

<template>
  <div class="space-y-2">
    <h2 class="text-2xl font-semibold tracking-tight">Plugins</h2>
    <p class="text-sm text-muted-foreground">
      Extend Peridot with services you control.
    </p>
  </div>
  <section
    aria-label="Plugins"
    class="rounded-lg border bg-card p-6 text-card-foreground"
  >
    <h3 class="text-lg font-semibold">Optional connections</h3>
    <p class="mt-2 text-sm text-muted-foreground">
      Plugins will use your own credentials and services. No integrations are
      connected.
    </p>
  </section>
</template>
