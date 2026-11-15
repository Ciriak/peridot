import { useState } from "#imports";
import { computed, watch } from "vue";
import {
  defaultLibrarySettings,
  readPersistedLibrarySettings,
  savePersistedLibrarySettings,
  type LibrarySettings,
} from "../lib/library-settings";
import { useQueryScope } from "./use-query-scope";

export function useLibrarySettings() {
  const { scope } = useQueryScope();
  const settings = useState<LibrarySettings>(
    "library-settings",
    defaultLibrarySettings,
  );

  function load() {
    if (!import.meta.client) {
      settings.value = defaultLibrarySettings();
      return;
    }
    settings.value = scope.value
      ? readPersistedLibrarySettings(window.localStorage, scope.value)
      : defaultLibrarySettings();
  }

  function setLikedTitlesOffline(value: boolean) {
    settings.value = {
      ...settings.value,
      likedTitlesOffline: value,
    };
    if (import.meta.client && scope.value) {
      savePersistedLibrarySettings(
        window.localStorage,
        scope.value,
        settings.value,
      );
    }
  }

  watch(scope, load, { immediate: true });

  return {
    likedTitlesOffline: computed(() => settings.value.likedTitlesOffline),
    setLikedTitlesOffline,
  };
}
