<script setup lang="ts">
import { computed } from "vue";
import { useI18n } from "#imports";
import { useQuery } from "@tanstack/vue-query";
import { Input } from "@peridot/ui/components/ui/input";
import type { SourceResponse } from "@peridot/contracts";
import { useServer } from "../composables/use-server";
import { useSession } from "../composables/use-session";
import { useQueryScope } from "../composables/use-query-scope";
import { downloadClientsApi } from "../lib/peridot-client";
const props = defineProps<{ sources: SourceResponse[] }>();
const form = defineModel<{
  downloadClientId: string;
  category: string;
  tags: string;
  categoryPath: boolean;
  folderId: string;
  savePath: string;
  name: string;
  apiKey: string;
  url: string;
}>({ required: true });
const { t } = useI18n(),
  { address } = useServer(),
  { token } = useSession(),
  { scope } = useQueryScope();
const api = computed(() => downloadClientsApi(address.value!, token.value!));
const clients = useQuery({
  queryKey: computed(() => ["download-clients", scope.value]),
  queryFn: () => api.value.list(),
  enabled: computed(() => Boolean(address.value && token.value)),
  refetchOnMount: "always",
});
const options = useQuery({
  queryKey: computed(() => [
    "download-client-options",
    scope.value,
    form.value.downloadClientId,
  ]),
  queryFn: () => api.value.options(form.value.downloadClientId),
  enabled: computed(() => Boolean(form.value.downloadClientId)),
  retry: false,
});
function switchClient(event: Event) {
  form.value = {
    ...form.value,
    downloadClientId: (event.target as HTMLSelectElement).value,
    category: "",
    tags: "",
    categoryPath: false,
    savePath: "",
  };
}
</script>
<template>
  <label class="block space-y-1"
    ><span>{{ t("clients.client") }}</span
    ><select
      class="w-full rounded-md border bg-background p-2"
      :value="form.downloadClientId"
      @change="switchClient"
    >
      <option value="">{{ t("clients.searchOnly") }}</option>
      <option v-for="c in clients.data.value" :key="c.id" :value="c.id">
        {{ c.name }}
      </option>
    </select></label
  >
  <NuxtLink class="text-sm underline" to="/settings/download-clients">{{
    t("clients.manage")
  }}</NuxtLink>
  <template v-if="form.downloadClientId">
    <p v-if="options.error.value" role="alert">
      {{ t("clients.optionsFailed") }}
    </p>
    <label class="block space-y-1"
      ><span>{{ t("clients.category") }}</span
      ><select
        v-model="form.category"
        class="w-full rounded-md border bg-background p-2"
        @change="form.categoryPath = Boolean(form.category)"
      >
        <option value="">{{ t("clients.noCategory") }}</option>
        <option
          v-for="c in new Set(
            [...(options.data.value?.categories || []), form.category].filter(
              Boolean,
            ),
          )"
          :key="c"
        >
          {{ c }}
        </option>
      </select></label
    >
    <label v-if="form.category" class="flex gap-2"
      ><input v-model="form.categoryPath" type="checkbox" />{{
        t("clients.categoryPath")
      }}</label
    >
    <label class="block space-y-1"
      ><span>{{ t("clients.tags") }}</span
      ><Input v-model="form.tags" list="qbit-tags" /><datalist id="qbit-tags">
        <option
          v-for="tag in options.data.value?.tags"
          :key="tag"
          :value="tag"
        /></datalist
    ></label>
    <label class="block space-y-1"
      ><span>{{ t("indexer.folder") }}</span
      ><select
        v-model="form.folderId"
        class="w-full rounded-md border bg-background p-2"
      >
        <option disabled value="">{{ t("indexer.chooseFolder") }}</option>
        <option
          v-for="f in props.sources.filter(
            (s) => s.kind === 'path' && !s.removal,
          )"
          :key="f.id"
          :value="f.id"
        >
          {{ f.name || f.path }}
        </option>
      </select></label
    >
    <label v-if="!form.categoryPath" class="block space-y-1"
      ><span>{{ t("indexer.savePath") }}</span
      ><Input v-model="form.savePath"
    /></label>
  </template>
</template>
