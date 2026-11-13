<script setup lang="ts">
import { navigateTo, useHead, useI18n } from "#imports";
import { Icon } from "@iconify/vue/offline";
import { Badge } from "@peridot/ui/components/ui/badge";
import { Button } from "@peridot/ui/components/ui/button";
import { PeridotSpinner } from "@peridot/ui/components/ui/spinner";
import { onMounted, ref } from "vue";
import PlaylistCard from "../components/PlaylistCard.vue";
import PlaylistNameDialog from "../components/PlaylistNameDialog.vue";
import {
  usePlaylistActions,
  usePlaylistList,
} from "../composables/use-playlists";
import { icons } from "../lib/icons";

const { t } = useI18n();
useHead({ title: t("page.playlists.title") });

const {
  items,
  totalCount,
  loaded,
  loading,
  loadingMore,
  hasMore,
  error,
  load,
  loadMore,
} = usePlaylistList(50);
const actions = usePlaylistActions();
const createOpen = ref(false);
const creating = ref(false);
const createError = ref<string | null>(null);

async function create(name: string) {
  creating.value = true;
  createError.value = null;
  try {
    const playlist = await actions.create(name);
    createOpen.value = false;
    await navigateTo(`/playlists/${playlist.id}`);
  } catch (reason) {
    createError.value = actions.messageFor(reason, "error.playlistCreate");
  } finally {
    creating.value = false;
  }
}

onMounted(() => void load());
</script>

<template>
  <div class="flex flex-wrap items-start justify-between gap-4">
    <div class="space-y-2">
      <h1 class="text-2xl font-semibold tracking-tight">
        {{ t("navigation.playlists") }}
      </h1>
      <p class="text-sm text-muted-foreground">
        {{ t("page.playlists.description") }}
      </p>
    </div>
    <Button @click="createOpen = true">
      <Icon :icon="icons.plus" aria-hidden="true" class="size-4" />
      {{ t("page.playlists.create") }}
    </Button>
  </div>

  <section aria-labelledby="playlists-heading" class="space-y-4">
    <div class="flex items-center justify-between gap-4">
      <h2 id="playlists-heading" class="text-lg font-semibold">
        {{ t("page.playlists.all") }}
      </h2>
      <Badge variant="secondary">
        {{ loading ? t("common.loading") : totalCount }}
      </Badge>
    </div>
    <div
      v-if="loading && !items.length"
      role="status"
      class="flex items-center gap-3 rounded-lg border p-6 text-sm text-muted-foreground"
    >
      <PeridotSpinner :label="t('page.playlists.loading')" />
      {{ t("page.playlists.loading") }}
    </div>
    <div
      v-else-if="error && !items.length"
      role="alert"
      class="space-y-3 rounded-lg border p-6 text-sm"
    >
      <p>{{ error }}</p>
      <Button variant="outline" @click="load(true)">
        {{ t("common.tryAgain") }}
      </Button>
    </div>
    <div
      v-else-if="items.length"
      class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5"
    >
      <PlaylistCard
        v-for="playlist in items"
        :key="playlist.id"
        :playlist="playlist"
      />
      <div v-if="hasMore" class="col-span-full flex justify-center">
        <Button variant="outline" :disabled="loadingMore" @click="loadMore">
          {{
            loadingMore
              ? t("page.playlists.loadingMore")
              : t("page.playlists.loadMore")
          }}
        </Button>
      </div>
    </div>
    <div
      v-else-if="loaded"
      class="space-y-4 rounded-lg border bg-card p-6 text-card-foreground"
    >
      <div class="flex items-center gap-3">
        <Icon
          :icon="icons.playlist"
          aria-hidden="true"
          class="size-6 text-muted-foreground"
        />
        <div>
          <h2 class="font-medium">{{ t("page.playlists.emptyTitle") }}</h2>
          <p class="text-sm text-muted-foreground">
            {{ t("page.playlists.emptyDescription") }}
          </p>
        </div>
      </div>
      <Button @click="createOpen = true">
        {{ t("page.playlists.create") }}
      </Button>
    </div>
  </section>

  <PlaylistNameDialog
    v-model:open="createOpen"
    mode="create"
    :pending="creating"
    :error="createError"
    @submit="create"
  />
</template>
