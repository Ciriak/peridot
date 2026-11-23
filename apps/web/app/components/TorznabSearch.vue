<script setup lang="ts">
import { useI18n } from "#imports";
import { computed, ref, watch } from "vue";
import { useQuery } from "@tanstack/vue-query";
import { Button } from "@peridot/ui/components/ui/button";
import { useSession } from "../composables/use-session";
import { useServer } from "../composables/use-server";
import { useLibraryPlayer } from "../composables/use-library-player";
import { useQueryScope } from "../composables/use-query-scope";
import { torznabClient } from "../lib/peridot-client";
const { t } = useI18n();
const autoplay = ref(false);
const props = defineProps<{ query: string }>();
const { address } = useServer(),
  { token } = useSession(),
  { scope } = useQueryScope();
const client = computed(() => torznabClient(address.value!, token.value!));
const { playCollection } = useLibraryPlayer();
const active = ref(""),
  term = ref(""),
  busy = ref(false),
  error = ref("");
const config = useQuery({
  queryKey: computed(() => ["torznab", scope.value]),
  queryFn: () => client.value.config(),
  refetchOnMount: "always",
  enabled: computed(() => Boolean(address.value && token.value)),
  retry: false,
});
const results = useQuery({
  queryKey: computed(() => ["torznab-results", scope.value, term.value]),
  queryFn: () => client.value.search(term.value),
  enabled: computed(() => Boolean(config.data.value?.enabled && term.value)),
  retry: false,
});
const status = useQuery({
  queryKey: computed(() => ["torznab-import", scope.value, active.value]),
  queryFn: () => client.value.status(active.value),
  enabled: computed(() => Boolean(active.value)),
  refetchInterval: (q) => (q.state.data?.trackIds.length ? false : 5000),
  retry: false,
});
watch(
  () => props.query,
  () => {
    term.value = "";
    error.value = "";
  },
);
watch(scope, () => {
  active.value = "";
  term.value = "";
});
watch(
  () => status.data.value,
  (value) => {
    if (autoplay.value && value?.trackIds.length) {
      autoplay.value = false;
      playCollection(value.trackIds);
    }
  },
);
async function add(id: string, play = false) {
  busy.value = true;
  error.value = "";
  try {
    await client.value.add(id);
    autoplay.value = play;
    active.value = id;
  } catch (e) {
    error.value = e instanceof Error ? e.message : t("torznab.failed");
  } finally {
    busy.value = false;
  }
}
</script>
<template>
  <section v-if="config.data.value?.enabled" class="space-y-3">
    <Button
      variant="outline"
      :disabled="results.isFetching.value"
      @click="term === query ? results.refetch() : (term = query)"
      >{{ t("torznab.search") }}</Button
    >
    <p v-if="results.isFetching.value" role="status">
      {{ t("torznab.loading") }}
    </p>
    <p v-if="results.error.value || error || status.error.value" role="alert">
      {{ error || results.error.value?.message || status.error.value?.message }}
    </p>
    <p v-if="term && results.data.value?.length === 0">
      {{ t("torznab.empty") }}
    </p>
    <div
      v-for="release in results.data.value"
      :key="release.id"
      class="flex items-center justify-between gap-3"
    >
      <div>
        <p>{{ release.title }}</p>
        <p class="text-xs text-muted-foreground">{{ release.sourceName }}</p>
        <p class="text-sm text-muted-foreground">
          <span v-if="release.seeders !== null"
            >{{ t("torznab.seeders", { count: release.seeders }) }} </span
          ><span v-if="release.bytes !== null"
            >{{ Math.round(release.bytes / 1048576) }} MiB</span
          >
        </p>
      </div>
      <Button
        variant="outline"
        v-if="release.canImport"
        :disabled="busy || active === release.id"
        @click="add(release.id)"
        >{{ t("torznab.add") }}</Button
      >
      <Button
        variant="outline"
        v-if="release.canImport"
        :disabled="busy || active === release.id"
        @click="add(release.id, true)"
        >{{ t("torznab.autoplay") }}</Button
      >
    </div>
    <template v-if="active && status.data.value">
      <Button
        v-if="status.data.value.trackIds.length"
        @click="playCollection(status.data.value.trackIds)"
        >{{ t("torznab.play") }}</Button
      >
      <p v-else role="status">
        {{
          status.data.value.progress === 1
            ? t("torznab.indexing")
            : status.data.value.state +
              " · " +
              Math.round(status.data.value.progress * 100) +
              "%"
        }}
      </p>
    </template>
  </section>
</template>
