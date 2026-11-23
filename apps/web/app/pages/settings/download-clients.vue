<script setup lang="ts">
import { computed, ref } from "vue";
import { definePageMeta, useI18n } from "#imports";
import { useQuery, useQueryClient } from "@tanstack/vue-query";
import { Button } from "@peridot/ui/components/ui/button";
import { Input } from "@peridot/ui/components/ui/input";
import type {
  DownloadClientInput,
  DownloadClientResponse,
} from "@peridot/contracts";
import { downloadClientsApi } from "../../lib/peridot-client";
import { useServer } from "../../composables/use-server";
import { useSession } from "../../composables/use-session";
import { useUser } from "../../composables/use-user";
import { useQueryScope } from "../../composables/use-query-scope";
definePageMeta({ layout: "settings" });
const { t } = useI18n(),
  { address } = useServer(),
  { token } = useSession(),
  { user } = useUser(),
  { scope } = useQueryScope();
const api = computed(() => downloadClientsApi(address.value!, token.value!));
const queryClient = useQueryClient();
const clients = useQuery({
  queryKey: computed(() => ["download-clients", scope.value]),
  queryFn: () => api.value.list(),
  enabled: computed(() =>
    Boolean(address.value && token.value && user.value?.role === "admin"),
  ),
});
const open = ref(false),
  id = ref(""),
  busy = ref(false),
  notice = ref(""),
  error = ref("");
const blank = () => ({ name: "", url: "", username: "", password: "" });
const form = ref(blank());
function edit(c?: DownloadClientResponse) {
  id.value = c?.id || "";
  form.value = {
    name: c?.name || "",
    url: c?.url || "",
    username: c?.username || "",
    password: "",
  };
  open.value = true;
  notice.value = "";
  error.value = "";
}
async function act(action: "test" | "save" | "remove", removeId?: string) {
  busy.value = true;
  notice.value = "";
  error.value = "";
  try {
    const { password, ...fields } = form.value;
    const input: DownloadClientInput = {
      ...fields,
      kind: "qbittorrent",
      ...(password || !id.value ? { password } : {}),
    };
    if (action === "test") {
      const opts = await api.value.test(input, id.value || undefined);
      notice.value = t("clients.connected", {
        categories: opts.categories.length,
        tags: opts.tags.length,
      });
      return;
    }
    if (action === "remove") await api.value.remove(removeId!);
    else await api.value.save(input, id.value || undefined);
    open.value = false;
    form.value = blank();
    await clients.refetch();
    await queryClient.invalidateQueries({
      queryKey: ["download-client-options", scope.value],
    });
  } catch {
    error.value = t(
      action === "remove"
        ? "clients.removeFailed"
        : action === "test"
          ? "clients.testFailed"
          : "clients.saveFailed",
    );
  } finally {
    busy.value = false;
  }
}
</script>
<template>
  <section v-if="user?.role === 'admin'" class="space-y-4">
    <div class="flex items-center justify-between">
      <h1 class="text-xl font-semibold">{{ t("clients.title") }}</h1>
      <Button :disabled="busy" @click="edit()">{{ t("clients.add") }}</Button>
    </div>
    <p v-if="clients.error.value || error" role="alert">
      {{ error || clients.error.value?.message }}
    </p>
    <div
      v-for="c in clients.data.value"
      :key="c.id"
      class="flex items-center gap-2 rounded-md border p-3"
    >
      <div class="flex-1">
        <p>{{ c.name }}</p>
        <p class="text-sm text-muted-foreground">{{ c.url }}</p>
      </div>
      <Button variant="outline" :disabled="busy" @click="edit(c)">{{
        t("common.edit")
      }}</Button
      ><Button
        variant="outline"
        :disabled="busy"
        @click="act('remove', c.id)"
        >{{ t("common.remove") }}</Button
      >
    </div>
    <form v-if="open" class="max-w-md space-y-3" @submit.prevent="act('save')">
      <label class="block"
        >{{ t("indexer.name") }}<Input v-model="form.name" required
      /></label>
      <label class="block"
        >{{ t("clients.url") }}<Input v-model="form.url" type="url" required
      /></label>
      <label class="block"
        >{{ t("indexer.username")
        }}<Input v-model="form.username" autocomplete="off"
      /></label>
      <label class="block"
        >{{ t("indexer.password")
        }}<Input
          v-model="form.password"
          type="password"
          autocomplete="new-password"
          :placeholder="id ? t('clients.keepPassword') : ''"
      /></label>
      <p v-if="notice" role="status">{{ notice }}</p>
      <div class="flex gap-2">
        <Button
          type="button"
          variant="outline"
          :disabled="busy"
          @click="act('test')"
          >{{ t("clients.test") }}</Button
        ><Button :disabled="busy" type="submit">{{ t("common.save") }}</Button
        ><Button
          type="button"
          variant="ghost"
          :disabled="busy"
          @click="open = false"
          >{{ t("common.cancel") }}</Button
        >
      </div>
    </form>
  </section>
</template>
