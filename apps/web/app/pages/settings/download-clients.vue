<script setup lang="ts">
import {
  DialogRoot,
  DialogPortal,
  DialogOverlay,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "reka-ui";
import { Icon } from "@iconify/vue/offline";
import { icons } from "../../lib/icons";
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
const clientTypes = [{ kind: "qbittorrent", label: "qBittorrent" }] as const;
const kind = ref<DownloadClientInput["kind"]>();
const saved = computed(() =>
  clients.data.value?.find((c) => c.id === id.value),
);
const keepKey = computed(
  () => saved.value?.hasApiKey && saved.value.url === form.value.url,
);
const blank = () => ({ name: "", url: "", apiKey: "" });
const form = ref(blank());
function edit(c?: DownloadClientResponse) {
  kind.value = c?.kind;
  id.value = c?.id || "";
  form.value = {
    name: c?.name || "",
    url: c?.url || "",
    apiKey: "",
  };
  open.value = true;
  notice.value = "";
  error.value = "";
}
async function act(action: "test" | "save" | "remove", removeId?: string) {
  if (action !== "remove" && !kind.value) return;
  busy.value = true;
  notice.value = "";
  error.value = "";
  try {
    const { apiKey, ...fields } = form.value;
    const input: DownloadClientInput = {
      ...fields,
      kind: kind.value || "qbittorrent",
      ...(apiKey ? { apiKey } : {}),
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
      <Button :disabled="busy" @click="edit()"
        ><Icon :icon="icons.plus" aria-hidden="true" />{{
          t("clients.add")
        }}</Button
      >
    </div>
    <p v-if="clients.error.value || (!open && error)" role="alert">
      {{ error || clients.error.value?.message }}
    </p>
    <div
      v-for="c in clients.data.value"
      :key="c.id"
      class="flex items-center gap-2 rounded-md border p-3"
    >
      <div class="flex-1">
        <p>{{ c.name }}</p>
        <p v-if="!c.hasApiKey">{{ t("clients.keyRequired") }}</p>
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
    <DialogRoot v-model:open="open"
      ><DialogPortal>
        <DialogOverlay class="fixed inset-0 z-50 bg-background/80" />
        <DialogContent
          class="fixed left-1/2 top-1/2 z-50 max-h-svh w-full max-w-md -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-lg border bg-card p-6 text-card-foreground shadow-lg"
        >
          <DialogTitle class="text-lg font-semibold">{{
            kind
              ? clientTypes.find((c) => c.kind === kind)?.label
              : t("clients.add")
          }}</DialogTitle>
          <DialogDescription class="text-sm text-muted-foreground">{{
            t(kind ? "clients.keyHelp" : "clients.chooseType")
          }}</DialogDescription>
          <div v-if="!kind" class="mt-4 grid gap-2">
            <Button
              v-for="clientType in clientTypes"
              :key="clientType.kind"
              variant="outline"
              class="justify-start"
              @click="kind = clientType.kind"
              >{{ clientType.label }}</Button
            >
            <Button variant="ghost" @click="open = false">{{
              t("common.cancel")
            }}</Button>
          </div>
          <form v-else class="mt-4 space-y-3" @submit.prevent="act('save')">
            <label class="block"
              >{{ t("indexer.name") }}<Input v-model="form.name" required
            /></label>
            <label class="block"
              >{{ t("clients.url")
              }}<Input v-model="form.url" type="url" required
            /></label>
            <label class="block"
              >{{ t("indexer.apiKey")
              }}<Input
                v-model="form.apiKey"
                type="password"
                autocomplete="new-password"
                :required="!keepKey"
                :placeholder="keepKey ? t('clients.keepKey') : ''"
            /></label>
            <p v-if="error" role="alert">{{ error }}</p>
            <p v-if="notice" role="status">{{ notice }}</p>
            <div class="flex gap-2">
              <Button
                type="button"
                variant="outline"
                :disabled="busy"
                @click="act('test')"
                >{{ t("clients.test") }}</Button
              ><Button :disabled="busy" type="submit">{{
                t("common.save")
              }}</Button
              ><Button
                type="button"
                variant="ghost"
                :disabled="busy"
                @click="id ? (open = false) : edit()"
                >{{ t(id ? "common.cancel" : "common.back") }}</Button
              >
            </div>
          </form>
        </DialogContent></DialogPortal
      ></DialogRoot
    >
  </section>
</template>
